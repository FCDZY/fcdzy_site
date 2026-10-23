package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.dto.AdminUserDto;
import com.fcdzy.site.dto.LoginRequest;
import com.fcdzy.site.dto.LoginResponse;
import com.fcdzy.site.entity.AdminUser;
import com.fcdzy.site.repository.AdminUserRepository;
import com.fcdzy.site.security.JwtService;
import java.time.LocalDateTime;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        AdminUser user = adminUserRepository.findByUsername(request.username().trim())
                .orElseThrow(() -> BizException.unauthorized("用户名或密码错误"));
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw BizException.unauthorized("用户名或密码错误");
        }
        user.setLastLoginAt(LocalDateTime.now());
        adminUserRepository.save(user);
        String token = jwtService.generateToken(user.getId(), user.getUsername());
        return new LoginResponse(token, jwtService.getExpireSeconds(), AdminUserDto.of(user));
    }

    @Transactional(readOnly = true)
    public AdminUserDto currentUser(String username) {
        AdminUser user = adminUserRepository.findByUsername(username)
                .orElseThrow(() -> BizException.unauthorized("登录状态已失效"));
        return AdminUserDto.of(user);
    }

    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        AdminUser user = adminUserRepository.findByUsername(username)
                .orElseThrow(() -> BizException.unauthorized("登录状态已失效"));
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw new BizException("原密码不正确");
        }
        if (newPassword == null || newPassword.length() < 6) {
            throw new BizException("新密码长度不能少于 6 位");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        adminUserRepository.save(user);
    }

    @Transactional
    public AdminUserDto updateProfile(String username, String nickname, String avatar, String email) {
        AdminUser user = adminUserRepository.findByUsername(username)
                .orElseThrow(() -> BizException.unauthorized("登录状态已失效"));
        if (nickname != null && !nickname.isBlank()) {
            user.setNickname(nickname.trim());
        }
        user.setAvatar(avatar);
        user.setEmail(email);
        adminUserRepository.save(user);
        return AdminUserDto.of(user);
    }
}
