package com.fcdzy.site.dto;

import java.util.List;

/**
 * 阅读趋势（后台仪表盘折线图）。
 */
public class ViewTrendDto {

    /** 统计天数 */
    private int days;
    /** 这段时间的总阅读量 */
    private long total;
    /** 是否有真实数据（全为 0 时前端提示「统计从今天开始」） */
    private boolean hasData;
    private List<Point> points;

    public ViewTrendDto(int days, long total, List<Point> points) {
        this.days = days;
        this.total = total;
        this.points = points;
        this.hasData = total > 0;
    }

    public int getDays() {
        return days;
    }

    public long getTotal() {
        return total;
    }

    public boolean isHasData() {
        return hasData;
    }

    public List<Point> getPoints() {
        return points;
    }

    /** 单日数据点：date = yyyy-MM-dd，label = MM-dd（图表 X 轴用） */
    public static class Point {
        private String date;
        private String label;
        private long views;

        public Point(String date, String label, long views) {
            this.date = date;
            this.label = label;
            this.views = views;
        }

        public String getDate() {
            return date;
        }

        public String getLabel() {
            return label;
        }

        public long getViews() {
            return views;
        }
    }
}
