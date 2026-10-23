package com.fcdzy.site.dto;

import com.fcdzy.site.entity.Article;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 文章视图对象：列表接口不含 content，详情接口包含 content。
 */
public class ArticleDto {

    private Long id;
    private String title;
    private String slug;
    private String summary;
    private String content;
    private String coverImage;
    private String status;
    private Boolean topped;
    private Long viewCount;
    private CategoryDto category;
    private List<TagDto> tags = new ArrayList<>();
    private List<TopicDto> topics = new ArrayList<>();
    private ArticleNav prev;
    private ArticleNav next;
    private LocalDateTime publishedAt;
    /** 定时发布时间（服务器时区墙钟），仅定时文章有值 */
    private LocalDateTime schedulePublishTime;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static ArticleDto of(Article article, boolean withContent) {
        ArticleDto dto = new ArticleDto();
        dto.id = article.getId();
        dto.title = article.getTitle();
        dto.slug = article.getSlug();
        dto.summary = article.getSummary();
        dto.content = withContent ? article.getContent() : null;
        dto.coverImage = article.getCoverImage();
        dto.status = article.getStatus() == null ? null : article.getStatus().name();
        dto.topped = article.getTopped();
        dto.viewCount = article.getViewCount();
        dto.category = CategoryDto.of(article.getCategory(), null);
        article.getTags().forEach(tag -> dto.tags.add(TagDto.of(tag, null)));
        dto.publishedAt = article.getPublishedAt();
        dto.schedulePublishTime = article.getSchedulePublishTime();
        dto.createdAt = article.getCreatedAt();
        dto.updatedAt = article.getUpdatedAt();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getSlug() {
        return slug;
    }

    public String getSummary() {
        return summary;
    }

    public String getContent() {
        return content;
    }

    public String getCoverImage() {
        return coverImage;
    }

    public String getStatus() {
        return status;
    }

    public Boolean getTopped() {
        return topped;
    }

    public Long getViewCount() {
        return viewCount;
    }

    public CategoryDto getCategory() {
        return category;
    }

    public List<TagDto> getTags() {
        return tags;
    }

    public List<TopicDto> getTopics() {
        return topics;
    }

    public void setTopics(List<TopicDto> topics) {
        this.topics = topics;
    }

    public ArticleNav getPrev() {
        return prev;
    }

    public void setPrev(ArticleNav prev) {
        this.prev = prev;
    }

    public ArticleNav getNext() {
        return next;
    }

    public void setNext(ArticleNav next) {
        this.next = next;
    }

    public LocalDateTime getSchedulePublishTime() {
        return schedulePublishTime;
    }

    public void setSchedulePublishTime(LocalDateTime schedulePublishTime) {
        this.schedulePublishTime = schedulePublishTime;
    }

    public LocalDateTime getPublishedAt() {
        return publishedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    /** 上一篇 / 下一篇导航 */
    public static class ArticleNav {
        private final String title;
        private final String slug;

        public ArticleNav(String title, String slug) {
            this.title = title;
            this.slug = slug;
        }

        public String getTitle() {
            return title;
        }

        public String getSlug() {
            return slug;
        }
    }
}
