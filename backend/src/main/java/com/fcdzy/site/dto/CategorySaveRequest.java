package com.fcdzy.site.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategorySaveRequest(
        @NotBlank(message = "分类名称不能为空") @Size(max = 64) String name,
        @Size(max = 80) String slug,
        @Size(max = 255) String description,
        Integer sortOrder) {
}
