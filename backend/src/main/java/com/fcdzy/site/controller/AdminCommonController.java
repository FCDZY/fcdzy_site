package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.StatsDto;
import com.fcdzy.site.dto.UploadResultDto;
import com.fcdzy.site.service.ArticleService;
import com.fcdzy.site.service.SiteConfigService;
import com.fcdzy.site.service.UploadService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * 后台通用接口：图片上传、站点配置、统计。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminCommonController {

    private final UploadService uploadService;
    private final SiteConfigService siteConfigService;
    private final ArticleService articleService;

    public AdminCommonController(UploadService uploadService,
                                 SiteConfigService siteConfigService,
                                 ArticleService articleService) {
        this.uploadService = uploadService;
        this.siteConfigService = siteConfigService;
        this.articleService = articleService;
    }

    /** 图片上传，form-data 字段名 file */
    @PostMapping("/upload")
    public ApiResponse<UploadResultDto> upload(@RequestParam("file") MultipartFile file) {
        String url = uploadService.store(file);
        return ApiResponse.ok(new UploadResultDto(url, file.getOriginalFilename()));
    }

    @GetMapping("/site-config")
    public ApiResponse<Map<String, String>> getSiteConfig() {
        return ApiResponse.ok(siteConfigService.getConfig());
    }

    @PutMapping("/site-config")
    public ApiResponse<Map<String, String>> updateSiteConfig(@RequestBody Map<String, String> body) {
        return ApiResponse.ok(siteConfigService.updateConfig(body));
    }

    @GetMapping("/stats")
    public ApiResponse<StatsDto> stats() {
        return ApiResponse.ok(articleService.stats());
    }
}
