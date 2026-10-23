package com.fcdzy.site.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 专题与文章的关联，sortOrder 决定专题内文章顺序。
 */
@Entity
@Table(name = "topic_article",
        uniqueConstraints = @UniqueConstraint(name = "uk_topic_article", columnNames = {"topic_id", "article_id"}))
public class TopicArticle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "topic_id", nullable = false)
    private Long topicId;

    @Column(name = "article_id", nullable = false)
    private Long articleId;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    public TopicArticle() {
    }

    public TopicArticle(Long topicId, Long articleId, Integer sortOrder) {
        this.topicId = topicId;
        this.articleId = articleId;
        this.sortOrder = sortOrder;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getTopicId() {
        return topicId;
    }

    public void setTopicId(Long topicId) {
        this.topicId = topicId;
    }

    public Long getArticleId() {
        return articleId;
    }

    public void setArticleId(Long articleId) {
        this.articleId = articleId;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public void setSortOrder(Integer sortOrder) {
        this.sortOrder = sortOrder;
    }
}
