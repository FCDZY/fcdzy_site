package com.fcdzy.site.dto;

import com.fcdzy.site.entity.Comment;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 前台展示用评论（不含邮箱、IP 等隐私字段）。
 */
public class CommentDto {

    private Long id;
    private Long parentId;
    private Long rootId;
    private String nickname;
    private String content;
    /** 回复目标昵称；直接评论文章时为 null */
    private String replyToNickname;
    private LocalDateTime createdAt;
    /** 该一级评论下的全部回复（平铺，靠 replyToNickname 体现层级） */
    private List<CommentDto> replies = new ArrayList<>();

    public static CommentDto of(Comment comment) {
        CommentDto dto = new CommentDto();
        dto.id = comment.getId();
        dto.parentId = comment.getParentId();
        dto.rootId = comment.getRootId();
        dto.nickname = comment.getNickname();
        dto.content = comment.getContent();
        dto.createdAt = comment.getCreatedAt();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
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

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getReplyToNickname() {
        return replyToNickname;
    }

    public void setReplyToNickname(String replyToNickname) {
        this.replyToNickname = replyToNickname;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public List<CommentDto> getReplies() {
        return replies;
    }

    public void setReplies(List<CommentDto> replies) {
        this.replies = replies;
    }
}
