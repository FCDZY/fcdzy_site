package com.fcdzy.site.service;

import com.fcdzy.site.config.SiteProperties;
import jakarta.mail.internet.MimeMessage;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 新评论通知邮件：异步发送给站长，任何异常只记日志，绝不影响评论提交。
 *
 * 只接收普通字符串（不传实体），避免异步线程里访问已关闭会话的懒加载属性。
 */
@Service
public class CommentMailService {

    private static final Logger log = LoggerFactory.getLogger(CommentMailService.class);
    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectProvider<JavaMailSender> mailSender;
    private final SiteProperties props;
    /** QQ 邮箱要求发件人地址与授权账号一致，否则报 501 */
    private final String fromAddress;

    public CommentMailService(ObjectProvider<JavaMailSender> mailSender, SiteProperties props,
                              @org.springframework.beans.factory.annotation.Value("${spring.mail.username:}") String fromAddress) {
        this.mailSender = mailSender;
        this.props = props;
        this.fromAddress = fromAddress == null ? "" : fromAddress.trim();
    }

    @Async("commentMailExecutor")
    public void notifyNewComment(String articleTitle, String articleSlug, String nickname, String email,
                                 String content, LocalDateTime createdAt, String replyToNickname) {
        SiteProperties.Comment conf = props.getComment();
        if (!conf.isMailEnabled()) {
            return;
        }
        JavaMailSender sender = mailSender.getIfAvailable();
        if (sender == null) {
            log.warn("未配置 JavaMailSender，跳过评论通知邮件");
            return;
        }
        String to = conf.getNotifyTo();
        if (!StringUtils.hasText(to)) {
            log.warn("未配置 site.comment.notify-to，跳过评论通知邮件");
            return;
        }
        boolean isReply = StringUtils.hasText(replyToNickname);
        long startedAt = System.currentTimeMillis();
        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, false, "UTF-8");
            helper.setTo(to);
            if (StringUtils.hasText(fromAddress)) {
                // From 必须与授权账号一致（QQ 邮箱限制）
                helper.setFrom(fromAddress);
            }
            if (StringUtils.hasText(email)) {
                // 点「回复」时直接回给评论者（可选，方便站长）
                try {
                    helper.setReplyTo(email);
                } catch (Exception ignored) {
                    // 邮箱格式不合法就忽略
                }
            }
            helper.setSubject((isReply ? "【新回复】" : "【新评论】") + articleTitle);
            helper.setText(buildBody(articleTitle, articleSlug, nickname, email, content, createdAt, replyToNickname), true);
            sender.send(message);
            // 线程名 comment-mail-N + 耗时，用来确认「评论接口没有等 SMTP」
            log.info("评论通知邮件已发送（耗时 {} ms，线程 {}）：article={} from={}",
                    System.currentTimeMillis() - startedAt, Thread.currentThread().getName(), articleSlug, nickname);
        } catch (Exception ex) {
            // 邮件失败不能影响评论本身
            log.warn("评论通知邮件发送失败（耗时 {} ms）：{}", System.currentTimeMillis() - startedAt, ex.getMessage());
        }
    }

    private String buildBody(String articleTitle, String articleSlug, String nickname, String email,
                             String content, LocalDateTime createdAt, String replyToNickname) {
        String base = props.getWebUrl() == null ? "" : props.getWebUrl().replaceAll("/+$", "");
        String link = base + "/article/" + articleSlug;
        boolean isReply = StringUtils.hasText(replyToNickname);
        StringBuilder sb = new StringBuilder();
        sb.append("<div style=\"font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.8;color:#1f2937\">");
        sb.append("<h3 style=\"margin:0 0 12px\">").append(isReply ? "收到一条新回复" : "收到一条新评论").append("</h3>");
        sb.append("<p style=\"margin:0 0 6px\"><b>文章：</b>").append(escape(articleTitle)).append("</p>");
        sb.append("<p style=\"margin:0 0 6px\"><b>链接：</b><a href=\"").append(escape(link)).append("\">")
                .append(escape(link)).append("</a></p>");
        sb.append("<p style=\"margin:0 0 6px\"><b>昵称：</b>").append(escape(nickname)).append("</p>");
        if (StringUtils.hasText(email)) {
            sb.append("<p style=\"margin:0 0 6px\"><b>邮箱：</b>").append(escape(email)).append("</p>");
        }
        if (isReply) {
            sb.append("<p style=\"margin:0 0 6px\"><b>回复给：</b>").append(escape(replyToNickname)).append("</p>");
        }
        sb.append("<p style=\"margin:0 0 6px\"><b>时间：</b>")
                .append(createdAt == null ? "" : TIME_FORMAT.format(createdAt)).append("</p>");
        sb.append("<blockquote style=\"margin:12px 0;padding:10px 14px;background:#f3f4f6;border-left:3px solid #3b82f6;border-radius:6px;white-space:pre-wrap\">")
                .append(escape(content)).append("</blockquote>");
        sb.append("<p style=\"margin:16px 0 0;color:#6b7280;font-size:12.5px\">该评论当前为「待审核」状态，")
                .append("请到后台「评论管理」审核通过后才会在文章页展示。</p>");
        sb.append("</div>");
        return sb.toString();
    }

    private String escape(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
