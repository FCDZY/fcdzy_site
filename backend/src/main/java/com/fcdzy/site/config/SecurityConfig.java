package com.fcdzy.site.config;

import com.fcdzy.site.security.JwtAuthenticationFilter;
import com.fcdzy.site.security.RestSecurityHandlers;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   JwtAuthenticationFilter jwtAuthenticationFilter,
                                                   RestSecurityHandlers restSecurityHandlers) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/api/auth/login", "/api/public/**").permitAll()
                        .requestMatchers("/uploads/**", "/sitemap.xml", "/robots.txt", "/error", "/favicon.ico").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(handler -> handler
                        .authenticationEntryPoint(restSecurityHandlers)
                        .accessDeniedHandler(restSecurityHandlers))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // BCrypt 自带随机盐，strength = 10
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(SiteProperties siteProperties) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(allowedOriginPatterns(siteProperties));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /**
     * 允许的来源。
     *
     * <p>前端部署后与后端同源，但浏览器对 POST/PUT 仍会带上 Origin 头，
     * Spring 的 CorsFilter 会拿它去做校验——不在白名单里就直接 403（表现为登录按钮点了报
     * “Request failed with status code 403”）。所以这里必须把站点自己的域名放进来，
     * 而不是只放 localhost。</p>
     */
    private List<String> allowedOriginPatterns(SiteProperties siteProperties) {
        List<String> patterns = new ArrayList<>(List.of("http://localhost:*", "http://127.0.0.1:*"));
        addOrigin(patterns, siteProperties.getWebUrl());
        addOrigin(patterns, siteProperties.getBaseUrl());
        // 额外来源：用逗号分隔，方便以后换域名/加 www 不用改代码
        String extra = System.getenv("CORS_ORIGINS");
        if (extra != null && !extra.isBlank()) {
            for (String item : extra.split(",")) {
                if (!item.isBlank()) {
                    patterns.add(item.trim());
                }
            }
        }
        return patterns.stream().distinct().toList();
    }

    private void addOrigin(List<String> patterns, String url) {
        if (url == null || url.isBlank()) {
            return;
        }
        try {
            URI uri = URI.create(url.trim());
            if (uri.getScheme() == null || uri.getAuthority() == null) {
                return;
            }
            String origin = uri.getScheme() + "://" + uri.getAuthority();
            patterns.add(origin);
            // 常见 www 变体，内网/localhost 不需要
            String host = uri.getHost() == null ? "" : uri.getHost();
            if (!host.startsWith("localhost") && !host.startsWith("127.") && !host.contains(":")) {
                patterns.add(origin.replace("://", "://www."));
            }
        } catch (IllegalArgumentException ignored) {
            // 配置里写了非法 URL 时忽略，不影响启动
        }
    }
}
