package com.fcdzy.site.repository;

import com.fcdzy.site.entity.TopicArticle;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TopicArticleRepository extends JpaRepository<TopicArticle, Long> {

    List<TopicArticle> findByTopicIdOrderBySortOrderAscIdAsc(Long topicId);

    List<TopicArticle> findByArticleId(Long articleId);

    long countByTopicId(Long topicId);

    void deleteByTopicId(Long topicId);

    void deleteByArticleId(Long articleId);

    /** 批量删除专题关联（立即执行，便于同一事务中重新插入排序） */
    @Modifying
    @Query(value = "delete from topic_article where topic_id = :topicId", nativeQuery = true)
    void deleteAllByTopicId(@Param("topicId") Long topicId);
}
