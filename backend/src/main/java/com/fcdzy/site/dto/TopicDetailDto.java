package com.fcdzy.site.dto;

import java.util.List;

public record TopicDetailDto(TopicDto topic, List<ArticleDto> articles, List<Long> articleIds) {
}
