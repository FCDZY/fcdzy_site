package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.dto.ArticleDto;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.dto.TopicSaveRequest;
import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Topic;
import com.fcdzy.site.entity.TopicArticle;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.repository.TopicArticleRepository;
import com.fcdzy.site.repository.TopicRepository;
import com.fcdzy.site.util.SlugUtils;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TopicService {

    private final TopicRepository topicRepository;
    private final TopicArticleRepository topicArticleRepository;
    private final ArticleRepository articleRepository;

    public TopicService(TopicRepository topicRepository,
                        TopicArticleRepository topicArticleRepository,
                        ArticleRepository articleRepository) {
        this.topicRepository = topicRepository;
        this.topicArticleRepository = topicArticleRepository;
        this.articleRepository = articleRepository;
    }

    @Transactional(readOnly = true)
    public List<TopicDto> listWithCount() {
        return topicRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(topic -> TopicDto.of(topic, topicArticleRepository.countByTopicId(topic.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public Topic getBySlug(String slug) {
        return topicRepository.findBySlug(slug).orElseThrow(() -> BizException.notFound("专题不存在"));
    }

    @Transactional(readOnly = true)
    public Topic get(Long id) {
        return topicRepository.findById(id).orElseThrow(() -> BizException.notFound("专题不存在"));
    }

    /** 专题内文章，按自定义顺序返回；onlyPublished 为 true 时过滤草稿 */
    @Transactional(readOnly = true)
    public List<ArticleDto> articlesOfTopic(Long topicId, boolean onlyPublished) {
        List<Long> ids = orderedArticleIds(topicId);
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, Article> map = articleRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Article::getId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        return ids.stream()
                .map(map::get)
                .filter(Objects::nonNull)
                .filter(article -> !onlyPublished || article.getStatus() == Article.Status.PUBLISHED)
                .map(article -> ArticleDto.of(article, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Long> orderedArticleIds(Long topicId) {
        return topicArticleRepository.findByTopicIdOrderBySortOrderAscIdAsc(topicId).stream()
                .map(TopicArticle::getArticleId)
                .toList();
    }

    @Transactional
    public TopicDto create(TopicSaveRequest request) {
        if (topicRepository.existsByName(request.name().trim())) {
            throw new BizException("专题名称已存在");
        }
        Topic topic = new Topic();
        apply(topic, request, null);
        return TopicDto.of(topicRepository.save(topic), 0L);
    }

    @Transactional
    public TopicDto update(Long id, TopicSaveRequest request) {
        Topic topic = get(id);
        if (!topic.getName().equals(request.name().trim()) && topicRepository.existsByName(request.name().trim())) {
            throw new BizException("专题名称已存在");
        }
        apply(topic, request, id);
        return TopicDto.of(topicRepository.save(topic), topicArticleRepository.countByTopicId(id));
    }

    @Transactional
    public void delete(Long id) {
        Topic topic = get(id);
        topicArticleRepository.deleteAllByTopicId(id);
        topicRepository.delete(topic);
    }

    /** 保存专题内文章及顺序：articleIds 的顺序即展示顺序 */
    @Transactional
    public void setArticles(Long topicId, List<Long> articleIds) {
        get(topicId);
        topicArticleRepository.deleteAllByTopicId(topicId);
        topicArticleRepository.flush();
        List<Long> valid = articleIds.stream().distinct()
                .filter(articleRepository::existsById)
                .toList();
        int order = 0;
        for (Long articleId : valid) {
            order += 10;
            topicArticleRepository.save(new TopicArticle(topicId, articleId, order));
        }
    }

    private void apply(Topic topic, TopicSaveRequest request, Long selfId) {
        topic.setName(request.name().trim());
        topic.setSlug(SlugUtils.uniqueSlug(request.slug(), request.name(),
                slug -> topicRepository.findBySlug(slug)
                        .filter(exist -> selfId == null || !exist.getId().equals(selfId))
                        .isPresent()));
        topic.setDescription(request.description());
        topic.setCoverImage(request.coverImage());
        topic.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
    }
}
