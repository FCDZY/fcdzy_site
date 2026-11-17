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

    // ==================== 阅读时长 / 字数 ====================

    /** 中文按 400 字/分钟；英文单词按 1.5 个字折算 */
    private static final double CJK_PER_MINUTE = 400.0;
    private static final double LATIN_WEIGHT = 1.5;

    private static final java.util.regex.Pattern CJK = java.util.regex.Pattern.compile("[\\u4e00-\\u9fa5]");
    private static final java.util.regex.Pattern LATIN =
            java.util.regex.Pattern.compile("[A-Za-z][A-Za-z0-9'_\\-]*");

    /**
     * 字数与预计阅读时长。
     *
     * <p>规则必须和前端 src/utils/reading.ts 保持一致，否则会出现
     * 「列表显示 8 分钟、点进详情 12 分钟」这种自相矛盾：
     * 剔除代码块、行内代码、图片、表格行与标记符号，链接只保留文字。</p>
     */
    public static ReadingStats readingStats(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return new ReadingStats(0, 0);
        }
        String text = markdown
                .replaceAll("(?s)```.*?```", " ")   // 围栏代码块
                .replaceAll("(?s)~~~.*?~~~", " ")
                .replaceAll("`[^`\n]*`", " ")       // 行内代码
                .replaceAll("!\\[[^\\]]*\\]\\([^)]*\\)", " ")  // 图片
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1") // 链接保留文字
                .replaceAll("(?m)^\\s{0,3}#{1,6}\\s+", " ")     // 标题井号
                .replaceAll("(?m)^\\s{0,3}>\\s?", " ")          // 引用
                .replaceAll("(?m)^\\s*[-*+]\\s+", " ")          // 无序列表
                .replaceAll("(?m)^\\s*\\d+\\.\\s+", " ")        // 有序列表
                .replaceAll("(?m)^\\s*\\|.*\\|\\s*$", " ")      // 表格行
                .replaceAll("[-*_~|>#]", " ");                  // 残留标记

        int cjk = count(CJK, text);
        int latin = count(LATIN, text);
        int chars = cjk + latin;
        if (chars == 0) {
            return new ReadingStats(0, 0);
        }
        int minutes = (int) Math.max(1, Math.round((cjk + latin * LATIN_WEIGHT) / CJK_PER_MINUTE));
        return new ReadingStats(chars, minutes);
    }

    private static int count(java.util.regex.Pattern pattern, String text) {
        java.util.regex.Matcher matcher = pattern.matcher(text);
        int total = 0;
        while (matcher.find()) {
            total += 1;
        }
        return total;
    }

    /** 字数 + 预计分钟数 */
    public record ReadingStats(int chars, int minutes) {
    }
}
