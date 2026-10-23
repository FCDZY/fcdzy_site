package com.fcdzy.site.repository;

import com.fcdzy.site.entity.Comment;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface CommentRepository extends JpaRepository<Comment, Long>, JpaSpecificationExecutor<Comment> {

    /** 一级评论分页（只取已通过） */
    Page<Comment> findByArticleIdAndParentIdIsNullAndStatusOrderByCreatedAtDesc(
            Long articleId, Comment.Status status, Pageable pageable);

    /** 某一楼下的全部回复（含多层，按时间升序） */
    List<Comment> findByRootIdInAndStatusOrderByCreatedAtAsc(List<Long> rootIds, Comment.Status status);

    /** 文章下已通过的评论总数（含回复） */
    long countByArticleIdAndStatus(Long articleId, Comment.Status status);

    long countByStatus(Comment.Status status);

    /** 删除整楼时用：该文章全部评论（内存里按 parentId 组树） */
    List<Comment> findByArticleId(Long articleId);

    /** 后台列表里显示「有 N 条回复」 */
    long countByParentId(Long parentId);
}
