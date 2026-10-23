package com.fcdzy.site.dto;

/**
 * 后台仪表盘统计。
 */
public class StatsDto {

    private long articleCount;
    private long publishedCount;
    private long draftCount;
    private long scheduledCount;
    private long categoryCount;
    private long tagCount;
    private long topicCount;
    private long totalViews;

    public StatsDto(long articleCount, long publishedCount, long draftCount, long scheduledCount,
                    long categoryCount, long tagCount, long topicCount, long totalViews) {
        this.articleCount = articleCount;
        this.publishedCount = publishedCount;
        this.draftCount = draftCount;
        this.scheduledCount = scheduledCount;
        this.categoryCount = categoryCount;
        this.tagCount = tagCount;
        this.topicCount = topicCount;
        this.totalViews = totalViews;
    }

    public long getArticleCount() {
        return articleCount;
    }

    public long getPublishedCount() {
        return publishedCount;
    }

    public long getDraftCount() {
        return draftCount;
    }

    public long getScheduledCount() {
        return scheduledCount;
    }

    public long getCategoryCount() {
        return categoryCount;
    }

    public long getTagCount() {
        return tagCount;
    }

    public long getTopicCount() {
        return topicCount;
    }

    public long getTotalViews() {
        return totalViews;
    }
}
