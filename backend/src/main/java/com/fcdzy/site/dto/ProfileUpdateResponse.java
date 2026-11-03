package com.fcdzy.site.dto;

/**
 * 资料保存结果。
 *
 * <p>用户名可以被修改，而 JWT 的 subject 就是用户名——改名后旧 token 立刻失效。
 * 所以这里在改名时同时返回一个新签发的 token，前端直接替换，当前会话不会被打断。</p>
 */
public class ProfileUpdateResponse {

    private final AdminUserDto user;
    /** 只有改过用户名时才返回新 token，否则为 null */
    private final String token;

    public ProfileUpdateResponse(AdminUserDto user, String token) {
        this.user = user;
        this.token = token;
    }

    public AdminUserDto getUser() {
        return user;
    }

    public String getToken() {
        return token;
    }
}
