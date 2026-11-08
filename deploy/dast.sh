#!/usr/bin/env bash
# Runs an OWASP ZAP baseline scan against the deployment stack, the way the server runs
# it but over plain HTTP. Used by CI: ./dast.sh <image>
# The scan is passive: it browses the app and reports risky responses without attacking it.
set -euo pipefail
cd "$(dirname "$0")"

image="${1:?Usage: ./dast.sh <image>}"
zap="ghcr.io/zaproxy/zaproxy@sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af" # 2.17.0

cat > .env <<EOF
APP_IMAGE=$image
SITE_ADDRESS=:80
ACME_EMAIL=ci@example.test
EOF
trap 'docker compose down -v; rm -f .env' EXIT

docker compose up -d --wait

# ZAP runs as its own user and writes its report here.
chmod a+w zap
status=0
docker run --rm --network host -v "$PWD/zap:/zap/wrk:rw" "$zap" \
  zap-baseline.py -t http://localhost/ -c rules.tsv -J zap-report.json -I \
  > zap/output.txt 2>&1 || status=$?
cat zap/output.txt

# Annotations can be read without access to the job log.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  grep -E '^(FAIL|WARN)-NEW' zap/output.txt | while read -r line; do
    echo "::warning title=ZAP::$line"
  done
fi

# With -I, warnings pass and only rules set to FAIL in rules.tsv stop the build.
exit "$status"
