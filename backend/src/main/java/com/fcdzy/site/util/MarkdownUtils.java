package com.fcdzy.site.util;

/**
 * Markdown 文本工具：用于在未填写摘要时自动生成纯文本摘要。
 */
public final class MarkdownUtils {

    private MarkdownUtils() {
    }

    public static String toPlainText(String markdown) {
        if (markdown == null) {
            return "";
        }
        String text = markdown;
        // 代码块与行内代码
        text = text.replaceAll("(?s)```.*?```", " ");
        text = text.replaceAll("`[^`]*`", " ");
        // HTML 标签
        text = text.replaceAll("(?s)<[^>]+>", " ");
        // 图片与链接
        text = text.replaceAll("!\\[[^\\]]*\\]\\([^)]*\\)", " ");
        text = text.replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1");
        // 标题、引用、列表符号
        text = text.replaceAll("(?m)^\\s{0,3}#{1,6}\\s*", " ");
        text = text.replaceAll("(?m)^\\s{0,3}>\\s?", " ");
        text = text.replaceAll("(?m)^\\s{0,3}[-*+]\\s+", " ");
        text = text.replaceAll("(?m)^\\s{0,3}\\d+\\.\\s+", " ");
        // 分隔线与表格
        text = text.replaceAll("(?m)^\\s*[-*_]{3,}\\s*$", " ");
        text = text.replaceAll("\\|", " ");
        // 强调符号
        text = text.replaceAll("[*_~]{1,3}", "");
        text = text.replaceAll("\\s+", " ").trim();
        return text;
    }

    public static String summaryOf(String markdown, int maxLength) {
        String text = toPlainText(markdown);
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + "…";
    }

    public static String firstImage(String markdown) {
        if (markdown == null) {
            return null;
        }
        java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("!\\[[^\\]]*\\]\\(([^)\\s]+)[^)]*\\)")
                .matcher(markdown);
        return matcher.find() ? matcher.group(1) : null;
    }
}
