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
}
