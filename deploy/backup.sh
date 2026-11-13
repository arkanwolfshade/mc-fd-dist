#!/usr/bin/env bash
# Writes a verified backup of the live database and uploads it to S3.
#   ./backup.sh               nightly use: fails if the upload is not configured
#   ./backup.sh --local-only  keep the copy on the server only, for example before an update
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck source=/dev/null
. ./.env
set +a

name="mc-fd-dist-$(date -u +%Y-%m-%dT%H%M%SZ).db"
docker compose exec -T app node dist/server/cli/backup.js create "/data/backups/$name"

if [ "${1:-}" != "--local-only" ]; then
  if [ -z "${BACKUP_BUCKET:-}" ]; then
    echo "BACKUP_BUCKET is not set in .env, so the backup was not uploaded" >&2
    exit 1
  fi
  docker compose run --rm -T aws s3 cp "/backups/$name" "s3://$BACKUP_BUCKET/nightly/$name"
fi

# Copies on the server are for quick restores. S3 keeps the longer history. The app's image
# has no find, so the aws container, which sees the same volume, does the pruning.
docker compose run --rm --no-deps -T --entrypoint find aws /backups -name 'mc-fd-dist-*.db' -mtime +7 -delete
echo "Backed up $name"
