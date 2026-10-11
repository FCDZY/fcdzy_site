package com.fcdzy.site.common;

import java.util.List;
import org.springframework.data.domain.Page;

/**
 * 分页结果。
 */
public class PageResult<T> {

    private List<T> list;
    private long total;
    private int page;
    private int size;
    private int pages;

    public PageResult() {
    }

    public PageResult(List<T> list, long total, int page, int size, int pages) {
        this.list = list;
        this.total = total;
        this.page = page;
        this.size = size;
        this.pages = pages;
    }

    /** 由 Spring Data 的 Page 转换（页码对外从 1 开始）。 */
    public static <T> PageResult<T> of(Page<T> page) {
        return new PageResult<>(page.getContent(), page.getTotalElements(),
                page.getNumber() + 1, page.getSize(), page.getTotalPages());
    }

    /** 由已转换好的列表 + 总数构造。 */
    public static <T> PageResult<T> of(List<T> list, Page<?> page) {
        return new PageResult<>(list, page.getTotalElements(),
                page.getNumber() + 1, page.getSize(), page.getTotalPages());
    }

    public List<T> getList() {
        return list;
    }

    public void setList(List<T> list) {
        this.list = list;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public int getPages() {
        return pages;
    }

    public void setPages(int pages) {
        this.pages = pages;
    }
}
