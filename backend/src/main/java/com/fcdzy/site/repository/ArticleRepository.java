package com.fcdzy.site.repository;

import com.fcdzy.site.entity.Article;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ArticleRepository extends JpaRepository<Article, Long>, JpaSpecificationExecutor<Article> {

    Optional<Article> findBySlug(String slug);

    boolean existsBySlug(String slug);

    /** 定时发布任务用：查询所有已到点、待发布的文章 */
    List<Article> findByStatusAndSchedulePublishTimeLessThanEqual(Article.Status status, java.time.LocalDateTime time);

    long countByStatus(Article.Status status);

    long countByCategoryIdAndStatus(Long categoryId, Article.Status status);

    @Query("select count(a) from Article a join a.tags t where t.id = :tagId and a.status = :status")
    long countByTagAndStatus(@Param("tagId") Long tagId, @Param("status") Article.Status status);

    @Query("select coalesce(sum(a.viewCount), 0) from Article a")
    Long sumViewCount();

    /** 删除分类前解除文章关联，文章本身保留为「未分类」 */
    @Modifying
    @Query("update Article a set a.category = null where a.category.id = :categoryId")
    int clearCategory(@Param("categoryId") Long categoryId);

    /** 删除标签前清理关联表 */
    @Modifying
    @Query(value = "delete from article_tag where tag_id = :tagId", nativeQuery = true)
    int deleteTagRelations(@Param("tagId") Long tagId);

    // ===================== 回收站（软删除） =====================
    // 实体上有 @SQLRestriction("deleted_at is null")，普通查询看不到回收站数据，
    // 所以下面这些用原生 SQL 显式操作 deleted_at。

    /** slug 是否被占用（包含回收站里的，避免唯一索引冲突） */
    @Query(value = "select count(*) from article where slug = :slug", nativeQuery = true)
    long countBySlugIncludingTrashed(@Param("slug") String slug);

    @Query(value = "select * from article where deleted_at is not null order by deleted_at desc limit :limit offset :offset",
            nativeQuery = true)
    List<Article> findTrashed(@Param("limit") int limit, @Param("offset") int offset);

    @Query(value = "select count(*) from article where deleted_at is not null", nativeQuery = true)
    long countTrashed();

    @Modifying
    @Query(value = "update article set deleted_at = null where id = :id and deleted_at is not null", nativeQuery = true)
    int restoreFromTrash(@Param("id") Long id);

    @Modifying
    @Query(value = "delete from article where id = :id and deleted_at is not null", nativeQuery = true)
    int purgeFromTrash(@Param("id") Long id);

    @Modifying
    @Query(value = "delete from article where deleted_at is not null and deleted_at < :before", nativeQuery = true)
    int purgeTrashedBefore(@Param("before") java.time.LocalDateTime before);
}
