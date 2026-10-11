package com.fcdzy.site.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "site")
public class SiteProperties {

    /** 上传文件保存目录 */
    private String uploadDir = "./uploads";
    /** 后端对外地址，用于拼接上传文件的可访问 URL */
    private String baseUrl = "http://localhost:8080";
    /** 前台站点地址，用于 sitemap.xml */
    private String webUrl = "http://localhost:5173";
    private Jwt jwt = new Jwt();
    private Admin admin = new Admin();

    public String getUploadDir() {
        return uploadDir;
    }

    public void setUploadDir(String uploadDir) {
        this.uploadDir = uploadDir;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getWebUrl() {
        return webUrl;
    }

    public void setWebUrl(String webUrl) {
        this.webUrl = webUrl;
    }

    public Jwt getJwt() {
        return jwt;
    }

    public void setJwt(Jwt jwt) {
        this.jwt = jwt;
    }

    public Admin getAdmin() {
        return admin;
    }

    public void setAdmin(Admin admin) {
        this.admin = admin;
    }

    public static class Jwt {
        private String secret = "fcdzy-site-default-secret-key-change-me-please-32bytes";
        private int expireHours = 24;

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }

        public int getExpireHours() {
            return expireHours;
        }

        public void setExpireHours(int expireHours) {
            this.expireHours = expireHours;
        }
    }

    public static class Admin {
        private String username = "admin";
        private String password = "admin123";
        private String nickname = "站长";

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getNickname() {
            return nickname;
        }

        public void setNickname(String nickname) {
            this.nickname = nickname;
        }
    }
}
