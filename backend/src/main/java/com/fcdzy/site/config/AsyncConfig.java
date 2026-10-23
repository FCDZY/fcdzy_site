package com.fcdzy.site.config;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * 异步任务：目前只有「评论通知邮件」用。
 * 单线程足够，队列满时直接丢弃（邮件是附加功能，不能拖慢或拖垮评论接口）。
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "commentMailExecutor")
    public Executor commentMailExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("comment-mail-");
        executor.setRejectedExecutionHandler(new java.util.concurrent.ThreadPoolExecutor.DiscardPolicy());
        executor.initialize();
        return executor;
    }
}
