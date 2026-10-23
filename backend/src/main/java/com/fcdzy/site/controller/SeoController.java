package com.fcdzy.site.controller;

import com.fcdzy.site.config.SiteProperties;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.CategoryDto;
import com.fcdzy.site.dto.TagDto;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.service.ArticleService;
import com.fcdzy.site.service.CategoryService;
import com.fcdzy.site.service.TagService;
import com.fcdzy.site.service.TopicService;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 基础 SEO：站点地图与 robots.txt（前台根域名应把这两个路径反向代理到后端）。
 */
@RestController
public class SeoController {

    private final ArticleService articleService;
    private final CategoryService categoryService;
    private final TagService tagService;
    private final TopicService topicService;
    private final SiteProperties siteProperties;

    public SeoController(ArticleService articleService,
                         CategoryService categoryService,
                         TagService tagService,
                         TopicService topicService,
                         SiteProperties siteProperties) {
        this.articleService = articleService;
        this.categoryService = categoryService;
        this.tagService = tagService;
        this.topicService = topicService;
        this.siteProperties = siteProperties;
    }

    @GetMapping(value = "/sitemap.xml", produces = "application/xml;charset=UTF-8")
    public String sitemap() {
        String web = trimEnd(siteProperties.getWebUrl());
        String today = LocalDate.now().format(DateTimeFormatter.ISO_DATE);
        StringBuilder xml = new StringBuilder();
        xml.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        xml.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        appendUrl(xml, web + "/", today, "1.0", "daily");
        appendUrl(xml, web + "/articles", today, "0.9", "daily");
        appendUrl(xml, web + "/topics", today, "0.7", "weekly");
        appendUrl(xml, web + "/categories", today, "0.6", "weekly");

        for (ArticleDto article : articleService.allPublished()) {
            String lastmod = article.getUpdatedAt() == null ? today
                    : article.getUpdatedAt().toLocalDate().format(DateTimeFormatter.ISO_DATE);
            appendUrl(xml, web + "/article/" + article.getSlug(), lastmod, "0.8", "weekly");
        }
        for (CategoryDto category : categoryService.listWithCount()) {
            appendUrl(xml, web + "/category/" + category.getSlug(), today, "0.5", "weekly");
        }
        for (TagDto tag : tagService.listWithCount()) {
            appendUrl(xml, web + "/tag/" + tag.getSlug(), today, "0.4", "weekly");
        }
        for (TopicDto topic : topicService.listWithCount()) {
            appendUrl(xml, web + "/topic/" + topic.getSlug(), today, "0.6", "weekly");
        }
        xml.append("</urlset>");
        return xml.toString();
    }

    @GetMapping(value = "/robots.txt", produces = "text/plain;charset=UTF-8")
    public String robots() {
        String web = trimEnd(siteProperties.getWebUrl());
        return "User-agent: *\n"
                + "Allow: /\n"
                + "Disallow: /admin\n"
                + "Disallow: /api/admin\n"
                + "\n"
                + "Sitemap: " + web + "/sitemap.xml\n";
    }

    private void appendUrl(StringBuilder xml, String loc, String lastmod, String priority, String changefreq) {
        xml.append("  <url>\n")
                .append("    <loc>").append(escape(loc)).append("</loc>\n")
                .append("    <lastmod>").append(lastmod).append("</lastmod>\n")
                .append("    <changefreq>").append(changefreq).append("</changefreq>\n")
                .append("    <priority>").append(priority).append("</priority>\n")
                .append("  </url>\n");
    }

    private String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }

    private String trimEnd(String value) {
        if (value == null || value.isBlank()) {
            return "http://localhost:5173";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
