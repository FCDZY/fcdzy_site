package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.StatsDto;
import com.fcdzy.site.dto.ViewTrendDto;
import com.fcdzy.site.service.ArticleService;
import com.fcdzy.site.service.SiteConfigService;
import com.fcdzy.site.service.ViewStatsService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 后台通用接口：站点配置、统计。
 *
 * 图片上传已独立到 {@link UploadController}（/api/admin/upload），
 * 那边负责 OSS 中转上传、格式与大小校验、以及上传配置查询。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminCommonController {

    private final SiteConfigService siteConfigService;
    private final ArticleService articleService;
    private final ViewStatsService viewStatsService;

    public AdminCommonController(SiteConfigService siteConfigService,
                                 ArticleService articleService,
                                 ViewStatsService viewStatsService) {
        this.siteConfigService = siteConfigService;
        this.articleService = articleService;
        this.viewStatsService = viewStatsService;
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

    /** 近 N 天阅读趋势（默认 7 天，仪表盘折线图用） */
    @GetMapping("/stats/views")
    public ApiResponse<ViewTrendDto> viewTrend(@RequestParam(defaultValue = "7") int days) {
        return ApiResponse.ok(viewStatsService.trend(days));
    }
}
