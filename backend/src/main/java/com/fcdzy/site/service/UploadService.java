package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.config.SiteProperties;
import com.fcdzy.site.util.OssUtils;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 图片上传服务（后端中转）。
 *
 * - 已配置 OSS（site.oss 四项齐全）→ 上传到阿里云 OSS，返回公共读 URL；
 * - 未配置 OSS → 自动回退到本地磁盘 uploads/（保留原有能力，便于本地开发）。
 *
 * 校验规则（两种模式一致，对应需求 3）：
 * - 只允许 jpg / jpeg / png / webp；
 * - 单张不超过 5MB（site.oss.max-size-bytes，默认 5242880）。
 */
@Service
public class UploadService {

    private static final Logger log = LoggerFactory.getLogger(UploadService.class);

    /** 允许的扩展名：jpg / png / webp（jpeg 与 jpg 等价） */
    private static final List<String> ALLOWED_EXT = List.of("jpg", "jpeg", "png", "webp");

    private final SiteProperties siteProperties;
    private final OssUtils ossUtils;

    public UploadService(SiteProperties siteProperties, OssUtils ossUtils) {
        this.siteProperties = siteProperties;
        this.ossUtils = ossUtils;
    }

    /** 当前存储模式：oss / local */
    public String mode() {
        return ossUtils.mode();
    }

    /** 单张图片大小上限（字节） */
    public long maxSizeBytes() {
        return siteProperties.getOss().getMaxSizeBytes();
    }

    public String store(MultipartFile file) {
        validate(file);
        if (ossUtils.isEnabled()) {
            return ossUtils.upload(file);
        }
        return storeLocally(file);
    }

    /** 统一的图片校验：空文件、格式、大小 */
    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException("上传文件不能为空");
        }
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = "";
        int dot = original.lastIndexOf('.');
        if (dot >= 0) {
            ext = original.substring(dot + 1).toLowerCase(Locale.ROOT);
        }
        if (!ALLOWED_EXT.contains(ext)) {
            throw new BizException("只支持 jpg / png / webp 格式的图片");
        }
        long max = Math.max(1, siteProperties.getOss().getMaxSizeBytes());
        if (file.getSize() > max) {
            // 友好提示：按 MB 显示上限，避免用户看到一串字节数
            throw new BizException("图片不能超过 " + Math.round(max / 1024.0 / 1024.0) + "MB，请压缩后再上传");
        }
    }

    /** 本地磁盘存储（未配置 OSS 时的兜底）：uploads/yyyy/MM/uuid.ext */
    private String storeLocally(MultipartFile file) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String datePath = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy/MM"));
        String fileName = UUID.randomUUID().toString().replace("-", "") + "." + ext;
        Path root = Paths.get(siteProperties.getUploadDir()).toAbsolutePath().normalize();
        Path targetDir = root.resolve(datePath);
        try {
            Files.createDirectories(targetDir);
            Path target = targetDir.resolve(fileName).normalize();
            if (!target.startsWith(root)) {
                throw new BizException("非法的上传路径");
            }
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ex) {
            throw new BizException(500, "图片保存失败：" + ex.getMessage(), 500);
        }
        log.info("本地存储上传成功：{}/{}", datePath, fileName);
        return siteProperties.getBaseUrl() + "/uploads/" + datePath + "/" + fileName;
    }
}
