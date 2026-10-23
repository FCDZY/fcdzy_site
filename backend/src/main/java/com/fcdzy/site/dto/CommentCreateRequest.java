package com.fcdzy.site.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 访客提交评论的请求体。邮箱选填（不填即为匿名评论）。
 */
public class CommentCreateRequest {

    @NotBlank(message = "昵称不能为空")
    @Size(max = 40, message = "昵称最多 40 个字符")
    private String nickname;

    @Email(message = "邮箱格式不正确")
    @Size(max = 120, message = "邮箱最多 120 个字符")
    private String email;

    @NotBlank(message = "评论内容不能为空")
    @Size(max = 2000, message = "评论内容最多 2000 个字符")
    private String content;

    /** 回复某条评论时传其 id；为空表示对文章发表一级评论 */
    private Long parentId;

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

    public Long getParentId() {
        return parentId;
    }

    public void setParentId(Long parentId) {
        this.parentId = parentId;
    }
}
