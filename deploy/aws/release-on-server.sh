#!/usr/bin/env bash
# Run by the deploy workflow to release one version on the Lightsail server. SSH is opened
# to this runner's address alone, with a one-time key from Lightsail, and the server's
# port rules are put back as they were afterwards, whether or not the release worked.
#   release-on-server.sh <stack name> <version> <image digest>
set -euo pipefail
# Every file made here is private, because ssh refuses a key that others can read.
umask 077

stack="${1:?Usage: release-on-server.sh <stack name> <version> <image digest>}"
version="${2:?Usage: release-on-server.sh <stack name> <version> <image digest>}"
digest="${3:?Usage: release-on-server.sh <stack name> <version> <image digest>}"
# Checked before anything is opened, because both are passed on to a command run as root.
if ! [[ "$version" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Not a version like v0.2.0: $version" >&2
  exit 2
fi
if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Not an image digest: $digest" >&2
  exit 2
fi
# The server's name changes when it is replaced, so it is read from the stack.
instance="$(aws cloudformation describe-stacks --stack-name "$stack" \
  --query "Stacks[0].Outputs[?OutputKey=='ServerName'].OutputValue" --output text)"
work="$(mktemp -d)"

# shellcheck disable=SC2016 # The backticks are a JMESPath literal, not a command.
aws lightsail get-instance-port-states --instance-name "$instance" \
  --query 'portStates[?state==`open`].{fromPort:fromPort,toPort:toPort,protocol:protocol,cidrs:cidrs,ipv6Cidrs:ipv6Cidrs,cidrListAliases:cidrListAliases}' \
  --output json > "$work/open-ports.json"
# SSH stays open only to the Lightsail browser client. An address left by a release that
# was killed before it cleaned up is dropped here.
jq 'map(if .protocol == "tcp" and .fromPort <= 22 and .toPort >= 22
        then .cidrs = [] | .ipv6Cidrs = [] else . end)
    | map(select(((.cidrs // []) + (.ipv6Cidrs // []) + (.cidrListAliases // [])) | length > 0))' \
  "$work/open-ports.json" > "$work/ports.json"
restore_ports() {
  aws lightsail put-instance-public-ports --instance-name "$instance" \
    --port-infos "file://$work/ports.json" > /dev/null
  rm -rf "$work"
  echo "The server's port rules are back as they were."
}
trap restore_ports EXIT

runner="$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')"
aws lightsail open-instance-public-ports --instance-name "$instance" \
  --port-info "fromPort=22,toPort=22,protocol=tcp,cidrs=$runner/32" > /dev/null

# The key and certificate expire on their own. They are written to files, never printed.
aws lightsail get-instance-access-details --instance-name "$instance" --protocol ssh \
  --query accessDetails --output json > "$work/access.json"
jq -r .privateKey "$work/access.json" > "$work/key"
jq -r .certKey "$work/access.json" > "$work/key-cert.pub"
host="$(jq -r .ipAddress "$work/access.json")"
user="$(jq -r .username "$work/access.json")"
# Trust only the host keys Lightsail reports for this server.
jq -r --arg host "$host" '.hostKeys[] | "\($host) \(.algorithm) \(.publicKey)"' \
  "$work/access.json" > "$work/known_hosts"
rm "$work/access.json"

ssh_options=(-i "$work/key" -o "CertificateFile=$work/key-cert.pub"
  -o "UserKnownHostsFile=$work/known_hosts" -o StrictHostKeyChecking=yes
  -o ConnectTimeout=20 -o BatchMode=yes)

# SSH can take a few seconds to accept connections after the port opens.
for attempt in $(seq 10); do
  ssh "${ssh_options[@]}" "$user@$host" true && break
  [ "$attempt" = 10 ] && exit 1
  sleep 3
done

scp "${ssh_options[@]}" deploy/compose.yaml deploy/Caddyfile deploy/backup.sh deploy/restore.sh \
  deploy/release.sh deploy/.env.example "$user@$host:/tmp/"
# shellcheck disable=SC2087 # $version and $digest are meant to expand here, on the runner.
ssh "${ssh_options[@]}" "$user@$host" bash -s <<EOF
set -euo pipefail
cd /opt/mc-fd-dist
for file in compose.yaml Caddyfile backup.sh restore.sh release.sh .env.example; do
  sudo install -m 644 "/tmp/\$file" "\$file"
  rm "/tmp/\$file"
done
sudo chmod 755 ./*.sh
sudo ./release.sh "$version" "$digest"
EOF
