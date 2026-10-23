package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.AdminCommentDto;
import com.fcdzy.site.service.CommentService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 后台评论管理：列表（按状态/文章/关键词筛选）、通过审核、删除。
 */
@RestController
@RequestMapping("/api/admin/comments")
public class AdminCommentController {

    private final CommentService commentService;

    public AdminCommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    @GetMapping
    public ApiResponse<PageResult<AdminCommentDto>> list(@RequestParam(required = false) String status,
                                                         @RequestParam(required = false) Long articleId,
                                                         @RequestParam(required = false) String keyword,
                                                         @RequestParam(defaultValue = "1") int pageNum,
                                                         @RequestParam(defaultValue = "10") int pageSize) {
        return ApiResponse.ok(commentService.adminList(status, articleId, keyword, pageNum, pageSize));
    }

    @PutMapping("/{id}/approve")
    public ApiResponse<AdminCommentDto> approve(@PathVariable Long id) {
        return ApiResponse.ok(commentService.approve(id));
    }

    /** 删除评论（楼中楼会连同其下回复一起删除），返回删除条数 */
    @DeleteMapping("/{id}")
    public ApiResponse<Integer> delete(@PathVariable Long id) {
        return ApiResponse.ok(commentService.delete(id));
    }

    /** 待审核数量（后台菜单角标用） */
    @GetMapping("/pending-count")
    public ApiResponse<Long> pendingCount() {
        return ApiResponse.ok(commentService.pendingCount());
    }
}
