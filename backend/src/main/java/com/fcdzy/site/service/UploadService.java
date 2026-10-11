package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.config.SiteProperties;
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
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * 图片上传：保存到本地 uploads/yyyy/MM/ 目录并返回可访问 URL。
 */
@Service
public class UploadService {

    private static final List<String> ALLOWED_EXT = List.of("jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico");

    private final SiteProperties siteProperties;

    public UploadService(SiteProperties siteProperties) {
        this.siteProperties = siteProperties;
    }

    public String store(MultipartFile file) {
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
            throw new BizException("仅支持上传图片文件（" + String.join("/", ALLOWED_EXT) + "）");
        }

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
        return siteProperties.getBaseUrl() + "/uploads/" + datePath + "/" + fileName;
    }
}
