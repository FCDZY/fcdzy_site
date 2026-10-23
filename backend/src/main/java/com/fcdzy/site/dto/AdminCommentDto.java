package com.fcdzy.site.dto;

import com.fcdzy.site.entity.Comment;
import java.time.LocalDateTime;

/**
 * 后台评论列表视图（含邮箱、IP、状态等审核所需信息）。
 */
public class AdminCommentDto {

    private Long id;
    private Long articleId;
    private String articleTitle;
    private String articleSlug;
    private Long parentId;
    private Long rootId;
    private String nickname;
    private String email;
    private String content;
    private String status;
    private String ip;
    private String userAgent;
    private LocalDateTime createdAt;
    private LocalDateTime approvedAt;
    /** 直接子回复数量，删除确认时提示用 */
    private long replyCount;

    public static AdminCommentDto of(Comment comment) {
        AdminCommentDto dto = new AdminCommentDto();
        dto.id = comment.getId();
        dto.parentId = comment.getParentId();
        dto.rootId = comment.getRootId();
        dto.nickname = comment.getNickname();
        dto.email = comment.getEmail();
        dto.content = comment.getContent();
        dto.status = comment.getStatus() == null ? null : comment.getStatus().name();
        dto.ip = comment.getIp();
        dto.userAgent = comment.getUserAgent();
        dto.createdAt = comment.getCreatedAt();
        dto.approvedAt = comment.getApprovedAt();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getArticleId() {
        return articleId;
    }

    public void setArticleId(Long articleId) {
        this.articleId = articleId;
    }

    public String getArticleTitle() {
        return articleTitle;
    }

    public void setArticleTitle(String articleTitle) {
        this.articleTitle = articleTitle;
    }

    public String getArticleSlug() {
        return articleSlug;
    }

    public void setArticleSlug(String articleSlug) {
        this.articleSlug = articleSlug;
    }

    public Long getParentId() {
        return parentId;
    }

    public void setParentId(Long parentId) {
        this.parentId = parentId;
    }

    public Long getRootId() {
        return rootId;
    }

    public void setRootId(Long rootId) {
        this.rootId = rootId;
    }

    public String getNickname() {
        return nickname;
    }

    public void setNickname(String nickname) {
        this.nickname = nickname;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getIp() {
        return ip;
    }

    public void setIp(String ip) {
        this.ip = ip;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public void setUserAgent(String userAgent) {
        this.userAgent = userAgent;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getApprovedAt() {
        return approvedAt;
    }

    public void setApprovedAt(LocalDateTime approvedAt) {
        this.approvedAt = approvedAt;
    }

    public long getReplyCount() {
        return replyCount;
    }

    public void setReplyCount(long replyCount) {
        this.replyCount = replyCount;
    }
}
