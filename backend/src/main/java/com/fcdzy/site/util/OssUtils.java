package com.fcdzy.site.util;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.OSSErrorCode;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.ClientException;
import com.aliyun.oss.model.ObjectMetadata;
import com.aliyun.oss.model.PutObjectRequest;
import com.fcdzy.site.common.BizException;
import com.fcdzy.site.config.SiteProperties;
import jakarta.annotation.PreDestroy;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * 阿里云 OSS 工具类（后端中转上传方案）。
 *
 * 关键点：
 * 1. 只有后端持有 AK，浏览器只跟我们的 /api/admin/upload 打交道，AK 不会下发到前端；
 * 2. 对象命名 image/yyyyMMdd/<uuid>.<ext>，按日期分目录，UUID 保证不重名覆盖；
 * 3. 上传时写入 Cache-Control: public, max-age=2592000（30 天），减少重复回源与外网流量；
 * 4. Bucket 设为「公共读、私有写」：访客可匿名读取图片，写入必须带 AK，
 *    因此返回的 URL 可以直接放进博客展示；
 * 5. 所有 OSS 异常都转成友好的中文提示，绝不把 AK / 堆栈细节暴露给前端。
 */
@Component
public class OssUtils {

    private static final Logger log = LoggerFactory.getLogger(OssUtils.class);

    /** 只允许这三种图片格式（jpeg 与 jpg 等价，一并放行） */
    public static final String[] ALLOWED_EXT = {"jpg", "jpeg", "png", "webp"};

    private final SiteProperties props;

    /** OSS 客户端是线程安全的，全局复用一个即可；volatile + 双重检查保证懒加载只初始化一次 */
    private volatile OSS client;

    public OssUtils(SiteProperties props) {
        this.props = props;
    }

    /** OSS 是否已配置完整；未配置时 UploadService 会自动回退到本地磁盘 */
    public boolean isEnabled() {
        return props.getOss().isConfigured();
    }

    /** 当前存储模式：oss / local（前端配置接口也会返回这个值） */
    public String mode() {
        return isEnabled() ? "oss" : "local";
    }

    private OSS client() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    SiteProperties.Oss conf = props.getOss();
                    // Endpoint 不带协议头，SDK 内部会按 https 访问
                    String endpoint = conf.getEndpoint().trim()
                            .replaceFirst("^https?://", "")
                            .replaceAll("/+$", "");
                    client = new OSSClientBuilder().build(endpoint,
                            conf.getAccessKeyId().trim(), conf.getAccessKeySecret().trim());
                    log.info("OSS 客户端已初始化：endpoint={} bucket={}", endpoint, conf.getBucketName());
                }
            }
        }
        return client;
    }

    /** 应用关闭时释放连接池，避免线程泄漏 */
    @PreDestroy
    public void shutdown() {
        if (client != null) {
            client.shutdown();
            client = null;
        }
    }

    /**
     * 生成对象 Key：image/yyyyMMdd/<uuid>.<ext>
     * 用服务器日期分目录（与全站时区一致），UUID 保证同一秒上传多张也不会覆盖。
     */
    public String buildObjectKey(String originalFilename) {
        String ext = extensionOf(originalFilename);
        String date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE); // yyyyMMdd
        String uuid = UUID.randomUUID().toString().replace("-", "");
        String prefix = props.getOss().getDirPrefix();
        String dir = (prefix == null || prefix.isBlank()) ? "image" : prefix.replaceAll("^/+|/+$", "");
        return dir + "/" + date + "/" + uuid + "." + ext;
    }

    /** 从原始文件名里取小写扩展名（没有扩展名时返回空串） */
    public static String extensionOf(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return "";
        }
        return originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** 公共读 Bucket 的匿名访问地址：https://<bucket>.<endpoint>/<key> */
    public String publicUrl(String objectKey) {
        SiteProperties.Oss conf = props.getOss();
        String endpoint = conf.getEndpoint().trim()
                .replaceFirst("^https?://", "")
                .replaceAll("/+$", "");
        // 如果填的是带 region 的 endpoint（如 oss-cn-beijing.aliyuncs.com），这里直接拼即可
        return "https://" + conf.getBucketName().trim() + "." + endpoint + "/" + objectKey;
    }

    /**
     * 上传图片并返回可公开访问的 URL。
     *
     * @throws BizException 上传失败（含 OSS 鉴权失败、网络异常等），消息可直接展示给用户
     */
    public String upload(MultipartFile file) {
        SiteProperties.Oss conf = props.getOss();
        if (!isEnabled()) {
            throw new BizException(500, "OSS 未配置，请在 application-local.yml 中填写 AccessKeySecret", 500);
        }

        String objectKey = buildObjectKey(file.getOriginalFilename());
        String contentType = contentTypeOf(file);
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(file.getSize());
        metadata.setContentType(contentType);
        // 30 天浏览器缓存：同一张图二次访问直接命中本地缓存，省外网流出流量
        metadata.setCacheControl("public, max-age=" + Math.max(0, conf.getCacheMaxAge()));

        try (InputStream in = file.getInputStream()) {
            PutObjectRequest request = new PutObjectRequest(conf.getBucketName().trim(), objectKey, in, metadata);
            client().putObject(request);
            String url = publicUrl(objectKey);
            log.info("OSS 上传成功：key={} size={}B type={} url={}", objectKey, file.getSize(), contentType, url);
            return url;
        } catch (OSSException ex) {
            // 服务端返回的错误：鉴权失败、Bucket 不存在、权限不足等
            log.warn("OSS 上传失败（OSSException）：code={} message={} requestId={}",
                    ex.getErrorCode(), ex.getErrorMessage(), ex.getRequestId());
            throw new BizException(500, friendlyMessage(ex), 500);
        } catch (ClientException ex) {
            // 客户端错误：网络不通、Endpoint 写错、域名解析失败等
            log.warn("OSS 上传失败（ClientException）：{}", ex.getMessage());
            throw new BizException(500, "无法连接 OSS，请检查服务端网络或 Endpoint 配置", 500);
        } catch (Exception ex) {
            log.warn("OSS 上传失败（未知异常）：{}", ex.getMessage());
            throw new BizException(500, "图片上传失败，请稍后重试", 500);
        }
    }

    /** 把 OSS 错误码翻译成用户能看懂的提示 */
    private String friendlyMessage(OSSException ex) {
        String code = ex.getErrorCode() == null ? "" : ex.getErrorCode();
        String raw = ex.getErrorMessage() == null ? "" : ex.getErrorMessage();
        if (OSSErrorCode.INVALID_ACCESS_KEY_ID.equals(code)
                || OSSErrorCode.SIGNATURE_DOES_NOT_MATCH.equals(code)) {
            return "OSS 鉴权失败：AccessKeyId 或 AccessKeySecret 不正确，请检查 application-local.yml";
        }
        if ("AccessDenied".equalsIgnoreCase(code)) {
            // 密钥有效但没权限：AK 属于 RAM 子账号时，需要在 RAM 里授予 oss:PutObject
            if (raw.toLowerCase().contains("bucket acl") || raw.toLowerCase().contains("no right to access")) {
                return "当前 AccessKey 没有该 Bucket 的写入权限（RAM 授权不足），请给它授予 oss:PutObject 权限后重试";
            }
            return "无权写入该 OSS Bucket，请检查 Bucket 读写权限与 AK 的授权策略";
        }
        if ("NoSuchBucket".equalsIgnoreCase(code)) {
            return "OSS Bucket 不存在，请检查 bucketName 与 endpoint 是否属于同一地域";
        }
        if ("RequestTimeTooSkewed".equalsIgnoreCase(code)) {
            return "服务器时间与阿里云偏差过大，请校准系统时间后重试";
        }
        return "图片上传失败：" + (raw.isBlank() ? code : raw);
    }

    /** 根据扩展名推断 Content-Type（不依赖浏览器上传时带的类型，更可靠） */
    private String contentTypeOf(MultipartFile file) {
        String ext = extensionOf(file.getOriginalFilename());
        return switch (ext) {
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            default -> "image/jpeg";
        };
    }
}
