#!/usr/bin/env bash
#
# 备份恢复演练：把最新的 mysqldump 恢复到一个临时库，核对行数，证明备份真的能用。
# 只读主库 + 临时库，不碰线上数据；跑完自动删临时库。
#
# 用法：
#   ./restore-drill.sh                       # 用 /opt/fcdzy/backups 下最新的 .sql.gz
#   ./restore-drill.sh /path/to/xxx.sql.gz   # 指定备份文件
#
# 建议每月跑一次，并把输出存一份。

set -euo pipefail

MYSQL_CONTAINER="${MYSQL_CONTAINER:?请先 export MYSQL_CONTAINER=<你的mysql容器名>}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:?请先 export MYSQL_ROOT_PASSWORD=<root密码>}"
SOURCE_DB="${SOURCE_DB:-fcdzy_site}"
DRILL_DB="${DRILL_DB:-${SOURCE_DB}_restore_check}"
BACKUP_DIR="${BACKUP_DIR:-/opt/fcdzy/backups}"

FILE="${1:-}"
if [ -z "$FILE" ]; then
  FILE=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1 || true)
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "❌ 找不到备份文件（目录：$BACKUP_DIR）"
  exit 1
fi

echo "备份文件：$FILE"
echo "大小    ：$(du -h "$FILE" | cut -f1)"
echo "修改时间：$(date -r "$FILE" '+%F %T')"

# 1. 先确认压缩包没坏
echo ""
echo "① 校验压缩包完整性..."
gunzip -t "$FILE"
echo "   ✅ gzip 完整"

TMP_SQL="$(mktemp /tmp/restore-drill-XXXXXX.sql)"
cleanup() {
  rm -f "$TMP_SQL"
  docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
    -e "DROP DATABASE IF EXISTS \`$DRILL_DB\`" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 2. 解压
echo ""
echo "② 解压到临时文件..."
gunzip -c "$FILE" > "$TMP_SQL"
echo "   ✅ 解压完成：$(du -h "$TMP_SQL" | cut -f1)"

# 3. 建临时库并导入
echo ""
echo "③ 导入到临时库 $DRILL_DB ..."
docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  -e "DROP DATABASE IF EXISTS \`$DRILL_DB\`; CREATE DATABASE \`$DRILL_DB\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$DRILL_DB" < "$TMP_SQL"
echo "   ✅ 导入完成"

# 4. 对比行数
echo ""
echo "④ 核对行数（线上 vs 恢复）..."
FAILED=0
for TABLE in article comment category tag topic site_config admin_user; do
  LIVE=$(docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e \
    "SELECT COUNT(*) FROM \`$SOURCE_DB\`.\`$TABLE\`" 2>/dev/null || echo "N/A")
  RESTORED=$(docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e \
    "SELECT COUNT(*) FROM \`$DRILL_DB\`.\`$TABLE\`" 2>/dev/null || echo "N/A")
  if [ "$LIVE" = "$RESTORED" ]; then
    printf "   ✅ %-12s %s 行\n" "$TABLE" "$RESTORED"
  else
    printf "   ❌ %-12s 线上 %s / 恢复 %s\n" "$TABLE" "$LIVE" "$RESTORED"
    FAILED=$((FAILED + 1))
  fi
done

# 5. 抽查一篇文章正文是否完整
echo ""
echo "⑤ 抽查正文（前 60 个字符）..."
docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -e \
  "SELECT CONCAT(id, ' | ', LEFT(content, 60)) FROM \`$DRILL_DB\`.\`article\` ORDER BY id LIMIT 1"

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 恢复演练通过：这份备份可以用于灾难恢复"
else
  echo "❌ 恢复演练失败：有 $FAILED 张表行数不一致，请检查备份是否完整"
  exit 1
fi
