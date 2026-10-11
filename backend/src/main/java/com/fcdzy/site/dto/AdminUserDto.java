package com.fcdzy.site.dto;

import com.fcdzy.site.entity.AdminUser;
import java.time.LocalDateTime;

public class AdminUserDto {

    private Long id;
    private String username;
    private String nickname;
    private String avatar;
    private String email;
    private LocalDateTime lastLoginAt;

    public static AdminUserDto of(AdminUser user) {
        AdminUserDto dto = new AdminUserDto();
        dto.id = user.getId();
        dto.username = user.getUsername();
        dto.nickname = user.getNickname();
        dto.avatar = user.getAvatar();
        dto.email = user.getEmail();
        dto.lastLoginAt = user.getLastLoginAt();
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getNickname() {
        return nickname;
    }

    public String getAvatar() {
        return avatar;
    }

    public String getEmail() {
        return email;
    }

    public LocalDateTime getLastLoginAt() {
        return lastLoginAt;
    }
}
