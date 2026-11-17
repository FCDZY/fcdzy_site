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

    /**
     * 蜜罐字段：前端隐藏输入框，真人不可能填。
     * 非空即判定为机器人，直接静默丢弃（返回成功但不入库）。
     */
    private String hp;

    /** 从打开表单到提交的耗时（毫秒）；过小说明是脚本直接提交 */
    private Long elapsedMs;

    public String getHp() {
        return hp;
    }

    public void setHp(String hp) {
        this.hp = hp;
    }

    public Long getElapsedMs() {
        return elapsedMs;
    }

    public void setElapsedMs(Long elapsedMs) {
        this.elapsedMs = elapsedMs;
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

    public Long getParentId() {
        return parentId;
    }

    public void setParentId(Long parentId) {
        this.parentId = parentId;
    }
}
