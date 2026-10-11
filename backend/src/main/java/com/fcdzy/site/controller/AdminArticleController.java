package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.ArticleSaveRequest;
import com.fcdzy.site.service.ArticleService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/articles")
public class AdminArticleController {

    private final ArticleService articleService;

    public AdminArticleController(ArticleService articleService) {
        this.articleService = articleService;
    }

    @GetMapping
    public ApiResponse<PageResult<ArticleDto>> list(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "10") int size,
                                                    @RequestParam(required = false) String status,
                                                    @RequestParam(required = false) Long categoryId,
                                                    @RequestParam(required = false) Long tagId,
                                                    @RequestParam(required = false) String keyword) {
        return ApiResponse.ok(articleService.adminList(page, size, status, categoryId, tagId, keyword));
    }

    /** 供专题管理挑选文章使用 */
    @GetMapping("/options")
    public ApiResponse<List<ArticleDto>> options() {
        return ApiResponse.ok(articleService.allForSelect());
    }

    @GetMapping("/{id}")
    public ApiResponse<ArticleDto> detail(@PathVariable Long id) {
        return ApiResponse.ok(articleService.adminGet(id));
    }

    @PostMapping
    public ApiResponse<ArticleDto> create(@Valid @RequestBody ArticleSaveRequest request) {
        return ApiResponse.ok(articleService.create(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<ArticleDto> update(@PathVariable Long id, @Valid @RequestBody ArticleSaveRequest request) {
        return ApiResponse.ok(articleService.update(id, request));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<ArticleDto> changeStatus(@PathVariable Long id, @RequestParam String status) {
        return ApiResponse.ok(articleService.changeStatus(id, status));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        articleService.delete(id);
        return ApiResponse.ok();
    }
}
