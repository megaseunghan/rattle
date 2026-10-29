#!/usr/bin/env bash
# DB 선택 후 libpq 서비스 파일에 등록한 연결만 사용한다. 비밀번호·URL은 인자로 받지 않는다.
set -euo pipefail
umask 077
if [[ $# -ne 2 || ! "$1" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo '사용법: bash scripts/backup-postgres.sh <libpq-service-name> <backup-directory>' >&2
  exit 2
fi
for tool in pg_dump pg_restore shasum; do
  command -v "$tool" >/dev/null || { echo "필수 도구 없음: $tool" >&2; exit 2; }
done
rattle_backup_service="$1"
rattle_backup_directory="$2"
mkdir -p "$rattle_backup_directory"
rattle_backup_file="$rattle_backup_directory/rattle-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f "$rattle_backup_file.partial"' EXIT
pg_dump --dbname="service=$rattle_backup_service" --format=custom --no-owner --file="$rattle_backup_file.partial"
# 목록 검사는 파일 형식을 확인한다. 실제 복원 성공을 대신하지 않는다.
pg_restore --list "$rattle_backup_file.partial" >/dev/null
mv "$rattle_backup_file.partial" "$rattle_backup_file"
shasum -a 256 "$rattle_backup_file" > "$rattle_backup_file.sha256"
echo "백업 파일 생성 및 형식 검사 완료: $rattle_backup_file"
