package com.fcdzy.site.common;

/**
 * 业务异常，由 GlobalExceptionHandler 统一转换为响应。
 */
public class BizException extends RuntimeException {

    private final int code;
    private final int httpStatus;

    public BizException(String message) {
        this(400, message, 400);
    }

    public BizException(int code, String message) {
        this(code, message, 400);
    }

    public BizException(int code, String message, int httpStatus) {
        super(message);
        this.code = code;
        this.httpStatus = httpStatus;
    }

    public static BizException notFound(String message) {
        return new BizException(404, message, 404);
    }

    public static BizException unauthorized(String message) {
        return new BizException(401, message, 401);
    }

    public int getCode() {
        return code;
    }

    public int getHttpStatus() {
        return httpStatus;
    }
}
