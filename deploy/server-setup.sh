#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 Lightsail server to run the app. It runs as root from
# the server's launch script, and is safe to run again.
#   server-setup.sh <git commit>
# The app is not started here: fill in /opt/mc-fd-dist/.env first.
set -euo pipefail

commit="${1:?Usage: server-setup.sh <git commit>}"
source="https://raw.githubusercontent.com/arkanwolfshade/mc-fd-dist/$commit/deploy"
dir=/opt/mc-fd-dist

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends docker.io docker-compose-v2 unattended-upgrades
systemctl enable --now docker
usermod -aG docker ubuntu
timedatectl set-timezone America/Phoenix

# Swap, so that a memory spike slows the server down instead of stopping the app.
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Security updates install daily. A restart, when one is needed, happens overnight.
cat > /etc/apt/apt.conf.d/52mc-fd-dist <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
EOF

mkdir -p "$dir"
for file in compose.yaml Caddyfile backup.sh restore.sh .env.example; do
  curl -fsSL "$source/$file" -o "$dir/$file"
done
chmod +x "$dir"/*.sh
if [ ! -f "$dir/.env" ]; then
  install -m 600 "$dir/.env.example" "$dir/.env"
fi
echo "$commit" > "$dir/setup-commit"

cat > /etc/systemd/system/mc-fd-dist-backup.service <<EOF
[Unit]
Description=Nightly backup of the shift tracker database
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=$dir/backup.sh
EOF

# Shifts close at midnight, so 02:00 catches the whole day before the 03:30 update window.
cat > /etc/systemd/system/mc-fd-dist-backup.timer <<'EOF'
[Unit]
Description=Run the shift tracker backup nightly

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now mc-fd-dist-backup.timer
echo "Server set up from commit $commit. Fill in $dir/.env, then run: docker compose up -d"
