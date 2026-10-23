package com.fcdzy.site.service;

import com.fcdzy.site.dto.ViewTrendDto;
import com.fcdzy.site.repository.ArticleViewDailyRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 每日阅读量统计：埋点写入 + 近 N 天趋势查询。
 */
@Service
public class ViewStatsService {

    private static final Logger log = LoggerFactory.getLogger(ViewStatsService.class);
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter LABEL_FORMAT = DateTimeFormatter.ofPattern("MM-dd");

    private final ArticleViewDailyRepository repository;

    public ViewStatsService(ArticleViewDailyRepository repository) {
        this.repository = repository;
    }

    /**
     * 记录一次阅读。独立事务：统计失败绝不能影响文章详情接口。
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordView(Long articleId) {
        repository.bump(LocalDate.now(), articleId);
    }

    /** 近 N 天（含今天）的阅读趋势，缺失日期补 0 */
    @Transactional(readOnly = true)
    public ViewTrendDto trend(int days) {
        int span = Math.max(1, Math.min(days, 90));
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(span - 1L);

        Map<LocalDate, Long> byDate = new HashMap<>();
        for (Object[] row : repository.sumByDateBetween(from, today)) {
            byDate.put((LocalDate) row[0], ((Number) row[1]).longValue());
        }

        List<ViewTrendDto.Point> points = new ArrayList<>(span);
        long total = 0;
        for (int i = 0; i < span; i++) {
            LocalDate date = from.plusDays(i);
            long views = byDate.getOrDefault(date, 0L);
            total += views;
            points.add(new ViewTrendDto.Point(date.format(DATE_FORMAT), date.format(LABEL_FORMAT), views));
        }
        return new ViewTrendDto(span, total, points);
    }

    /** 便捷方法：埋点但吞掉异常（供详情接口调用） */
    public void recordViewQuietly(Long articleId) {
        try {
            recordView(articleId);
        } catch (Exception ex) {
            log.warn("记录每日阅读量失败（articleId={}）：{}", articleId, ex.getMessage());
        }
    }
}
