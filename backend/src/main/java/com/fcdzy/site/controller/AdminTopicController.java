package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.TopicArticlesRequest;
import com.fcdzy.site.dto.TopicDetailDto;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.dto.TopicSaveRequest;
import com.fcdzy.site.entity.Topic;
import com.fcdzy.site.service.TopicService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/topics")
public class AdminTopicController {

    private final TopicService topicService;

    public AdminTopicController(TopicService topicService) {
        this.topicService = topicService;
    }

    @GetMapping
    public ApiResponse<List<TopicDto>> list() {
        return ApiResponse.ok(topicService.listWithCount());
    }

    /** 专题详情：包含专题内文章（按自定义顺序，含草稿） */
    @GetMapping("/{id}")
    public ApiResponse<TopicDetailDto> detail(@PathVariable Long id) {
        Topic topic = topicService.get(id);
        List<ArticleDto> articles = topicService.articlesOfTopic(id, false);
        return ApiResponse.ok(new TopicDetailDto(
                TopicDto.of(topic, (long) articles.size()), articles, topicService.orderedArticleIds(id)));
    }

    @PostMapping
    public ApiResponse<TopicDto> create(@Valid @RequestBody TopicSaveRequest request) {
        return ApiResponse.ok(topicService.create(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<TopicDto> update(@PathVariable Long id, @Valid @RequestBody TopicSaveRequest request) {
        return ApiResponse.ok(topicService.update(id, request));
    }

    /** 保存专题内文章顺序 */
    @PutMapping("/{id}/articles")
    public ApiResponse<List<Long>> setArticles(@PathVariable Long id, @RequestBody TopicArticlesRequest request) {
        topicService.setArticles(id, request.safeArticleIds());
        return ApiResponse.ok(topicService.orderedArticleIds(id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        topicService.delete(id);
        return ApiResponse.ok();
    }
}
