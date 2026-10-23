package com.fcdzy.site.util;

import com.fcdzy.site.config.SiteProperties;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import org.springframework.stereotype.Component;

/**
 * 全站统一的时间工具：所有"当前时间"都走服务器时区，避免浏览器时区带来偏差。
 *
 * - 存储/比较：LocalDateTime（服务器时区的墙钟时间）
 * - 前后端交换：yyyy-MM-dd HH:mm:ss 字符串（同样是服务器墙钟）
 */
@Component
public class TimeSupport {

    public static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    public static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final ZoneId zone;

    public TimeSupport(SiteProperties props) {
        this.zone = resolveZone(props.getTimeZone());
    }

    private static ZoneId resolveZone(String timeZone) {
        try {
            return timeZone == null || timeZone.isBlank() ? ZoneId.systemDefault() : ZoneId.of(timeZone);
        } catch (Exception ex) {
            return ZoneId.systemDefault();
        }
    }

    public ZoneId zone() {
        return zone;
    }

    public String zoneId() {
        return zone.getId();
    }

    /** 服务器当前时间（服务器时区） */
    public LocalDateTime now() {
        return LocalDateTime.now(zone);
    }

    public LocalDate today() {
        return LocalDate.now(zone);
    }

    /** 把 yyyy-MM-dd HH:mm:ss 解析为服务器时区的 LocalDateTime；格式不对返回 null */
    public LocalDateTime parseDateTime(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String value = text.trim();
        try {
            return LocalDateTime.parse(value, DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // 兼容 2026-10-21T14:00:00 / 2026-10-21T14:00 这类 ISO 写法
        }
        try {
            return LocalDateTime.parse(value.replace(' ', 'T'));
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    public String format(LocalDateTime time) {
        return time == null ? null : DATE_TIME.format(time);
    }
}
