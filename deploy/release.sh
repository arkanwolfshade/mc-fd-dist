#!/usr/bin/env bash
# Runs on the server to release the image published for one commit. It backs the live
# database up to S3 first, and goes back to the previous image if the new one is not healthy.
#   sudo ./release.sh <git commit>
set -euo pipefail
cd "$(dirname "$0")"

commit="${1:?Usage: release.sh <git commit>}"
if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Not a full commit hash: $commit" >&2
  exit 2
fi
image="ghcr.io/arkanwolfshade/mc-fd-dist:$commit"

if [ ! -f .env ]; then
  echo "No .env here. Set the server up first (docs/developer/operations.md)." >&2
  exit 1
fi
docker compose config --quiet

# The first release has no database to back up yet.
if [ -n "$(docker compose ps --status running --quiet app)" ]; then
  ./backup.sh
fi

previous="$(grep '^APP_IMAGE=' .env || true)"
set_image() {
  if grep -q '^APP_IMAGE=' .env; then
    sed -i "s|^APP_IMAGE=.*|APP_IMAGE=$1|" .env
  else
    echo "APP_IMAGE=$1" >> .env
  fi
}

healthy() {
  local status
  for _ in $(seq 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps --quiet app)")"
    [ "$status" = healthy ] && return 0
    sleep 2
  done
  return 1
}

# Caddy waits for a healthy app, so `up` itself fails when the app does not start. That must
# lead to going back, not end the script, and a container that keeps restarting must not hold
# the release for ever. Called from an `if`, so `set -e` does not cut it short.
start() {
  timeout 180 docker compose up -d --remove-orphans && healthy
}

set_image "$image"
docker compose pull --quiet
if start; then
  echo "$commit" > release-commit
  echo "Released $commit"
  exit 0
fi

echo "The app did not become healthy on $image" >&2
docker compose logs --tail=50 app >&2
if [ -n "$previous" ]; then
  echo "Going back to ${previous#APP_IMAGE=}" >&2
  set_image "${previous#APP_IMAGE=}"
  start || echo "The previous image is not healthy either" >&2
fi
exit 1
