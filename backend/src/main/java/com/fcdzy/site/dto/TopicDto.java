package com.fcdzy.site.dto;

import java.time.LocalDateTime;

public class TopicDto {

    private Long id;
    private String name;
    private String slug;
    private String description;
    private String coverImage;
    private Integer sortOrder;
    private Long articleCount;
    private LocalDateTime createdAt;

    public static TopicDto of(com.fcdzy.site.entity.Topic topic, Long articleCount) {
        if (topic == null) {
            return null;
        }
        TopicDto dto = new TopicDto();
        dto.id = topic.getId();
        dto.name = topic.getName();
        dto.slug = topic.getSlug();
        dto.description = topic.getDescription();
        dto.coverImage = topic.getCoverImage();
        dto.sortOrder = topic.getSortOrder();
        dto.articleCount = articleCount;
        dto.createdAt = topic.getCreatedAt();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    public String getDescription() {
        return description;
    }

    public String getCoverImage() {
        return coverImage;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public Long getArticleCount() {
        return articleCount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
