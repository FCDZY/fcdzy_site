package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.CommentCreateRequest;
import com.fcdzy.site.dto.CommentDto;
import com.fcdzy.site.service.CommentService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前台评论接口：访客无需登录，新评论默认待审核。
 */
@RestController
@RequestMapping("/api/public/articles/{slug}/comments")
public class PublicCommentController {

    private final CommentService commentService;

    public PublicCommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    /** 新增评论或回复（默认 PENDING，审核通过后才在前台展示） */
    @PostMapping
    public ApiResponse<CommentDto> create(@PathVariable String slug,
                                          @Valid @RequestBody CommentCreateRequest request,
                                          HttpServletRequest httpRequest) {
        String ip = resolveIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        return ApiResponse.ok(commentService.create(slug, request, ip, userAgent));
    }

    /** 已通过的一级评论分页（每条带其下全部回复） */
    @GetMapping
    public ApiResponse<PageResult<CommentDto>> list(@PathVariable String slug,
                                                    @RequestParam(defaultValue = "1") int pageNum,
                                                    @RequestParam(defaultValue = "10") int pageSize) {
        return ApiResponse.ok(commentService.publicList(slug, pageNum, pageSize));
    }

    /** 已通过的评论总数（含回复） */
    @GetMapping("/count")
    public ApiResponse<Long> count(@PathVariable String slug) {
        return ApiResponse.ok(commentService.publicCount(slug));
    }

    /** 反向代理场景优先取 X-Forwarded-For 的第一跳 */
    public static String resolveIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }
}
