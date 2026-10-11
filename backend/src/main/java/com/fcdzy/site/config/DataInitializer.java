package com.fcdzy.site.config;

import com.fcdzy.site.dto.ArticleSaveRequest;
import com.fcdzy.site.dto.CategoryDto;
import com.fcdzy.site.dto.CategorySaveRequest;
import com.fcdzy.site.dto.TagDto;
import com.fcdzy.site.dto.TagSaveRequest;
import com.fcdzy.site.dto.TopicDto;
import com.fcdzy.site.dto.TopicSaveRequest;
import com.fcdzy.site.entity.AdminUser;
import com.fcdzy.site.repository.AdminUserRepository;
import com.fcdzy.site.repository.ArticleRepository;
import com.fcdzy.site.service.ArticleService;
import com.fcdzy.site.service.CategoryService;
import com.fcdzy.site.service.SiteConfigService;
import com.fcdzy.site.service.TagService;
import com.fcdzy.site.service.TopicService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 首次启动初始化：管理员账号（BCrypt 加密）、站点默认配置、演示内容。
 * 已存在数据时不会重复写入。
 */
@Component
public class DataInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final SiteProperties siteProperties;
    private final SiteConfigService siteConfigService;
    private final CategoryService categoryService;
    private final TagService tagService;
    private final TopicService topicService;
    private final ArticleService articleService;
    private final ArticleRepository articleRepository;

    public DataInitializer(AdminUserRepository adminUserRepository,
                           PasswordEncoder passwordEncoder,
                           SiteProperties siteProperties,
                           SiteConfigService siteConfigService,
                           CategoryService categoryService,
                           TagService tagService,
                           TopicService topicService,
                           ArticleService articleService,
                           ArticleRepository articleRepository) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.siteProperties = siteProperties;
        this.siteConfigService = siteConfigService;
        this.categoryService = categoryService;
        this.tagService = tagService;
        this.topicService = topicService;
        this.articleService = articleService;
        this.articleRepository = articleRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        initAdmin();
        siteConfigService.initDefaults();
        if (articleRepository.count() == 0) {
            seedDemoContent();
        }
    }

    private void initAdmin() {
        SiteProperties.Admin admin = siteProperties.getAdmin();
        if (adminUserRepository.findByUsername(admin.getUsername()).isPresent()) {
            return;
        }
        AdminUser user = new AdminUser();
        user.setUsername(admin.getUsername());
        user.setPassword(passwordEncoder.encode(admin.getPassword()));
        user.setNickname(admin.getNickname());
        adminUserRepository.save(user);
        log.info("已创建默认管理员账号：{} / {}（请登录后尽快修改密码）", admin.getUsername(), admin.getPassword());
    }

    private void seedDemoContent() {
        CategoryDto tech = categoryService.create(new CategorySaveRequest("技术笔记", "tech", "编程与技术实践记录", 1));
        CategoryDto life = categoryService.create(new CategorySaveRequest("生活随笔", "life", "生活与思考", 2));

        TagDto spring = tagService.create(new TagSaveRequest("SpringBoot", "springboot"));
        TagDto vue = tagService.create(new TagSaveRequest("Vue3", "vue3"));
        TagDto mysql = tagService.create(new TagSaveRequest("MySQL", "mysql"));
        TagDto essay = tagService.create(new TagSaveRequest("随笔", "essay"));

        ArticleSaveRequest first = new ArticleSaveRequest(
                "使用 SpringBoot + Vue3 搭建个人网站",
                "build-personal-site",
                "从零开始搭建一个前后端分离的个人网站：后端 SpringBoot + MySQL + JWT，前端 Vue3 + Vite。",
                """
                        # 使用 SpringBoot + Vue3 搭建个人网站

                        这是一篇演示文章，用来展示 Markdown 渲染与代码高亮效果。

                        ## 技术选型

                        | 层次 | 技术 | 说明 |
                        | --- | --- | --- |
                        | 后端 | SpringBoot 3 | REST API、Spring Security + JWT |
                        | 数据库 | MySQL 8 | 文章、分类、标签、专题 |
                        | 前端 | Vue3 + Vite | 前台展示 + 后台管理 |

                        ## 后端接口示例

                        ```java
                        @RestController
                        @RequestMapping("/api/public")
                        public class PublicController {

                            @GetMapping("/articles/{slug}")
                            public ApiResponse<ArticleDto> detail(@PathVariable String slug) {
                                return ApiResponse.ok(articleService.publicDetail(slug));
                            }
                        }
                        ```

                        ## 前端调用示例

                        ```js
                        import axios from 'axios'

                        const http = axios.create({ baseURL: '/api' })

                        export function fetchArticles(params) {
                          return http.get('/public/articles', { params })
                        }
                        ```

                        > 提示：把常用逻辑抽成 composable，页面会清爽很多。

                        ## 小结

                        1. 先定接口，再写页面
                        2. 后台功能优先保证数据正确
                        3. 移动端适配从头开始做，成本最低
                        """,
                null, "PUBLISHED", tech.getId(), List.of(spring.getId(), vue.getId(), mysql.getId()), Boolean.TRUE);

        ArticleSaveRequest second = new ArticleSaveRequest(
                "MySQL 常用优化与索引笔记",
                "mysql-index-notes",
                "记录几个常见的索引与慢查询优化手段，适合日常排查使用。",
                """
                        # MySQL 常用优化与索引笔记

                        ## 索引失效的常见场景

                        - 在索引列上使用函数或运算
                        - 隐式类型转换，例如字符串列用数字查询
                        - 以 `%` 开头的模糊匹配

                        ## 查看执行计划

                        ```sql
                        EXPLAIN SELECT a.id, a.title
                        FROM article a
                        WHERE a.status = 'PUBLISHED'
                        ORDER BY a.published_at DESC
                        LIMIT 10;
                        ```

                        ## 建议

                        1. 为高频查询条件建立联合索引，注意最左前缀
                        2. 分页查询避免大偏移量，可用游标分页
                        3. 定期用 `EXPLAIN` 复核核心 SQL
                        """,
                null, "PUBLISHED", tech.getId(), List.of(mysql.getId()), Boolean.FALSE);

        ArticleSaveRequest third = new ArticleSaveRequest(
                "写作这件小事",
                "writing-notes",
                "关于坚持写作的一些体会，以及我的记录方式。",
                """
                        # 写作这件小事

                        写作不是天赋，更像是一种习惯。

                        ## 我的做法

                        - 每天留 20 分钟写点东西
                        - 先写草稿，第二天再改
                        - 把碎片想法记到标签里，需要时再整理成文

                        > 重要的不是一次写得多好，而是持续写下去。
                        """,
                null, "PUBLISHED", life.getId(), List.of(essay.getId()), Boolean.FALSE);

        ArticleSaveRequest draft = new ArticleSaveRequest(
                "（草稿）下一篇文章的计划",
                "draft-next-plan",
                "这是一篇草稿，用于演示后台的草稿状态。",
                """
                        # 下一篇文章的计划

                        这篇是草稿，只有登录后台才能看到，前台不会展示。
                        """,
                null, "DRAFT", life.getId(), List.of(essay.getId()), Boolean.FALSE);

        var a1 = articleService.create(first);
        var a2 = articleService.create(second);
        var a3 = articleService.create(third);
        articleService.create(draft);

        TopicDto topic = topicService.create(new TopicSaveRequest(
                "从零搭建个人网站", "build-site",
                "从后端到前端，完整走一遍个人网站的开发流程。", null, 1));
        topicService.setArticles(topic.getId(), List.of(a1.getId(), a2.getId(), a3.getId()));

        log.info("已初始化演示数据：{} 个分类、{} 个标签、1 个专题、4 篇文章（含 1 篇草稿）",
                2, 4);
    }
}
