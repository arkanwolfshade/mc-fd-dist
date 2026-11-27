#!/usr/bin/env bash
# Run by the deploy workflow to release one version on the Google trial server. SSH goes only
# through Google's Identity-Aware Proxy, so no port is opened to the internet. The deploy
# account signs in with OS Login and a key made for this run, which expires on its own and is
# removed afterwards, whether or not the release worked.
#   release-on-server.sh <project id> <zone> <server name> <version> <image digest>
set -euo pipefail
# Every file made here is private, because ssh refuses a key that others can read.
umask 077

usage="Usage: release-on-server.sh <project id> <zone> <server name> <version> <image digest>"
project="${1:?$usage}"
zone="${2:?$usage}"
instance="${3:?$usage}"
version="${4:?$usage}"
digest="${5:?$usage}"
# Checked before anything is opened, because both are passed on to a command run as root.
if ! [[ "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Not a version like v0.2.0: $version" >&2
  exit 2
fi
if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Not an image digest: $digest" >&2
  exit 2
fi

work="$(mktemp -d)"
ssh-keygen -q -t ed25519 -N "" -C "deploy-$GITHUB_RUN_ID" -f "$work/key"
remove_key() {
  gcloud compute os-login ssh-keys remove --key-file "$work/key.pub" > /dev/null 2>&1 || true
  rm -rf "$work"
  echo "The run's SSH key is removed."
}
trap remove_key EXIT

gcloud compute os-login ssh-keys add --key-file "$work/key.pub" --ttl 30m > /dev/null
user="$(gcloud compute os-login describe-profile --format 'value(posixAccounts[0].username)')"

# Trust only the host keys the server published about itself (enable-guest-attributes).
gcloud compute instances get-guest-attributes "$instance" --project "$project" --zone "$zone" \
  --query-path hostkeys/ --format 'value(key,value)' |
  while read -r algorithm key; do
    echo "$instance $algorithm $key"
  done > "$work/known_hosts"
if [ ! -s "$work/known_hosts" ]; then
  echo "The server has not published its host keys yet. Is it still starting?" >&2
  exit 1
fi

# --verbosity error hides the tunnel's "consider installing NumPy" warning, printed for every
# connection. NumPy only speeds up uploads, and this copies a few kilobytes (about 1.5 s).
ssh_options=(-i "$work/key" -o "HostKeyAlias=$instance"
  -o "ProxyCommand=gcloud compute start-iap-tunnel $instance 22 --listen-on-stdin --project $project --zone $zone --verbosity error"
  -o "UserKnownHostsFile=$work/known_hosts" -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20 -o BatchMode=yes)

deploy/push-release.sh "$user@$instance" "$version" "$digest" "${ssh_options[@]}"
