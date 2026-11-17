package com.fcdzy.site.controller;

import com.fcdzy.site.service.ArticleExportService;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 后台数据导出。
 *
 * 挂在 /api/admin/** 下，自动受 JWT 保护，只有管理员能下载。
 */
@RestController
@RequestMapping("/api/admin/export")
public class AdminExportController {

    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmm");

    private final ArticleExportService articleExportService;

    public AdminExportController(ArticleExportService articleExportService) {
        this.articleExportService = articleExportService;
    }

    /** 导出全部文章为 zip（markdown + front matter + manifest.csv） */
    @GetMapping("/articles")
    public ResponseEntity<byte[]> exportArticles() {
        ArticleExportService.ExportResult result = articleExportService.exportAll();
        String fileName = "fcdzy-articles-" + LocalDateTime.now().format(STAMP) + ".zip";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType("application/zip"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(fileName, StandardCharsets.UTF_8)
                .build());
        headers.setContentLength(result.bytes().length);
        headers.set("X-Article-Count", String.valueOf(result.articleCount()));
        return new ResponseEntity<>(result.bytes(), headers, org.springframework.http.HttpStatus.OK);
    }
}
