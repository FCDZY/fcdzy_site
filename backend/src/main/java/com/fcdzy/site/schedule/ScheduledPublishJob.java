package com.fcdzy.site.schedule;

import com.fcdzy.site.service.ArticleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 定时发布任务：每 30 秒（可配置 site.schedule.poll-ms）扫描一次到点的 SCHEDULED 文章。
 *
 * 单实例部署，不依赖 Redis/MQ：状态与计划时间都在数据库里，
 * 因此服务重启后不会丢任务，启动完成时还会立刻补扫一次（不必等满一个周期）。
 */
@Component
public class ScheduledPublishJob {

    private static final Logger log = LoggerFactory.getLogger(ScheduledPublishJob.class);

    /** 回收站保留天数（超过就物理删除） */
    @org.springframework.beans.factory.annotation.Value("${site.schedule.trash-retain-days:30}")
    private int retainDays;

    private final ArticleService articleService;

    public ScheduledPublishJob(ArticleService articleService) {
        this.articleService = articleService;
    }

    /** 固定间隔轮询：上一次执行结束后再计时，避免任务堆积 */
    @Scheduled(fixedDelayString = "${site.schedule.poll-ms:30000}", initialDelayString = "${site.schedule.poll-ms:30000}")
    public void poll() {
        runOnce("轮询");
    }

    /** 启动完成立刻补扫：服务重启后到期的定时文章马上发布 */
    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        runOnce("启动补扫");
    }

    /**
     * 回收站清理：每天跑一次，彻底删除超过保留天数（默认 30 天）的文章。
     * 只做物理删除，不影响线上其他逻辑。
     */
    @Scheduled(fixedDelayString = "${site.schedule.trash-clean-ms:86400000}", initialDelayString = "300000")
    public void cleanTrash() {
        try {
            int removed = articleService.purgeExpiredTrash(retainDays);
            if (removed > 0) {
                log.info("回收站清理：彻底删除 {} 篇超过 {} 天的文章", removed, retainDays);
            }
        } catch (Exception ex) {
            log.warn("回收站清理执行失败：{}", ex.getMessage());
        }
    }

    private void runOnce(String trigger) {
        try {
            int published = articleService.publishDueArticles();
            if (published > 0) {
                log.info("定时发布任务（{}）：发布 {} 篇", trigger, published);
            }
        } catch (Exception ex) {
            // 单次失败不影响后续轮询
            log.warn("定时发布任务（{}）执行失败：{}", trigger, ex.getMessage());
        }
    }
}
