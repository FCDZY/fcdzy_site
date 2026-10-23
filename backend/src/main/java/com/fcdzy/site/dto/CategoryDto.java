package com.fcdzy.site.dto;

public class CategoryDto {

    private Long id;
    private String name;
    private String slug;
    private String description;
    private Integer sortOrder;
    private Long articleCount;

    public static CategoryDto of(com.fcdzy.site.entity.Category category, Long articleCount) {
        if (category == null) {
            return null;
        }
        CategoryDto dto = new CategoryDto();
        dto.id = category.getId();
        dto.name = category.getName();
        dto.slug = category.getSlug();
        dto.description = category.getDescription();
        dto.sortOrder = category.getSortOrder();
        dto.articleCount = articleCount;
        return dto;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    public String getDescription() {
        return description;
    }

    public Integer getSortOrder() {
        return sortOrder;
    }

    public Long getArticleCount() {
        return articleCount;
    }
}
