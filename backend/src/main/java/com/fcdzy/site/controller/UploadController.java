package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.UploadResultDto;
import com.fcdzy.site.service.UploadService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 图片上传接口（后端中转方案：浏览器 → 本服务 → 阿里云 OSS）。
 *
 * 为什么不让前端直传：AK 留在服务端最安全，也不需要 STS 临时凭证；
 * 代价是图片内容要过一次自己的服务器，个人博客流量下完全可接受。
 *
 * 需要登录（/api/admin/** 已在 SecurityConfig 里要求 JWT），
 * 因此「上传必须带身份」这一条由登录态 + 服务端 AK 双重保证。
 */
@RestController
@RequestMapping("/api/admin/upload")
public class UploadController {

    private final UploadService uploadService;

    public UploadController(UploadService uploadService) {
        this.uploadService = uploadService;
    }

    /**
     * 上传单张图片，form-data 字段名固定为 file。
     *
     * 成功返回 { url, name }：
     * - url 是可直接访问的完整地址（OSS 公共读 URL，或本地 /uploads/** 地址）
     * - 失败统一抛 BizException，由 GlobalExceptionHandler 转成 { code, message }
     */
    @PostMapping
    public ApiResponse<UploadResultDto> upload(@RequestParam("file") MultipartFile file) {
        String url = uploadService.store(file);
        return ApiResponse.ok(new UploadResultDto(url, file.getOriginalFilename()));
    }

    /**
     * 上传配置：前端据此做「格式 + 大小」的即时校验，避免用户白等一次请求。
     * mode = oss（已配置阿里云）或 local（未配置时的本地兜底）。
     */
    @GetMapping("/config")
    public ApiResponse<Map<String, Object>> config() {
        return ApiResponse.ok(Map.of(
                "mode", uploadService.mode(),
                "maxSizeBytes", uploadService.maxSizeBytes(),
                "maxSizeMb", Math.round(uploadService.maxSizeBytes() / 1024.0 / 1024.0),
                "accept", List.of("jpg", "jpeg", "png", "webp"),
                // 30 天浏览器缓存（OSS 对象上的 Cache-Control）
                "cacheMaxAge", 2592000));
    }
}
