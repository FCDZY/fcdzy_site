package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.AdminCommentDto;
import com.fcdzy.site.dto.CommentCreateRequest;
import com.fcdzy.site.dto.CommentDto;
import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Comment;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.repository.CommentRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 评论业务：访客提交（默认待审核）、前台只读已通过、后台审核与删除、邮件通知、防刷。
 */
@Service
public class CommentService {

    private static final int MAX_PAGE_SIZE = 50;

    private final CommentRepository commentRepository;
    private final ArticleRepository articleRepository;
    private final CommentRateLimiter rateLimiter;
    private final CommentMailService mailService;

    public CommentService(CommentRepository commentRepository,
                          ArticleRepository articleRepository,
                          CommentRateLimiter rateLimiter,
                          CommentMailService mailService) {
        this.commentRepository = commentRepository;
        this.articleRepository = articleRepository;
        this.rateLimiter = rateLimiter;
        this.mailService = mailService;
    }

    // ===================== 前台 =====================

    @Transactional
    public CommentDto create(String slug, CommentCreateRequest request, String ip, String userAgent) {
        Article article = resolvePublishedArticle(slug);

        long waitSeconds = rateLimiter.tryAcquire(ip);
        if (waitSeconds > 0) {
            throw new BizException(429, "评论太频繁了，请 " + waitSeconds + " 秒后再试", 429);
        }

        Comment parent = null;
        if (request.getParentId() != null) {
            parent = commentRepository.findById(request.getParentId())
                    .orElseThrow(() -> BizException.notFound("要回复的评论不存在"));
            if (!parent.getArticle().getId().equals(article.getId())) {
                throw new BizException("要回复的评论不属于这篇文章");
            }
            if (parent.getStatus() != Comment.Status.APPROVED) {
                throw new BizException("该评论尚未通过审核，暂时无法回复");
            }
        }

        Comment comment = new Comment();
        comment.setArticle(article);
        comment.setParentId(parent == null ? null : parent.getId());
        if (parent != null) {
            comment.setRootId(parent.getRootId() == null ? parent.getId() : parent.getRootId());
        }
        comment.setNickname(request.getNickname().trim());
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        comment.setEmail(email.isEmpty() ? null : email.toLowerCase());
        comment.setContent(request.getContent().trim());
        comment.setStatus(Comment.Status.PENDING);
        comment.setIp(ip);
        comment.setUserAgent(userAgent == null ? null : userAgent.substring(0, Math.min(userAgent.length(), 255)));
        comment = commentRepository.save(comment);

        // 异步通知站长，失败不影响提交
        String replyToNickname = parent == null ? null : parent.getNickname();
        mailService.notifyNewComment(article.getTitle(), article.getSlug(), comment.getNickname(),
                comment.getEmail(), comment.getContent(), comment.getCreatedAt(), replyToNickname);

        return CommentDto.of(comment);
    }

    /** 前台：已通过的一级评论分页，每条带上其下全部已通过回复 */
    @Transactional(readOnly = true)
    public PageResult<CommentDto> publicList(String slug, int pageNum, int pageSize) {
        Article article = resolvePublishedArticle(slug);
        Pageable pageable = PageRequest.of(normalizePage(pageNum), normalizeSize(pageSize),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Comment> roots = commentRepository.findByArticleIdAndParentIdIsNullAndStatusOrderByCreatedAtDesc(
                article.getId(), Comment.Status.APPROVED, pageable);

        List<CommentDto> dtos = roots.getContent().stream().map(CommentDto::of).collect(Collectors.toList());
        if (!dtos.isEmpty()) {
            List<Long> rootIds = roots.getContent().stream().map(Comment::getId).collect(Collectors.toList());
            List<Comment> replies = commentRepository.findByRootIdInAndStatusOrderByCreatedAtAsc(
                    rootIds, Comment.Status.APPROVED);
            if (!replies.isEmpty()) {
                // id → 昵称，用于「回复 @xxx」（父级可能是一级评论，也可能是同楼里的其它回复）
                Map<Long, String> nicknameById = new HashMap<>();
                roots.getContent().forEach(c -> nicknameById.put(c.getId(), c.getNickname()));
                replies.forEach(c -> nicknameById.put(c.getId(), c.getNickname()));

                Map<Long, CommentDto> rootById = new LinkedHashMap<>();
                dtos.forEach(dto -> rootById.put(dto.getId(), dto));
                for (Comment reply : replies) {
                    CommentDto rootDto = rootById.get(reply.getRootId());
                    if (rootDto == null) {
                        continue; // 理论上不会发生（rootId 与本页一级评论一致）
                    }
                    CommentDto replyDto = CommentDto.of(reply);
                    replyDto.setReplyToNickname(nicknameById.get(reply.getParentId()));
                    rootDto.getReplies().add(replyDto);
                }
            }
        }
        return PageResult.of(dtos, roots);
    }

    /** 前台：已通过的评论总数（含回复） */
    @Transactional(readOnly = true)
    public long publicCount(String slug) {
        Article article = resolvePublishedArticle(slug);
        return commentRepository.countByArticleIdAndStatus(article.getId(), Comment.Status.APPROVED);
    }

    // ===================== 后台 =====================

    @Transactional(readOnly = true)
    public PageResult<AdminCommentDto> adminList(String status, Long articleId, String keyword,
                                                 int pageNum, int pageSize) {
        Comment.Status statusFilter = parseStatus(status);
        String kw = StringUtils.hasText(keyword) ? keyword.trim().toLowerCase() : null;

        Specification<Comment> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (statusFilter != null) {
                predicates.add(cb.equal(root.get("status"), statusFilter));
            }
            if (articleId != null) {
                predicates.add(cb.equal(root.get("article").get("id"), articleId));
            }
            if (kw != null) {
                String like = "%" + kw + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("nickname")), like),
                        cb.like(cb.lower(root.get("content")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("email"), "")), like)));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };

        Pageable pageable = PageRequest.of(normalizePage(pageNum), normalizeSize(pageSize),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Comment> page = commentRepository.findAll(spec, pageable);

        List<AdminCommentDto> dtos = page.getContent().stream().map(AdminCommentDto::of).collect(Collectors.toList());
        // 批量补文章标题，避免 N+1
        Set<Long> articleIds = page.getContent().stream()
                .map(c -> c.getArticle().getId())
                .collect(Collectors.toSet());
        Map<Long, Article> articles = articleRepository.findAllById(articleIds).stream()
                .collect(Collectors.toMap(Article::getId, a -> a));
        for (int i = 0; i < dtos.size(); i++) {
            AdminCommentDto dto = dtos.get(i);
            Article article = articles.get(page.getContent().get(i).getArticle().getId());
            if (article != null) {
                dto.setArticleId(article.getId());
                dto.setArticleTitle(article.getTitle());
                dto.setArticleSlug(article.getSlug());
            }
            dto.setReplyCount(commentRepository.countByParentId(dto.getId()));
        }
        return PageResult.of(dtos, page);
    }

    @Transactional
    public AdminCommentDto approve(Long id) {
        Comment comment = commentRepository.findById(id)
                .orElseThrow(() -> BizException.notFound("评论不存在"));
        if (comment.getStatus() != Comment.Status.APPROVED) {
            comment.setStatus(Comment.Status.APPROVED);
            comment.setApprovedAt(LocalDateTime.now());
            comment = commentRepository.save(comment);
        }
        return AdminCommentDto.of(comment);
    }

    /** 删除评论；若是楼中楼，连同其下所有回复一起删除。返回删除条数。 */
    @Transactional
    public int delete(Long id) {
        Comment comment = commentRepository.findById(id)
                .orElseThrow(() -> BizException.notFound("评论不存在"));
        List<Comment> all = commentRepository.findByArticleId(comment.getArticle().getId());

        Map<Long, List<Comment>> childrenByParent = new HashMap<>();
        for (Comment item : all) {
            if (item.getParentId() != null) {
                childrenByParent.computeIfAbsent(item.getParentId(), k -> new ArrayList<>()).add(item);
            }
        }
        List<Long> toDelete = new ArrayList<>();
        Deque<Long> queue = new ArrayDeque<>();
        queue.add(id);
        while (!queue.isEmpty()) {
            Long current = queue.poll();
            toDelete.add(current);
            for (Comment child : childrenByParent.getOrDefault(current, List.of())) {
                queue.add(child.getId());
            }
        }
        commentRepository.deleteAllById(toDelete);
        return toDelete.size();
    }

    @Transactional(readOnly = true)
    public long pendingCount() {
        return commentRepository.countByStatus(Comment.Status.PENDING);
    }

    // ===================== 内部工具 =====================

    private Article resolvePublishedArticle(String slug) {
        return articleRepository.findBySlug(slug)
                .filter(a -> a.getStatus() == Article.Status.PUBLISHED)
                .orElseThrow(() -> BizException.notFound("文章不存在"));
    }

    private Comment.Status parseStatus(String status) {
        if (!StringUtils.hasText(status) || "ALL".equalsIgnoreCase(status)) {
            return null;
        }
        try {
            return Comment.Status.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BizException("状态只能是 PENDING 或 APPROVED");
        }
    }

    private int normalizePage(int pageNum) {
        return Math.max(0, pageNum - 1);
    }

    private int normalizeSize(int pageSize) {
        if (pageSize <= 0) {
            return 10;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
