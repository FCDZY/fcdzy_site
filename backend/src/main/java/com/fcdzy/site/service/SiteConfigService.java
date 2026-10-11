package com.fcdzy.site.service;

import com.fcdzy.site.entity.SiteConfig;
import com.fcdzy.site.repository.SiteConfigRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 站点基础信息配置（键值对）。
 */
@Service
public class SiteConfigService {

    /** 默认配置，数据库中的同名键会覆盖默认值 */
    public static LinkedHashMap<String, String> defaults() {
        LinkedHashMap<String, String> map = new LinkedHashMap<>();
        map.put("siteName", "我的个人网站");
        map.put("siteSubtitle", "记录技术、生活与思考");
        map.put("siteDescription", "这是一个使用 SpringBoot + Vue3 搭建的个人网站，用于记录技术笔记与生活随笔。");
        map.put("siteKeywords", "个人网站,博客,技术分享,SpringBoot,Vue3");
        map.put("siteLogo", "");
        map.put("siteFavicon", "");
        map.put("authorName", "站长");
        map.put("authorAvatar", "");
        map.put("authorBio", "热爱编程与写作，欢迎交流。");
        map.put("footerText", "© 我的个人网站 · 用心记录每一天");
        map.put("icp", "");
        map.put("githubUrl", "");
        map.put("email", "");
        map.put("startYear", String.valueOf(java.time.LocalDate.now().getYear()));
        map.put("homeBannerTitle", "欢迎来到我的个人网站");
        map.put("homeBannerSubtitle", "这里记录我的技术笔记、项目经验与生活随笔");
        return map;
    }

    private final SiteConfigRepository siteConfigRepository;

    public SiteConfigService(SiteConfigRepository siteConfigRepository) {
        this.siteConfigRepository = siteConfigRepository;
    }

    @Transactional(readOnly = true)
    public Map<String, String> getConfig() {
        LinkedHashMap<String, String> map = defaults();
        for (SiteConfig config : siteConfigRepository.findAll()) {
            map.put(config.getConfigKey(), config.getConfigValue() == null ? "" : config.getConfigValue());
        }
        return map;
    }

    @Transactional
    public Map<String, String> updateConfig(Map<String, String> values) {
        if (values != null) {
            values.forEach((key, value) -> {
                if (key == null || key.isBlank()) {
                    return;
                }
                siteConfigRepository.save(new SiteConfig(key, value == null ? "" : value));
            });
        }
        return getConfig();
    }

    @Transactional
    public void initDefaults() {
        List<String> existing = siteConfigRepository.findAll().stream().map(SiteConfig::getConfigKey).toList();
        defaults().forEach((key, value) -> {
            if (!existing.contains(key)) {
                siteConfigRepository.save(new SiteConfig(key, value));
            }
        });
    }
}
