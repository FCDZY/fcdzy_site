package com.fcdzy.site.util;

import java.text.Normalizer;
import java.util.Locale;
import java.util.function.Predicate;

/**
 * 生成 URL 友好的 slug。中文标题无法转写时退化为时间戳后缀。
 */
public final class SlugUtils {

    private SlugUtils() {
    }

    public static String slugify(String input) {
        if (input == null || input.isBlank()) {
            return "";
        }
        String normalized = Normalizer.normalize(input, Normalizer.Form.NFKD)
                .replaceAll("\\p{InCombiningDiacriticalMarks}+", "");
        String slug = normalized.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9\\u4e00-\\u9fa5]+", "-")
                .replaceAll("^-+|-+$", "");
        return slug;
    }

    /**
     * 生成唯一 slug：优先使用参数，其次标题，最后退化为前缀 + 时间戳。
     *
     * @param exists 判断某个 slug 是否已被占用
     */
    public static String uniqueSlug(String preferred, String fallbackSource, Predicate<String> exists) {
        String base = slugify(preferred);
        if (base.isEmpty()) {
            base = slugify(fallbackSource);
        }
        // 保留中文可能导致 URL 编码，这里统一转成短横线拼 ASCII；若全中文则用 post- 前缀
        base = base.replaceAll("[\\u4e00-\\u9fa5]", "").replaceAll("-{2,}", "-").replaceAll("^-+|-+$", "");
        if (base.isEmpty()) {
            base = "post-" + Long.toString(System.currentTimeMillis(), 36);
        }
        if (base.length() > 180) {
            base = base.substring(0, 180).replaceAll("-+$", "");
        }
        String candidate = base;
        int index = 1;
        while (exists.test(candidate)) {
            candidate = base + "-" + (++index);
        }
        return candidate;
    }
}
