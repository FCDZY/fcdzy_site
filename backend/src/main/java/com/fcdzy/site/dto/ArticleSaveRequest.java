package com.fcdzy.site.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 文章新增 / 编辑请求。
 *
 * status 取值：DRAFT（草稿）/ SCHEDULED（定时发布）/ PUBLISHED（立即发布）。
 * schedulePublishTime 为服务器时区的墙钟时间字符串（yyyy-MM-dd HH:mm:ss），
 * 仅 status = SCHEDULED 时必填，且必须晚于服务器当前时间。
 */
public record ArticleSaveRequest(
        @NotBlank(message = "标题不能为空") @Size(max = 200, message = "标题最长 200 字") String title,
        @Size(max = 220, message = "别名最长 220 字符") String slug,
        @Size(max = 500, message = "摘要最长 500 字") String summary,
        String content,
        @Size(max = 500) String coverImage,
        String status,
        String schedulePublishTime,
        Long categoryId,
        List<Long> tagIds,
        Boolean topped) {
}
