package com.fcdzy.site.dto;

public class TagDto {

    private Long id;
    private String name;
    private String slug;
    private Long articleCount;

    public static TagDto of(com.fcdzy.site.entity.Tag tag, Long articleCount) {
        if (tag == null) {
            return null;
        }
        TagDto dto = new TagDto();
        dto.id = tag.getId();
        dto.name = tag.getName();
        dto.slug = tag.getSlug();
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

    public Long getArticleCount() {
        return articleCount;
    }
}
