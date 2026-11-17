package com.fcdzy.site.security;

import com.fcdzy.site.common.BizException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 登录失败限流（防爆破）。
 *
 * <p>单实例内存实现：本站是单机部署，不需要 Redis。
 * 按「来源 IP」计数，同一 IP 在窗口内失败达到上限后锁定一段时间，
 * 期间即使密码正确也拒绝——否则爆破方可以用「试对就进」的方式绕过。</p>
 *
 * <p>注意：只锁 IP，不按用户名锁，避免有人拿你的用户名把你自己锁死；
 * 锁定状态存在内存里，重启后端即清空（这也是被误锁时的应急手段）。</p>
 */
@Component
public class LoginAttemptService {

    /** 失败计数在多长时间内累计（超过则重新计数） */
    private static final Duration WINDOW = Duration.ofMinutes(30);
    /** 空闲多久后清理记录，避免 Map 无限增长 */
    private static final Duration IDLE_EVICT = Duration.ofMinutes(60);

    private final Map<String, Attempt> attempts = new ConcurrentHashMap<>();

    private volatile int maxAttempts = 5;
    private volatile int lockMinutes = 10;

    public void configure(int maxAttempts, int lockMinutes) {
        this.maxAttempts = Math.max(1, maxAttempts);
        this.lockMinutes = Math.max(1, lockMinutes);
    }

    private static final class Attempt {
        int failures;
        Instant firstFailureAt = Instant.now();
        Instant lastFailureAt = Instant.now();
        Instant lockedUntil;
    }

    /** 校验是否允许尝试；已锁定则抛出 429 */
    public void checkAllowed(String ip) {
        if (ip == null || ip.isBlank()) {
            return;
        }
        Attempt attempt = attempts.get(ip);
        if (attempt == null) {
            return;
        }
        Instant now = Instant.now();
        if (attempt.lockedUntil != null && now.isBefore(attempt.lockedUntil)) {
            long minutes = Math.max(1, Duration.between(now, attempt.lockedUntil).toMinutes() + 1);
            throw new BizException(429, "尝试次数过多，请 " + minutes + " 分钟后再试", 429);
        }
        // 锁定已过期 / 窗口过期 → 重置
        if (attempt.lockedUntil != null || Duration.between(attempt.firstFailureAt, now).compareTo(WINDOW) > 0) {
            attempts.remove(ip);
        }
    }

    /** 记录一次失败；达到上限则锁定 */
    public void onFailure(String ip) {
        if (ip == null || ip.isBlank()) {
            return;
        }
        Instant now = Instant.now();
        Attempt attempt = attempts.computeIfAbsent(ip, key -> {
            Attempt created = new Attempt();
            created.firstFailureAt = now;
            return created;
        });
        // 距离首次失败超过窗口，重新计数
        if (Duration.between(attempt.firstFailureAt, now).compareTo(WINDOW) > 0) {
            attempt.failures = 0;
            attempt.firstFailureAt = now;
            attempt.lockedUntil = null;
        }
        attempt.failures += 1;
        attempt.lastFailureAt = now;
        if (attempt.failures >= maxAttempts) {
            attempt.lockedUntil = now.plus(Duration.ofMinutes(lockMinutes));
        }
        evictIdle(now);
    }

    /** 登录成功后清零 */
    public void onSuccess(String ip) {
        if (ip != null) {
            attempts.remove(ip);
        }
    }

    /** 当前剩余可尝试次数（给测试/排查用） */
    public int remaining(String ip) {
        Attempt attempt = ip == null ? null : attempts.get(ip);
        if (attempt == null) {
            return maxAttempts;
        }
        return Math.max(0, maxAttempts - attempt.failures);
    }

    private void evictIdle(Instant now) {
        if (attempts.size() < 512) {
            return;
        }
        attempts.entrySet().removeIf(entry -> {
            Instant last = entry.getValue().lastFailureAt;
            return last != null && Duration.between(last, now).compareTo(IDLE_EVICT) > 0;
        });
    }
}
