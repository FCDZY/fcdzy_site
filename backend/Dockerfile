# syntax=docker/dockerfile:1

# ==================== 1. 构建阶段 ====================
# 项目里没有 mvnw，直接用官方 Maven 镜像编译
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# 走阿里云 Maven 镜像，国内 ECS 上构建快很多（不需要可删掉这一行）
COPY docker/maven-settings.xml /root/.m2/settings.xml

# 先只拷 pom.xml，把依赖单独做一层，改代码后重建能命中缓存
COPY pom.xml ./
RUN mvn -B -DskipTests dependency:go-offline || true

COPY src ./src
RUN mvn -B -DskipTests clean package

# ==================== 2. 运行阶段 ====================
# 只带 JRE，镜像比构建阶段小得多
FROM eclipse-temurin:21-jre

ENV TZ=Asia/Shanghai \
    JAVA_OPTS="-Xms256m -Xmx512m -Duser.timezone=Asia/Shanghai -Dfile.encoding=UTF-8"

# curl 给健康检查用；tzdata 保证时区正确
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/*

# 非 root 运行；uploads 目录属主设为 appuser，命名卷首次挂载会继承该属主
RUN useradd -r -u 1001 -m appuser \
 && mkdir -p /app/uploads \
 && chown -R appuser:appuser /app
WORKDIR /app
COPY --from=build --chown=appuser:appuser /build/target/*.jar /app/app.jar

USER appuser
EXPOSE 8080
VOLUME ["/app/uploads"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=10 \
  CMD curl -fsS http://127.0.0.1:8080/api/public/site-config > /dev/null || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
