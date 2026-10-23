package com.fcdzy.site.service;

import com.fcdzy.site.config.SiteProperties;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 评论防刷：按 IP 做内存滑动窗口限流。
 *
 * 规则（可在 application.yml 的 site.comment 下调）：
 * - 同一 IP 在 rateLimitSeconds 秒内只能发 1 条
 * - 同一 IP 在 1 小时内最多 rateLimitPerHour 条
 *
 * 单机内存实现，重启即清零；对个人博客足够，不引入 Redis。
 */
@Component
public class CommentRateLimiter {

    private static final long WINDOW_MILLIS = 60 * 60 * 1000L;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();
    private final long minIntervalMillis;
    private final int maxPerHour;
    /** 超过这个量级时顺手清理一次，避免 Map 无限增长 */
    private static final int CLEANUP_THRESHOLD = 500;

    public CommentRateLimiter(SiteProperties props) {
        SiteProperties.Comment comment = props.getComment();
        this.minIntervalMillis = Math.max(0, comment.getRateLimitSeconds()) * 1000L;
        this.maxPerHour = Math.max(1, comment.getRateLimitPerHour());
    }

    /**
     * 尝试记录一次评论请求。
     *
     * @return 0 表示允许；大于 0 表示需要等待的秒数（同时不记录本次请求）
     */
    public synchronized long tryAcquire(String ip) {
        String key = (ip == null || ip.isBlank()) ? "unknown" : ip;
        long now = System.currentTimeMillis();
        Deque<Long> queue = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        prune(queue, now);

        Long last = queue.peekLast();
        if (last != null && minIntervalMillis > 0 && now - last < minIntervalMillis) {
            long waitMillis = minIntervalMillis - (now - last);
            return Math.max(1, (waitMillis + 999) / 1000);
        }
        if (queue.size() >= maxPerHour) {
            Long oldest = queue.peekFirst();
            long waitMillis = oldest == null ? 60_000L : WINDOW_MILLIS - (now - oldest);
            return Math.max(1, (waitMillis + 999) / 1000);
        }
        queue.addLast(now);
        if (hits.size() > CLEANUP_THRESHOLD) {
            cleanup(now);
        }
        return 0;
    }

    private void prune(Deque<Long> queue, long now) {
        while (!queue.isEmpty() && now - queue.peekFirst() >= WINDOW_MILLIS) {
            queue.pollFirst();
        }
    }

    private void cleanup(long now) {
        hits.entrySet().removeIf(entry -> {
            Deque<Long> queue = entry.getValue();
            prune(queue, now);
            return queue.isEmpty();
        });
    }
}
