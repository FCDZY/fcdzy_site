package com.fcdzy.site.dto;

import java.util.List;

/**
 * 专题内文章排序请求：articleIds 的顺序即为专题内展示顺序。
 */
public record TopicArticlesRequest(List<Long> articleIds) {

    public List<Long> safeArticleIds() {
        return articleIds == null ? List.of() : articleIds;
    }
}
