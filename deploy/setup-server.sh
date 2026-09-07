#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash setup-server.sh'; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 22.04 ]] || { echo 'This installer targets Ubuntu 22.04 only.'; exit 1; }
command -v flock >/dev/null || { echo 'util-linux/flock is required'; exit 1; }
exec 9>/var/lock/moya-setup.lock
flock -n 9 || { echo 'Another setup is running'; exit 1; }
apt-get update
apt-get install -y ca-certificates curl git openssh-client nginx jq openssl python3 sqlite3 gnupg snapd
if ! command -v docker >/dev/null; then
  for package in docker.io podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Conflicting package $package exists. Review it before installing Docker; nothing was removed."; exit 1
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --show-error --silent --retry 3 https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod 0644 /etc/apt/keyrings/docker.asc
  cat > /etc/apt/sources.list.d/moya-docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: jammy
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker buildx version >/dev/null
systemctl enable --now docker nginx
install -d -m 0700 /etc/moya /opt/moya /opt/moya/releases /opt/moya/backups /opt/moya/preflight
install -d -m 0750 -o 1000 -g 1000 /opt/moya/data
install -d -m 0755 /var/www/moya-acme

if [[ ! -f /etc/moya/app.env ]]; then
  read -rp 'Public IPv4 address (domain can be added later): ' address
  python3 - "$address" <<'PY'
import ipaddress,sys
if not ipaddress.ip_address(sys.argv[1]).is_global: raise SystemExit('Use a public IPv4 address.')
if ':' in sys.argv[1]: raise SystemExit('This initial installer expects IPv4.')
PY
  read -rp 'Presentation login name [moya]: ' login
  login=${login:-moya}
  [[ $login =~ ^[a-zA-Z0-9_-]{1,40}$ ]] || { echo 'Use letters, digits, underscore or hyphen.'; exit 1; }
  password=$(openssl rand -hex 18)
  read -rsp 'OpenAI API key (empty keeps menu-only guide): ' api_key; printf '\n'
  [[ $api_key != *[$'\r\n']* ]] || exit 1
  cat > /etc/moya/app.env <<EOF
PUBLIC_ORIGIN=https://$address
MOYA_ADMIN_USER=$login
MOYA_ADMIN_PASSWORD=$password
MOYA_WORKSPACE_ID=moya-presentation
OPENAI_API_KEY=$api_key
OPENAI_MODEL=gpt-6-astra
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
EOF
  printf 'Login: %s\nPassword: %s\nStore these safely. They are also in /etc/moya/app.env (root-only).\n' "$login" "$password"
  unset api_key password
fi
chmod 0600 /etc/moya/app.env
if [[ ! -f /etc/moya/deploy.conf ]]; then
  cat > /etc/moya/deploy.conf <<'EOF'
REPO_URL=git@github.com:Alirezaafshar20/moya-captain-order.git
BRANCH=main
EOF
fi

install -d -m 0700 /root/.ssh
if [[ ! -f /root/.ssh/moya_github ]]; then
  ssh-keygen -q -t ed25519 -N '' -C 'moya-hetzner-read-only' -f /root/.ssh/moya_github
fi
# Obtain GitHub host keys through GitHub's authenticated HTTPS endpoint.
curl --fail --show-error --silent https://api.github.com/meta | python3 -c 'import sys,json; print("\n".join("github.com "+k for k in json.load(sys.stdin)["ssh_keys"]))' > /root/.ssh/moya_known_hosts.tmp
[[ -s /root/.ssh/moya_known_hosts.tmp ]] || exit 1
mv /root/.ssh/moya_known_hosts.tmp /root/.ssh/moya_known_hosts
echo 'Add this PUBLIC key as a read-only Deploy key (leave Allow write access unchecked):'
echo 'https://github.com/Alirezaafshar20/moya-captain-order/settings/keys'
cat /root/.ssh/moya_github.pub
echo 'Prerequisites installed. Next: configure HTTPS using enable-https.sh, then run deploy.sh.'
echo 'Allow inbound TCP 80 and 443 in the Hetzner firewall; preserve your SSH port.'
