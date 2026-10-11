package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.dto.TagDto;
import com.fcdzy.site.dto.TagSaveRequest;
import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Tag;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.repository.TagRepository;
import com.fcdzy.site.util.SlugUtils;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TagService {

    private final TagRepository tagRepository;
    private final ArticleRepository articleRepository;

    public TagService(TagRepository tagRepository, ArticleRepository articleRepository) {
        this.tagRepository = tagRepository;
        this.articleRepository = articleRepository;
    }

    @Transactional(readOnly = true)
    public List<TagDto> listWithCount() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(tag -> TagDto.of(tag,
                        articleRepository.countByTagAndStatus(tag.getId(), Article.Status.PUBLISHED)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<TagDto> listAll() {
        return tagRepository.findAllByOrderByNameAsc().stream()
                .map(tag -> TagDto.of(tag, null))
                .toList();
    }

    @Transactional
    public TagDto create(TagSaveRequest request) {
        if (tagRepository.existsByName(request.name().trim())) {
            throw new BizException("标签名称已存在");
        }
        Tag tag = new Tag();
        apply(tag, request, null);
        return TagDto.of(tagRepository.save(tag), 0L);
    }

    @Transactional
    public TagDto update(Long id, TagSaveRequest request) {
        Tag tag = get(id);
        if (!tag.getName().equals(request.name().trim()) && tagRepository.existsByName(request.name().trim())) {
            throw new BizException("标签名称已存在");
        }
        apply(tag, request, id);
        return TagDto.of(tagRepository.save(tag), null);
    }

    @Transactional
    public void delete(Long id) {
        Tag tag = get(id);
        articleRepository.deleteTagRelations(id);
        tagRepository.delete(tag);
    }

    @Transactional(readOnly = true)
    public Tag get(Long id) {
        return tagRepository.findById(id).orElseThrow(() -> BizException.notFound("标签不存在"));
    }

    private void apply(Tag tag, TagSaveRequest request, Long selfId) {
        tag.setName(request.name().trim());
        tag.setSlug(SlugUtils.uniqueSlug(request.slug(), request.name(),
                slug -> tagRepository.findBySlug(slug)
                        .filter(exist -> selfId == null || !exist.getId().equals(selfId))
                        .isPresent()));
    }
}
