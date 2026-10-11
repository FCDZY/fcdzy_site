package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.dto.AdminUserDto;
import com.fcdzy.site.dto.LoginRequest;
import com.fcdzy.site.dto.LoginResponse;
import com.fcdzy.site.service.AuthService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 管理员登录，返回 JWT，前端需放在 Authorization: Bearer &lt;token&gt; 请求头 */
    @PostMapping("/login")
    public ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ApiResponse<AdminUserDto> me(Authentication authentication) {
        return ApiResponse.ok(authService.currentUser(authentication.getName()));
    }

    @PutMapping("/password")
    public ApiResponse<Void> changePassword(Authentication authentication, @RequestBody Map<String, String> body) {
        authService.changePassword(authentication.getName(), body.get("oldPassword"), body.get("newPassword"));
        return ApiResponse.ok();
    }

    @PutMapping("/profile")
    public ApiResponse<AdminUserDto> updateProfile(Authentication authentication, @RequestBody Map<String, String> body) {
        return ApiResponse.ok(authService.updateProfile(authentication.getName(),
                body.get("nickname"), body.get("avatar"), body.get("email")));
    }
}
