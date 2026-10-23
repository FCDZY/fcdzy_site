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
    /** 全站统一时区：定时发布、后台展示服务器时间都用它 */
    private String timeZone = "Asia/Shanghai";
    private Jwt jwt = new Jwt();
    private Admin admin = new Admin();
    private Comment comment = new Comment();
    private Schedule schedule = new Schedule();
    private Oss oss = new Oss();

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

    public String getTimeZone() {
        return timeZone;
    }

    public void setTimeZone(String timeZone) {
        this.timeZone = timeZone;
    }

    public Schedule getSchedule() {
        return schedule;
    }

    public void setSchedule(Schedule schedule) {
        this.schedule = schedule;
    }

    public Oss getOss() {
        return oss;
    }

    public void setOss(Oss oss) {
        this.oss = oss;
    }

    /**
     * 阿里云 OSS 配置（图片后端中转上传）。
     *
     * 真实 AK 请写在 application-local.yml（已被 .gitignore 忽略），
     * application.yml 里只保留占位符，避免密钥进仓库。
     */
    public static class Oss {
        /** 地域 Endpoint，例如 oss-cn-beijing.aliyuncs.com（不要带 https://） */
        private String endpoint = "";
        /** Bucket 名称，例如 takeout-dish */
        private String bucketName = "";
        /** AccessKeyId */
        private String accessKeyId = "";
        /** AccessKeySecret（敏感，只放 application-local.yml） */
        private String accessKeySecret = "";
        /** 对象目录前缀：image/yyyyMMdd/uuid.ext */
        private String dirPrefix = "image";
        /** 单张图片大小上限（字节），默认 5MB */
        private long maxSizeBytes = 5 * 1024 * 1024L;
        /** 浏览器缓存时间（秒），默认 30 天 */
        private long cacheMaxAge = 2592000L;

        /** 四项都填了才认为配置完成；未配置时自动回退到本地磁盘存储 */
        public boolean isConfigured() {
            return !isBlank(endpoint) && !isBlank(bucketName)
                    && !isBlank(accessKeyId) && !isBlank(accessKeySecret);
        }

        private static boolean isBlank(String value) {
            return value == null || value.isBlank();
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getBucketName() {
            return bucketName;
        }

        public void setBucketName(String bucketName) {
            this.bucketName = bucketName;
        }

        public String getAccessKeyId() {
            return accessKeyId;
        }

        public void setAccessKeyId(String accessKeyId) {
            this.accessKeyId = accessKeyId;
        }

        public String getAccessKeySecret() {
            return accessKeySecret;
        }

        public void setAccessKeySecret(String accessKeySecret) {
            this.accessKeySecret = accessKeySecret;
        }

        public String getDirPrefix() {
            return dirPrefix;
        }

        public void setDirPrefix(String dirPrefix) {
            this.dirPrefix = dirPrefix;
        }

        public long getMaxSizeBytes() {
            return maxSizeBytes;
        }

        public void setMaxSizeBytes(long maxSizeBytes) {
            this.maxSizeBytes = maxSizeBytes;
        }

        public long getCacheMaxAge() {
            return cacheMaxAge;
        }

        public void setCacheMaxAge(long cacheMaxAge) {
            this.cacheMaxAge = cacheMaxAge;
        }
    }

    /** 定时发布任务配置。 */
    public static class Schedule {
        /** 轮询间隔（毫秒），默认 30 秒 */
        private long pollMs = 30000L;

        public long getPollMs() {
            return pollMs;
        }

        public void setPollMs(long pollMs) {
            this.pollMs = pollMs;
        }
    }

    public Comment getComment() {
        return comment;
    }

    public void setComment(Comment comment) {
        this.comment = comment;
    }

    /** 评论相关配置：通知收件人 + 防刷阈值。 */
    public static class Comment {
        /** 新评论通知邮件的收件人 */
        private String notifyTo = "3358908684@qq.com";
        /** 是否发送邮件通知 */
        private boolean mailEnabled = true;
        /** 同一 IP 多少秒内只能发 1 条 */
        private int rateLimitSeconds = 30;
        /** 同一 IP 每小时最多多少条 */
        private int rateLimitPerHour = 10;

        public String getNotifyTo() {
            return notifyTo;
        }

        public void setNotifyTo(String notifyTo) {
            this.notifyTo = notifyTo;
        }

        public boolean isMailEnabled() {
            return mailEnabled;
        }

        public void setMailEnabled(boolean mailEnabled) {
            this.mailEnabled = mailEnabled;
        }

        public int getRateLimitSeconds() {
            return rateLimitSeconds;
        }

        public void setRateLimitSeconds(int rateLimitSeconds) {
            this.rateLimitSeconds = rateLimitSeconds;
        }

        public int getRateLimitPerHour() {
            return rateLimitPerHour;
        }

        public void setRateLimitPerHour(int rateLimitPerHour) {
            this.rateLimitPerHour = rateLimitPerHour;
        }
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
