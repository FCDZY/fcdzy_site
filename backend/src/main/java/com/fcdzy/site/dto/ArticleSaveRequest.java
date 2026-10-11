package com.fcdzy.site.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 文章新增 / 编辑请求。status 传 DRAFT 或 PUBLISHED。
 */
public record ArticleSaveRequest(
        @NotBlank(message = "标题不能为空") @Size(max = 200, message = "标题最长 200 字") String title,
        @Size(max = 220, message = "别名最长 220 字符") String slug,
        @Size(max = 500, message = "摘要最长 500 字") String summary,
        String content,
        @Size(max = 500) String coverImage,
        String status,
        Long categoryId,
        List<Long> tagIds,
        Boolean topped) {
}
