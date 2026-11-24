#!/usr/bin/env bash
# Copies the release's server files to a server and runs release.sh there. Each target's
# release-on-server.sh opens the way in (an SSH key, a port or a tunnel) and calls this, so
# every target installs the same files in the same way.
#   push-release.sh <user@host> <version> <image digest> [ssh option ...]
set -euo pipefail

usage="Usage: push-release.sh <user@host> <version> <image digest> [ssh option ...]"
destination="${1:?$usage}"
version="${2:?$usage}"
digest="${3:?$usage}"
shift 3
ssh_options=("$@")
# Checked here too, because both are passed on to a command run as root.
if ! [[ "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Not a version like v0.2.0: $version" >&2
  exit 2
fi
if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Not an image digest: $digest" >&2
  exit 2
fi

# SSH can take a few seconds to accept connections after the way in opens.
for attempt in $(seq 10); do
  ssh "${ssh_options[@]}" "$destination" true && break
  [ "$attempt" = 10 ] && exit 1
  sleep 3
done

scp "${ssh_options[@]}" deploy/compose.yaml deploy/Caddyfile deploy/backup.sh deploy/restore.sh \
  deploy/release.sh deploy/.env.example "$destination:/tmp/"
# shellcheck disable=SC2087 # $version and $digest are meant to expand here, on the runner.
ssh "${ssh_options[@]}" "$destination" bash -s <<EOF
set -euo pipefail
cd /opt/mc-fd-dist
for file in compose.yaml Caddyfile backup.sh restore.sh release.sh .env.example; do
  sudo install -m 644 "/tmp/\$file" "\$file"
  rm "/tmp/\$file"
done
sudo chmod 755 ./*.sh
sudo ./release.sh "$version" "$digest"
EOF
