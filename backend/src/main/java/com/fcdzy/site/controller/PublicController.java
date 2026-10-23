package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.CategoryDto;
import com.fcdzy.site.dto.TagDto;
import com.fcdzy.site.dto.TopicDetailDto;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.entity.Topic;
import com.fcdzy.site.service.ArticleService;
import com.fcdzy.site.service.CategoryService;
import com.fcdzy.site.service.SiteConfigService;
import com.fcdzy.site.service.TagService;
import com.fcdzy.site.service.TopicService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前台公开接口（无需登录）。
 */
@RestController
@RequestMapping("/api/public")
public class PublicController {

    private final ArticleService articleService;
    private final CategoryService categoryService;
    private final TagService tagService;
    private final TopicService topicService;
    private final SiteConfigService siteConfigService;
    private final com.fcdzy.site.util.TimeSupport timeSupport;

    public PublicController(ArticleService articleService,
                            CategoryService categoryService,
                            TagService tagService,
                            TopicService topicService,
                            SiteConfigService siteConfigService,
                            com.fcdzy.site.util.TimeSupport timeSupport) {
        this.articleService = articleService;
        this.categoryService = categoryService;
        this.tagService = tagService;
        this.topicService = topicService;
        this.siteConfigService = siteConfigService;
        this.timeSupport = timeSupport;
    }

    @GetMapping("/site-config")
    public ApiResponse<Map<String, String>> siteConfig() {
        return ApiResponse.ok(siteConfigService.getConfig());
    }

    /**
     * 服务器时间信息：后台「定时发布」用它做选择器默认值与「服务器时间」标注，
     * 避免用浏览器本地时钟导致时区偏差。
     */
    @GetMapping("/server-info")
    public ApiResponse<Map<String, Object>> serverInfo() {
        LocalDateTime now = timeSupport.now();
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("now", timeSupport.format(now));
        info.put("zone", timeSupport.zoneId());
        info.put("epochMillis", now.atZone(timeSupport.zone()).toInstant().toEpochMilli());
        return ApiResponse.ok(info);
    }

    /**
     * 文章分页列表。
     * 支持两套参数名：pageNum/pageSize（默认 1 / 10）与历史参数 page/size，二者等价。
     * 返回 PageResult，其中 records（=list）为当前页文章，total 为总条数。
     */
    @GetMapping("/articles")
    public ApiResponse<PageResult<ArticleDto>> articles(@RequestParam(required = false) Integer pageNum,
                                                        @RequestParam(required = false) Integer pageSize,
                                                        @RequestParam(defaultValue = "1") int page,
                                                        @RequestParam(defaultValue = "10") int size,
                                                        @RequestParam(required = false) Long categoryId,
                                                        @RequestParam(required = false) Long tagId,
                                                        @RequestParam(required = false) String keyword) {
        int targetPage = pageNum != null ? pageNum : page;
        int targetSize = pageSize != null ? pageSize : size;
        return ApiResponse.ok(articleService.publicList(targetPage, targetSize, categoryId, tagId, keyword));
    }

    @GetMapping("/articles/recent")
    public ApiResponse<List<ArticleDto>> recent(@RequestParam(defaultValue = "5") int limit) {
        return ApiResponse.ok(articleService.publicRecent(limit));
    }

    /** 热门文章：按阅读量降序，默认最多 5 篇 */
    @GetMapping("/articles/hot")
    public ApiResponse<List<ArticleDto>> hot(@RequestParam(defaultValue = "5") int limit) {
        return ApiResponse.ok(articleService.publicHot(limit));
    }

    @GetMapping("/articles/{slug}")
    public ApiResponse<ArticleDto> articleDetail(@PathVariable String slug) {
        return ApiResponse.ok(articleService.publicDetail(slug));
    }

    @GetMapping("/categories")
    public ApiResponse<List<CategoryDto>> categories() {
        return ApiResponse.ok(categoryService.listWithCount());
    }

    @GetMapping("/tags")
    public ApiResponse<List<TagDto>> tags() {
        return ApiResponse.ok(tagService.listWithCount());
    }

    @GetMapping("/topics")
    public ApiResponse<List<TopicDto>> topics() {
        return ApiResponse.ok(topicService.listWithCount());
    }

    @GetMapping("/topics/{slug}")
    public ApiResponse<TopicDetailDto> topicDetail(@PathVariable String slug) {
        Topic topic = topicService.getBySlug(slug);
        List<ArticleDto> articles = topicService.articlesOfTopic(topic.getId(), true);
        return ApiResponse.ok(new TopicDetailDto(
                TopicDto.of(topic, (long) articles.size()),
                articles,
                articles.stream().map(ArticleDto::getId).toList()));
    }
}
