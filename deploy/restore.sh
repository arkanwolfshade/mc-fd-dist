#!/usr/bin/env bash
# Replaces the live database with a backup, by file name. A copy still on the server is
# used if there is one; otherwise it is downloaded from the S3 bucket's nightly folder.
#   ./restore.sh mc-fd-dist-2026-11-07T090000Z.db
# The app is stopped during the restore, and the previous database is kept beside it.
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck source=/dev/null
. ./.env
set +a

name="${1:?Usage: ./restore.sh <backup file name>}"
case "$name" in
  */* | .*) echo "Give a file name only, not a path" >&2; exit 1 ;;
esac

if ! docker compose run --rm --no-deps -T --entrypoint test aws -f "/backups/$name"; then
  docker compose run --rm -T aws s3 cp "s3://${BACKUP_BUCKET:?BACKUP_BUCKET is not set in .env}/nightly/$name" "/backups/$name"
fi

docker compose stop app
docker compose run --rm --no-deps -T app node dist/server/cli/backup.js restore "/data/backups/$name"
docker compose start app

for _ in $(seq 1 30); do
  if [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ]; then
    echo "Restored $name, and the app is running"
    exit 0
  fi
  sleep 2
done
echo "Restored $name, but the app did not report healthy within a minute" >&2
exit 1
