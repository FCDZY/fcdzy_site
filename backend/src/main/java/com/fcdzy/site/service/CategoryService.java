package com.fcdzy.site.service;

import com.fcdzy.site.common.BizException;
import com.fcdzy.site.dto.CategoryDto;
import com.fcdzy.site.dto.CategorySaveRequest;
import com.fcdzy.site.entity.Article;
import com.fcdzy.site.entity.Category;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.repository.CategoryRepository;
import com.fcdzy.site.util.SlugUtils;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ArticleRepository articleRepository;

    public CategoryService(CategoryRepository categoryRepository, ArticleRepository articleRepository) {
        this.categoryRepository = categoryRepository;
        this.articleRepository = articleRepository;
    }

    @Transactional(readOnly = true)
    public List<CategoryDto> listWithCount() {
        return categoryRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(category -> CategoryDto.of(category,
                        articleRepository.countByCategoryIdAndStatus(category.getId(), Article.Status.PUBLISHED)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CategoryDto> listAll() {
        return categoryRepository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(category -> CategoryDto.of(category, null))
                .toList();
    }

    @Transactional(readOnly = true)
    public Category get(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> BizException.notFound("分类不存在"));
    }

    @Transactional
    public CategoryDto create(CategorySaveRequest request) {
        if (categoryRepository.existsByName(request.name().trim())) {
            throw new BizException("分类名称已存在");
        }
        Category category = new Category();
        apply(category, request, null);
        return CategoryDto.of(categoryRepository.save(category), 0L);
    }

    @Transactional
    public CategoryDto update(Long id, CategorySaveRequest request) {
        Category category = get(id);
        if (!category.getName().equals(request.name().trim())
                && categoryRepository.existsByName(request.name().trim())) {
            throw new BizException("分类名称已存在");
        }
        apply(category, request, id);
        return CategoryDto.of(categoryRepository.save(category), null);
    }

    @Transactional
    public void delete(Long id) {
        Category category = get(id);
        articleRepository.clearCategory(id);
        categoryRepository.delete(category);
    }

    private void apply(Category category, CategorySaveRequest request, Long selfId) {
        category.setName(request.name().trim());
        category.setSlug(SlugUtils.uniqueSlug(request.slug(), request.name(),
                slug -> categoryRepository.findBySlug(slug)
                        .filter(exist -> selfId == null || !exist.getId().equals(selfId))
                        .isPresent()));
        category.setDescription(request.description());
        category.setSortOrder(request.sortOrder() == null ? 0 : request.sortOrder());
    }
}
