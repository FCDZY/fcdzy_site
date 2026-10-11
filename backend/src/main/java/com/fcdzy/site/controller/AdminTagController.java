package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.TagDto;
import com.fcdzy.site.dto.TagSaveRequest;
import com.fcdzy.site.service.TagService;
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
@RequestMapping("/api/admin/tags")
public class AdminTagController {

    private final TagService tagService;

    public AdminTagController(TagService tagService) {
        this.tagService = tagService;
    }

    @GetMapping
    public ApiResponse<List<TagDto>> list() {
        return ApiResponse.ok(tagService.listWithCount());
    }

    @PostMapping
    public ApiResponse<TagDto> create(@Valid @RequestBody TagSaveRequest request) {
        return ApiResponse.ok(tagService.create(request));
    }

    @PutMapping("/{id}")
    public ApiResponse<TagDto> update(@PathVariable Long id, @Valid @RequestBody TagSaveRequest request) {
        return ApiResponse.ok(tagService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        tagService.delete(id);
        return ApiResponse.ok();
    }
}
