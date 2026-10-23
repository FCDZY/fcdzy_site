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
