package com.fcdzy.site.config;

import java.nio.file.Path;
import java.nio.file.Paths;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 把本地上传目录映射到 /uploads/**，供前台直接访问图片。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final SiteProperties siteProperties;

    public WebMvcConfig(SiteProperties siteProperties) {
        this.siteProperties = siteProperties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path uploadPath = Paths.get(siteProperties.getUploadDir()).toAbsolutePath().normalize();
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadPath.toUri().toString());
    }
}
