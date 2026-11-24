#!/usr/bin/env bash
# Writes a verified backup of the live database and uploads it to S3.
#   ./backup.sh               nightly use: fails if the upload is not configured
#   ./backup.sh --local-only  keep the copy on the server only, for example before an update
# A server that holds only test data can set BACKUP_UPLOAD=off in .env to keep every backup
# on the server. Unset means on; any value other than on or off is refused.
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck source=/dev/null
. ./.env
set +a

# Checked before anything is written, so that a typo can't pass for a working backup.
case "${BACKUP_UPLOAD:-on}" in
  on | off) ;;
  *)
    echo "BACKUP_UPLOAD in .env must be on or off, not ${BACKUP_UPLOAD}" >&2
    exit 1
    ;;
esac

name="mc-fd-dist-$(date -u +%Y-%m-%dT%H%M%SZ).db"
docker compose exec -T app node dist/server/cli/backup.js create "/data/backups/$name"

if [ "${1:-}" = "--local-only" ]; then
  : # kept on the server, as asked
elif [ "${BACKUP_UPLOAD:-on}" = off ]; then
  echo "BACKUP_UPLOAD is off in .env, so the backup stays on this server only"
else
  if [ -z "${BACKUP_BUCKET:-}" ]; then
    echo "BACKUP_BUCKET is not set in .env, so the backup was not uploaded" >&2
    exit 1
  fi
  docker compose run --rm -T aws s3 cp "/backups/$name" "s3://$BACKUP_BUCKET/nightly/$name"
fi

# Copies on the server are for quick restores. S3 keeps the longer history.
docker compose exec -T app find /data/backups -name 'mc-fd-dist-*.db' -mtime +7 -delete
echo "Backed up $name"
