package com.fcdzy.site.dto;

public class LoginResponse {

    private final String token;
    private final String tokenType;
    private final long expiresIn;
    private final AdminUserDto user;

    public LoginResponse(String token, long expiresIn, AdminUserDto user) {
        this.token = token;
        this.tokenType = "Bearer";
        this.expiresIn = expiresIn;
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public String getTokenType() {
        return tokenType;
    }

    public long getExpiresIn() {
        return expiresIn;
    }

    public AdminUserDto getUser() {
        return user;
    }
}
