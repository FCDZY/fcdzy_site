package com.fcdzy.site.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TagSaveRequest(
        @NotBlank(message = "标签名称不能为空") @Size(max = 64) String name,
        @Size(max = 80) String slug) {
}
