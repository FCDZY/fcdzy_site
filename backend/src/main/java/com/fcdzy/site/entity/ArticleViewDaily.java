package com.fcdzy.site.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;

/**
 * 文章每日阅读量（用于后台「近 7 天阅读趋势」）。
 *
 * 一行 = 某篇文章在某一天的阅读次数；(view_date, article_id) 唯一，
 * 详情页每被访问一次就 upsert +1（MySQL 的 ON DUPLICATE KEY UPDATE，天然并发安全）。
 */
@Entity
@Table(name = "article_view_daily",
        uniqueConstraints = @UniqueConstraint(name = "uk_view_daily_date_article",
                columnNames = {"view_date", "article_id"}),
        indexes = @Index(name = "idx_view_daily_date", columnList = "view_date"))
public class ArticleViewDaily {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "view_date", nullable = false)
    private LocalDate viewDate;

    @Column(name = "article_id", nullable = false)
    private Long articleId;

    @Column(nullable = false)
    private long views;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDate getViewDate() {
        return viewDate;
    }

    public void setViewDate(LocalDate viewDate) {
        this.viewDate = viewDate;
    }

    public Long getArticleId() {
        return articleId;
    }

    public void setArticleId(Long articleId) {
        this.articleId = articleId;
    }

    public long getViews() {
        return views;
    }

    public void setViews(long views) {
        this.views = views;
    }
}
