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

    public PublicController(ArticleService articleService,
                            CategoryService categoryService,
                            TagService tagService,
                            TopicService topicService,
                            SiteConfigService siteConfigService) {
        this.articleService = articleService;
        this.categoryService = categoryService;
        this.tagService = tagService;
        this.topicService = topicService;
        this.siteConfigService = siteConfigService;
    }

    @GetMapping("/site-config")
    public ApiResponse<Map<String, String>> siteConfig() {
        return ApiResponse.ok(siteConfigService.getConfig());
    }

    @GetMapping("/articles")
    public ApiResponse<PageResult<ArticleDto>> articles(@RequestParam(defaultValue = "1") int page,
                                                        @RequestParam(defaultValue = "10") int size,
                                                        @RequestParam(required = false) Long categoryId,
                                                        @RequestParam(required = false) Long tagId,
                                                        @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(articleService.publicList(page, size, categoryId, tagId, keyword));
    }

    @GetMapping("/articles/recent")
    public ApiResponse<List<ArticleDto>> recent(@RequestParam(defaultValue = "5") int limit) {
        return ApiResponse.ok(articleService.publicRecent(limit));
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
