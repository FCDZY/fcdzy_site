package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.common.PageResult;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.ArticleSaveRequest;
import com.fcdzy.site.dto.StatsDto;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Tag;
import com.fcdzy.site.entity.Topic;
import com.fcdzy.site.entity.TopicArticle;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.repository.CategoryRepository;
import com.fcdzy.site.repository.TagRepository;
import com.fcdzy.site.repository.TopicArticleRepository;
import com.fcdzy.site.repository.TopicRepository;
import com.fcdzy.site.util.MarkdownUtils;
import com.fcdzy.site.util.SlugUtils;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ArticleService {

    private static final int MAX_PAGE_SIZE = 50;

    private final ArticleRepository articleRepository;
    private final CategoryRepository categoryRepository;
    private final TagRepository tagRepository;
    private final TopicRepository topicRepository;
    private final TopicArticleRepository topicArticleRepository;

    public ArticleService(ArticleRepository articleRepository,
                          CategoryRepository categoryRepository,
                          TagRepository tagRepository,
                          TopicRepository topicRepository,
                          TopicArticleRepository topicArticleRepository) {
        this.articleRepository = articleRepository;
        this.categoryRepository = categoryRepository;
        this.tagRepository = tagRepository;
        this.topicRepository = topicRepository;
        this.topicArticleRepository = topicArticleRepository;
    }

    // ==================== 前台接口 ====================

    /**
     * 文章分页查询（前台）。
     * JPA 的 PageRequest 会把分页下推到数据库（LIMIT/OFFSET + COUNT），
     * 与 PageHelper 的 startPage 作用等价；页码从 1 开始，size 上限 50、默认 10。
     */
    @Transactional(readOnly = true)
    public PageResult<ArticleDto> publicList(int page, int size, Long categoryId, Long tagId, String keyword) {
        Pageable pageable = PageRequest.of(pageIndex(page), clampSize(size),
                Sort.by(Sort.Order.desc("topped"), Sort.Order.desc("publishedAt"), Sort.Order.desc("id")));
        Page<Article> result = articleRepository.findAll(spec(Article.Status.PUBLISHED, categoryId, tagId, keyword), pageable);
        return PageResult.of(result.getContent().stream().map(a -> ArticleDto.of(a, false)).toList(), result);
    }

    @Transactional(readOnly = true)
    public List<ArticleDto> publicRecent(int limit) {
        int size = Math.min(Math.max(limit, 1), 20);
        Pageable pageable = PageRequest.of(0, size,
                Sort.by(Sort.Order.desc("publishedAt"), Sort.Order.desc("id")));
        Page<Article> result = articleRepository.findAll(spec(Article.Status.PUBLISHED, null, null, null), pageable);
        return result.getContent().stream().map(a -> ArticleDto.of(a, false)).toList();
    }

    /** 热门文章：仅已发布，按阅读量降序，数量上限 5（可在调用处调整，最多 20） */
    @Transactional(readOnly = true)
    public List<ArticleDto> publicHot(int limit) {
        int size = Math.min(Math.max(limit, 1), 20);
        Pageable pageable = PageRequest.of(0, size, Sort.by(
                Sort.Order.desc("viewCount"), Sort.Order.desc("publishedAt"), Sort.Order.desc("id")));
        Page<Article> result = articleRepository.findAll(spec(Article.Status.PUBLISHED, null, null, null), pageable);
        return result.getContent().stream().map(a -> ArticleDto.of(a, false)).toList();
    }

    /** 文章详情：浏览量 +1，并附带所属专题与上下篇导航 */
    @Transactional
    public ArticleDto publicDetail(String slug) {
        Article article = articleRepository.findBySlug(slug)
                .filter(a -> a.getStatus() == Article.Status.PUBLISHED)
                .orElseThrow(() -> BizException.notFound("文章不存在或尚未发布"));
        long views = article.getViewCount() == null ? 0L : article.getViewCount();
        article.setViewCount(views + 1);
        articleRepository.save(article);

        ArticleDto dto = ArticleDto.of(article, true);
        dto.setTopics(topicsOfArticle(article.getId()));
        dto.setPrev(neighbor(article, true));
        dto.setNext(neighbor(article, false));
        return dto;
    }

    @Transactional(readOnly = true)
    public List<ArticleDto> allPublished() {
        return articleRepository
                .findAll(spec(Article.Status.PUBLISHED, null, null, null),
                        Sort.by(Sort.Order.desc("publishedAt"), Sort.Order.desc("id")))
                .stream().map(a -> ArticleDto.of(a, false)).toList();
    }

    @Transactional(readOnly = true)
    public List<TopicDto> topicsOfArticle(Long articleId) {
        List<Long> topicIds = topicArticleRepository.findByArticleId(articleId).stream()
                .map(TopicArticle::getTopicId).toList();
        if (topicIds.isEmpty()) {
            return List.of();
        }
        Map<Long, Topic> map = topicRepository.findAllById(topicIds).stream()
                .collect(Collectors.toMap(Topic::getId, Function.identity()));
        return topicIds.stream().map(map::get).filter(Objects::nonNull)
                .map(topic -> TopicDto.of(topic, null)).toList();
    }

    private ArticleDto.ArticleNav neighbor(Article current, boolean prev) {
        if (current.getPublishedAt() == null) {
            return null;
        }
        LocalDateTime anchor = current.getPublishedAt();
        Specification<Article> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("status"), Article.Status.PUBLISHED));
            predicates.add(cb.isNotNull(root.get("publishedAt")));
            predicates.add(prev ? cb.lessThan(root.get("publishedAt"), anchor)
                    : cb.greaterThan(root.get("publishedAt"), anchor));
            if (current.getId() != null) {
                predicates.add(cb.notEqual(root.get("id"), current.getId()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        Sort sort = prev
                ? Sort.by(Sort.Order.desc("publishedAt"), Sort.Order.desc("id"))
                : Sort.by(Sort.Order.asc("publishedAt"), Sort.Order.asc("id"));
        List<Article> list = articleRepository.findAll(spec, PageRequest.of(0, 1, sort)).getContent();
        if (list.isEmpty()) {
            return null;
        }
        Article nav = list.get(0);
        return new ArticleDto.ArticleNav(nav.getTitle(), nav.getSlug());
    }

    // ==================== 后台接口 ====================

    @Transactional(readOnly = true)
    public PageResult<ArticleDto> adminList(int page, int size, String status, Long categoryId, Long tagId, String keyword) {
        Pageable pageable = PageRequest.of(pageIndex(page), clampSize(size),
                Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id")));
        Page<Article> result = articleRepository.findAll(spec(parseStatus(status), categoryId, tagId, keyword), pageable);
        return PageResult.of(result.getContent().stream().map(a -> ArticleDto.of(a, false)).toList(), result);
    }

    @Transactional(readOnly = true)
    public List<ArticleDto> allForSelect() {
        return articleRepository.findAll(Sort.by(Sort.Order.desc("updatedAt"), Sort.Order.desc("id"))).stream()
                .map(a -> ArticleDto.of(a, false)).toList();
    }

    @Transactional(readOnly = true)
    public ArticleDto adminGet(Long id) {
        Article article = get(id);
        ArticleDto dto = ArticleDto.of(article, true);
        dto.setTopics(topicsOfArticle(id));
        return dto;
    }

    @Transactional
    public ArticleDto create(ArticleSaveRequest request) {
        Article article = new Article();
        applyRequest(article, request, null);
        return ArticleDto.of(articleRepository.save(article), true);
    }

    @Transactional
    public ArticleDto update(Long id, ArticleSaveRequest request) {
        Article article = get(id);
        applyRequest(article, request, id);
        return ArticleDto.of(articleRepository.save(article), true);
    }

    @Transactional
    public void delete(Long id) {
        Article article = get(id);
        topicArticleRepository.deleteByArticleId(id);
        articleRepository.delete(article);
    }

    @Transactional
    public ArticleDto changeStatus(Long id, String status) {
        Article article = get(id);
        Article.Status target = parseStatus(status);
        if (target == null) {
            throw new BizException("状态只能是 DRAFT 或 PUBLISHED");
        }
        if (target == Article.Status.PUBLISHED && article.getPublishedAt() == null) {
            article.setPublishedAt(LocalDateTime.now());
        }
        article.setStatus(target);
        return ArticleDto.of(articleRepository.save(article), false);
    }

    @Transactional(readOnly = true)
    public StatsDto stats() {
        long total = articleRepository.count();
        long published = articleRepository.countByStatus(Article.Status.PUBLISHED);
        Long views = articleRepository.sumViewCount();
        return new StatsDto(total, published, total - published,
                categoryRepository.count(), tagRepository.count(), topicRepository.count(),
                views == null ? 0L : views);
    }

    // ==================== 内部方法 ====================

    @Transactional(readOnly = true)
    public Article get(Long id) {
        return articleRepository.findById(id).orElseThrow(() -> BizException.notFound("文章不存在"));
    }

    private void applyRequest(Article article, ArticleSaveRequest request, Long selfId) {
        article.setTitle(request.title().trim());
        article.setSlug(SlugUtils.uniqueSlug(request.slug(), request.title(),
                slug -> articleRepository.findBySlug(slug)
                        .filter(exist -> selfId == null || !exist.getId().equals(selfId))
                        .isPresent()));
        article.setContent(request.content());
        String summary = request.summary();
        article.setSummary(summary == null || summary.isBlank()
                ? MarkdownUtils.summaryOf(request.content(), 160) : summary.trim());
        String cover = request.coverImage();
        if (cover == null || cover.isBlank()) {
            cover = MarkdownUtils.firstImage(request.content());
        }
        article.setCoverImage(cover);

        Article.Status status = parseStatus(request.status());
        if (status == null) {
            status = Article.Status.DRAFT;
        }
        if (status == Article.Status.PUBLISHED && article.getPublishedAt() == null) {
            article.setPublishedAt(LocalDateTime.now());
        }
        article.setStatus(status);
        article.setTopped(Boolean.TRUE.equals(request.topped()));

        if (request.categoryId() == null) {
            article.setCategory(null);
        } else {
            article.setCategory(categoryRepository.findById(request.categoryId())
                    .orElseThrow(() -> BizException.notFound("分类不存在")));
        }

        Set<Tag> tags = new LinkedHashSet<>();
        if (request.tagIds() != null && !request.tagIds().isEmpty()) {
            tags.addAll(tagRepository.findAllById(request.tagIds()));
        }
        article.setTags(tags);
    }

    private Specification<Article> spec(Article.Status status, Long categoryId, Long tagId, String keyword) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (categoryId != null) {
                predicates.add(cb.equal(root.get("category").get("id"), categoryId));
            }
            if (tagId != null) {
                Join<Object, Object> join = root.join("tags", JoinType.INNER);
                predicates.add(cb.equal(join.get("id"), tagId));
                if (query != null) {
                    query.distinct(true);
                }
            }
            if (keyword != null && !keyword.isBlank()) {
                String like = "%" + keyword.trim().toLowerCase() + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("title")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("summary"), "")), like)));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private Article.Status parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return Article.Status.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BizException("状态只能是 DRAFT 或 PUBLISHED");
        }
    }

    private int pageIndex(int page) {
        return Math.max(page - 1, 0);
    }

    private int clampSize(int size) {
        if (size <= 0) {
            return 10;
        }
        return Math.min(size, MAX_PAGE_SIZE);
    }
}
