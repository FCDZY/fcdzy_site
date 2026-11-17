package com.fcdzy.site.service;

import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Category;
import com.fcdzy.site.entity.Tag;
import com.fcdzy.site.repository.ArticleRepository;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 导出全部文章为 zip（markdown + front matter + manifest.csv）。
 *
 * 用途：数据库备份之外的第二份「可读」备份——
 * 即使哪天库挂了/被清空，解压这个 zip 就能拿回所有正文，
 * 也方便把文章迁到别的博客系统。
 */
@Service
public class ArticleExportService {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ArticleRepository articleRepository;

    public ArticleExportService(ArticleRepository articleRepository) {
        this.articleRepository = articleRepository;
    }

    @Transactional(readOnly = true)
    public ExportResult exportAll() {
        List<Article> articles = articleRepository.findAll().stream()
                .sorted(Comparator.comparing(Article::getId))
                .toList();

        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(buffer, StandardCharsets.UTF_8)) {
            StringBuilder manifest = new StringBuilder();
            manifest.append("id,title,slug,status,category,tags,publishedAt,updatedAt,viewCount,file\n");

            int index = 0;
            for (Article article : articles) {
                index += 1;
                String fileName = String.format("articles/%03d-%s.md", index, safeSlug(article.getSlug()));
                put(zip, fileName, renderMarkdown(article));

                manifest.append(csv(article.getId()))
                        .append(',').append(csv(article.getTitle()))
                        .append(',').append(csv(article.getSlug()))
                        .append(',').append(csv(article.getStatus() == null ? "" : article.getStatus().name()))
                        .append(',').append(csv(categoryName(article.getCategory())))
                        .append(',').append(csv(tagNames(article.getTags())))
                        .append(',').append(csv(formatTime(article.getPublishedAt())))
                        .append(',').append(csv(formatTime(article.getUpdatedAt())))
                        .append(',').append(csv(article.getViewCount()))
                        .append(',').append(csv(fileName))
                        .append('\n');
            }

            put(zip, "manifest.csv", "\uFEFF" + manifest);
            put(zip, "README.txt", readme(articles.size()));
        } catch (IOException error) {
            throw new IllegalStateException("导出文章失败：" + error.getMessage(), error);
        }

        return new ExportResult(buffer.toByteArray(), articles.size());
    }

    public record ExportResult(byte[] bytes, int articleCount) {
    }

    private void put(ZipOutputStream zip, String name, String content) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zip.putNextEntry(entry);
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String renderMarkdown(Article article) {
        StringBuilder sb = new StringBuilder();
        sb.append("---\n");
        sb.append("title: ").append(yaml(article.getTitle())).append('\n');
        sb.append("slug: ").append(yaml(article.getSlug())).append('\n');
        sb.append("status: ").append(article.getStatus() == null ? "" : article.getStatus().name()).append('\n');
        sb.append("category: ").append(yaml(categoryName(article.getCategory()))).append('\n');
        sb.append("tags: [").append(String.join(", ", tagNames(article.getTags()))).append("]\n");
        sb.append("publishedAt: ").append(yaml(formatTime(article.getPublishedAt()))).append('\n');
        sb.append("updatedAt: ").append(yaml(formatTime(article.getUpdatedAt()))).append('\n');
        sb.append("viewCount: ").append(article.getViewCount() == null ? 0 : article.getViewCount()).append('\n');
        sb.append("coverImage: ").append(yaml(article.getCoverImage())).append('\n');
        sb.append("summary: ").append(yaml(article.getSummary())).append('\n');
        sb.append("---\n\n");
        sb.append(article.getContent() == null ? "" : article.getContent()).append('\n');
        return sb.toString();
    }

    private String readme(int count) {
        return """
                FCDZY 个人博客 · 文章导出包
                ===========================

                导出时间：%s
                文章数量：%d

                目录结构：
                  articles/NNN-<slug>.md   每篇文章（YAML front matter + 正文 Markdown）
                  manifest.csv             索引表（Excel 可直接打开，含分类/标签/状态/阅读数）

                说明：
                  - 正文是原始 Markdown，可直接导入 Typora / Obsidian / Hexo / Hugo
                  - front matter 里的 category / tags / status 方便重建分类与标签
                  - 这是「可读备份」，数据库备份（mysqldump）仍然是恢复线上站点的首选
                """.formatted(java.time.LocalDateTime.now().format(TIME), count);
    }

    private String safeSlug(String slug) {
        String value = slug == null || slug.isBlank() ? "untitled" : slug.trim();
        return value.replaceAll("[^A-Za-z0-9._-]", "-");
    }

    private String categoryName(Category category) {
        return category == null || category.getName() == null ? "" : category.getName();
    }

    private List<String> tagNames(Collection<Tag> tags) {
        return tags == null ? List.of() : tags.stream().map(Tag::getName).toList();
    }

    private String formatTime(java.time.LocalDateTime time) {
        return time == null ? "" : time.format(TIME);
    }

    /** YAML 标量：含特殊字符时用双引号包起来 */
    private String yaml(String value) {
        if (value == null || value.isBlank()) {
            return "\"\"";
        }
        String escaped = value.replace("\\", "\\\\").replace("\"", "\\\"");
        return "\"" + escaped + "\"";
    }

    /** CSV 字段：含逗号/引号时加引号 */
    private String csv(Object value) {
        String text = value == null ? "" : String.valueOf(value);
        if (text.contains(",") || text.contains("\"") || text.contains("\n")) {
            return "\"" + text.replace("\"", "\"\"") + "\"";
        }
        return text;
    }
}
