package com.fcdzy.site.repository;

import com.fcdzy.site.entity.ArticleViewDaily;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ArticleViewDailyRepository extends JpaRepository<ArticleViewDaily, Long> {

    /**
     * 当天该文章的阅读量 +1；不存在则插入。
     * 依赖 (view_date, article_id) 唯一索引，并发下也只会有一次插入。
     */
    @Modifying
    @Query(value = "insert into article_view_daily (view_date, article_id, views) "
            + "values (:date, :articleId, 1) "
            + "on duplicate key update views = views + 1", nativeQuery = true)
    int bump(@Param("date") LocalDate date, @Param("articleId") Long articleId);

    /** 按天汇总（[0]=LocalDate, [1]=总阅读量），只返回有数据的日期 */
    @Query("select d.viewDate, sum(d.views) from ArticleViewDaily d "
            + "where d.viewDate >= :from and d.viewDate <= :to "
            + "group by d.viewDate order by d.viewDate")
    List<Object[]> sumByDateBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select coalesce(sum(d.views), 0) from ArticleViewDaily d where d.viewDate >= :from")
    long sumFromDate(@Param("from") LocalDate from);
}
