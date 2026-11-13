#!/usr/bin/env bash
# Runs the deployment stack against a freshly built image, the way the server runs it,
# but over plain HTTP. Used by CI: ./smoke-test.sh <image>
set -euo pipefail
cd "$(dirname "$0")"

image="${1:?Usage: ./smoke-test.sh <image>}"
cat > .env <<EOF
APP_IMAGE=$image
SITE_ADDRESS=:80
ACME_EMAIL=ci@example.test
TIME_ZONE=America/Phoenix
EOF
trap 'docker compose logs --no-color > smoke-test.log 2>&1 || true; docker compose down -v; rm -f .env' EXIT

wait_healthy() {
  for _ in $(seq 1 30); do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q app)")" = healthy ]; then
      return 0
    fi
    sleep 2
  done
  echo "The app did not report healthy" >&2
  return 1
}

sign_in() {
  curl -fsS -H 'content-type: application/json' \
    -d "{\"username\":\"smoke-admin\",\"password\":\"$password\"}" http://localhost/api/login
}

docker compose up -d
wait_healthy

echo "--- Health and headers through the proxy"
grep -q '"status":"ok"' <<<"$(curl -fsS http://localhost/api/health)"
headers="$(curl -fsS -D - -o page.html http://localhost/)"
grep -qi '^content-security-policy:' <<<"$headers"
grep -q 'Food bank shift tracker' page.html
rm -f page.html

echo "--- Account and sign-in"
# nosemgrep: codacy.bash.security.hard-coded-password -- generated at run time, not a stored secret
password="$(openssl rand -base64 18)"
printf '%s\n' "$password" | docker compose exec -T app node dist/server/cli/account.js smoke-admin admin
grep -q '"role":"admin"' <<<"$(sign_in)"

echo "--- Container hardening"
[ "$(docker compose exec -T app id -u)" != 0 ]
if docker compose exec -T app touch /app/written 2>/dev/null; then
  echo "The app's files should be read-only" >&2
  exit 1
fi

echo "--- Backup and restore"
./backup.sh --local-only
name="$(docker compose exec -T app ls /data/backups | grep '^mc-fd-dist-' | tail -1 | tr -d '\r')"
./restore.sh "$name"
grep -q '"role":"admin"' <<<"$(sign_in)"

echo "--- Memory after sign-in, backup and restore"
memory="$(docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}' | tr '\n' ';')"
echo "$memory"
# Annotations can be read without access to the job log.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  echo "::notice title=Container memory::$memory"
fi

echo "Smoke test passed"
