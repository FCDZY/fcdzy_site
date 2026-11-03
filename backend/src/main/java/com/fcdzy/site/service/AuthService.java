package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.dto.AdminUserDto;
import com.fcdzy.site.dto.LoginRequest;
import com.fcdzy.site.dto.LoginResponse;
import com.fcdzy.site.dto.ProfileUpdateResponse;
import com.fcdzy.site.entity.AdminUser;
import com.fcdzy.site.repository.AdminUserRepository;
import com.fcdzy.site.security.JwtService;
import java.time.LocalDateTime;
import java.util.regex.Pattern;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** 用户名规则：字母、数字、下划线、短横线，3-32 位 */
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{3,32}$");

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
    public ProfileUpdateResponse updateProfile(String username, String newUsername, String nickname, String avatar, String email) {
        AdminUser user = adminUserRepository.findByUsername(username)
                .orElseThrow(() -> BizException.unauthorized("登录状态已失效"));

        String newToken = null;
        if (newUsername != null && !newUsername.isBlank() && !newUsername.trim().equals(user.getUsername())) {
            String target = newUsername.trim();
            if (!USERNAME_PATTERN.matcher(target).matches()) {
                throw new BizException("用户名只能包含字母、数字、下划线和短横线，长度 3-32 位");
            }
            if (adminUserRepository.findByUsername(target).isPresent()) {
                throw new BizException("用户名「" + target + "」已被占用");
            }
            user.setUsername(target);
            // JWT 的 subject 就是用户名：改名后旧 token 失效，这里直接签发新 token，前端替换即可保持登录
            newToken = jwtService.generateToken(user.getId(), user.getUsername());
        }

        if (nickname != null && !nickname.isBlank()) {
            user.setNickname(nickname.trim());
        }
        user.setAvatar(avatar);
        user.setEmail(email);
        adminUserRepository.save(user);
        return new ProfileUpdateResponse(AdminUserDto.of(user), newToken);
    }
}
