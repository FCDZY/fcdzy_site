package com.fcdzy.site.controller;

import com.fcdzy.site.common.ApiResponse;
import com.fcdzy.site.entity.ClientError;
import com.fcdzy.site.repository.ClientErrorRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 前端错误上报（公开接口）与查看（管理员）。
 *
 * 设计原则：
 * - 上报本身绝不能影响页面：任何异常都吞掉，永远返回 ok
 * - 限流 + 去重：同一 IP 每分钟最多 10 条，避免被刷爆表
 * - 只保留最近 30 天的数据，防止无限增长
 */
@RestController
@RequestMapping("/api")
public class ClientErrorController {

    private static final Logger log = LoggerFactory.getLogger(ClientErrorController.class);
    private static final int MAX_PER_MINUTE = 10;
    private static final int MAX_MESSAGE = 500;
    private static final int MAX_STACK = 2000;
    private static final int RETAIN_DAYS = 30;

    private final ClientErrorRepository repository;
    /** ip -> 最近一分钟的上报时间戳 */
    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    public ClientErrorController(ClientErrorRepository repository) {
        this.repository = repository;
    }

    @PostMapping("/public/client-error")
    public ApiResponse<Void> report(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        try {
            String ip = PublicCommentController.resolveIp(request);
            if (!allow(ip)) {
                return ApiResponse.ok();
            }
            String message = trim(text(body.get("message")), MAX_MESSAGE);
            if (message.isBlank()) {
                return ApiResponse.ok();
            }
            ClientError error = new ClientError();
            error.setMessage(message);
            error.setStack(trim(text(body.get("stack")), MAX_STACK));
            error.setUrl(trim(stripQuery(text(body.get("url"))), 500));
            error.setUserAgent(trim(request.getHeader("User-Agent"), 300));
            error.setIp(trim(ip, 60));
            repository.save(error);
            repository.deleteOlderThan(LocalDateTime.now().minusDays(RETAIN_DAYS));
        } catch (Exception ex) {
            // 上报失败绝不影响前端
            log.debug("前端错误上报失败：{}", ex.getMessage());
        }
        return ApiResponse.ok();
    }

    @GetMapping("/admin/client-errors")
    public ApiResponse<List<ClientError>> recent(@RequestParam(defaultValue = "20") int limit) {
        List<ClientError> all = repository.findTop20ByOrderByIdDesc();
        int size = Math.min(Math.max(1, limit), all.size());
        return ApiResponse.ok(all.subList(0, size));
    }

    @GetMapping("/admin/client-errors/count")
    public ApiResponse<Long> count24h() {
        return ApiResponse.ok(repository.countByCreatedAtAfter(LocalDateTime.now().minus(Duration.ofDays(1))));
    }

    @DeleteMapping("/admin/client-errors")
    public ApiResponse<Integer> clear() {
        return ApiResponse.ok(repository.deleteAllRows());
    }

    private boolean allow(String ip) {
        long now = System.currentTimeMillis();
        Deque<Long> queue = hits.computeIfAbsent(ip == null ? "unknown" : ip, key -> new ArrayDeque<>());
        synchronized (queue) {
            while (!queue.isEmpty() && now - queue.peekFirst() > 60_000) {
                queue.pollFirst();
            }
            if (queue.size() >= MAX_PER_MINUTE) {
                return false;
            }
            queue.addLast(now);
            return true;
        }
    }

    private String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String trim(String value, int max) {
        if (value == null) return "";
        String result = value.trim();
        return result.length() <= max ? result : result.substring(0, max);
    }

    /** URL 只保留路径，丢掉查询串（避免把 token 之类带进数据库） */
    private String stripQuery(String url) {
        if (url == null) return "";
        int index = url.indexOf('?');
        return index < 0 ? url : url.substring(0, index);
    }
}
