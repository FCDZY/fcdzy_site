package com.fcdzy.site.repository;

import com.fcdzy.site.entity.ClientError;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface ClientErrorRepository extends JpaRepository<ClientError, Long> {

    List<ClientError> findTop20ByOrderByIdDesc();

    long countByCreatedAtAfter(LocalDateTime time);

    /** 批量删除需要事务（从 Controller 直接调用时尤其要带上） */
    @Transactional
    @Modifying
    @Query("delete from ClientError c where c.createdAt < :before")
    int deleteOlderThan(LocalDateTime before);

    @Transactional
    @Modifying
    @Query("delete from ClientError c")
    int deleteAllRows();

    /**
     * 删掉「发版后旧页面去要已删除分包」这类噪音：
     * 它们不是真 bug，前端已经改成自动刷新一次，留着只会淹没真正的错误。
     */
    @Transactional
    @Modifying
    @Query("""
        delete from ClientError c
        where c.message like %:a% or c.message like %:b% or c.message like %:c%
        """)
    int deleteStaleChunkRows(String a, String b, String c);
}
