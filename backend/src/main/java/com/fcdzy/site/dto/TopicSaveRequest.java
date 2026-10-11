package com.fcdzy.site.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TopicSaveRequest(
        @NotBlank(message = "专题名称不能为空") @Size(max = 100) String name,
        @Size(max = 120) String slug,
        @Size(max = 500) String description,
        @Size(max = 500) String coverImage,
        Integer sortOrder) {
}
