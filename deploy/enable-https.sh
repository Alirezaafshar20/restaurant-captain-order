#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ -f /etc/moya/app.env ]] || { echo 'Run setup-server.sh first'; exit 1; }
exec 9>/opt/moya/deploy.lock
flock -n 9 || { echo 'Another deployment or HTTPS update is running'; exit 1; }
read -rp 'Public IPv4 address or new domain: ' address
read -rp 'Email for certificate administration: ' email
kind=$(python3 - "$address" "$email" <<'PY'
import ipaddress,re,sys
a,email=sys.argv[1:]
if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email): raise SystemExit('Invalid email')
try:
 ip=ipaddress.ip_address(a)
 if not ip.is_global or ip.version!=4: raise SystemExit('Use public IPv4')
 print('ip')
except ValueError:
 if not re.fullmatch(r'(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}',a): raise SystemExit('Invalid domain')
 print('domain')
PY
)
echo 'Certificate issuance requires accepting the Let’s Encrypt Subscriber Agreement:'
echo 'https://letsencrypt.org/repository/'
read -rp 'Accept the agreement and request a certificate for this address? Type yes: ' consent
[[ $consent == yes ]] || { echo 'No certificate requested.'; exit 1; }
if [[ ! -x /snap/bin/certbot ]]; then snap install --classic certbot; fi
version=$(/snap/bin/certbot --version)
python3 - "$version" <<'PY'
import re,sys
m=re.search(r'(\d+)\.(\d+)',sys.argv[1])
if not m or tuple(map(int,m.groups())) < (5,4): raise SystemExit('Certbot 5.4+ required. Run snap refresh certbot.')
PY
cert_name="moya-${address,,}"
install -d -m 0755 /var/www/moya-acme /etc/letsencrypt/renewal-hooks/deploy
if [[ ! -f /etc/nginx/moya-upstream.conf ]]; then printf 'proxy_pass http://127.0.0.1:3101;\n' > /etc/nginx/moya-upstream.conf; fi
# Add a distinct challenge host; leave the active MOYA TLS host in place until issuance succeeds.
cat > /etc/nginx/conf.d/moya-challenge.conf <<EOF
server {
  listen 80;
  server_name $address;
  location /.well-known/acme-challenge/ { root /var/www/moya-acme; }
  location / { return 301 https://\$host\$request_uri; }
}
EOF
nginx -t
systemctl reload nginx
args=(certonly --non-interactive --agree-tos --email "$email" --webroot --webroot-path /var/www/moya-acme --cert-name "$cert_name" --keep-until-expiring)
if [[ $kind == ip ]]; then args+=(--preferred-profile shortlived --ip-address "$address"); else args+=(-d "$address"); fi
/snap/bin/certbot "${args[@]}"
cat > /etc/letsencrypt/renewal-hooks/deploy/moya-nginx <<'EOF'
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/moya-nginx
cat > /etc/nginx/conf.d/moya-app.conf.new <<EOF
server {
  listen 443 ssl;
  server_name $address;
  ssl_certificate /etc/letsencrypt/live/$cert_name/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$cert_name/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 64k;
  location / {
    include /etc/nginx/moya-upstream.conf;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 65s;
  }
}
EOF
[[ ! -f /etc/nginx/conf.d/moya-app.conf ]] || cp /etc/nginx/conf.d/moya-app.conf /etc/nginx/conf.d/moya-app.conf.previous
mv /etc/nginx/conf.d/moya-app.conf.new /etc/nginx/conf.d/moya-app.conf
if ! nginx -t; then
  if [[ -f /etc/nginx/conf.d/moya-app.conf.previous ]]; then mv /etc/nginx/conf.d/moya-app.conf.previous /etc/nginx/conf.d/moya-app.conf; else unlink /etc/nginx/conf.d/moya-app.conf; fi
  exit 1
fi
systemctl reload nginx
python3 - "$address" <<'PY'
from pathlib import Path
import sys
p=Path('/etc/moya/app.env'); lines=p.read_text().splitlines()
p.write_text('\n'.join('PUBLIC_ORIGIN=https://'+sys.argv[1] if s.startswith('PUBLIC_ORIGIN=') else s for s in lines)+'\n')
PY
chmod 0600 /etc/moya/app.env
systemctl is-active snap.certbot.renew.timer >/dev/null || systemctl enable --now snap.certbot.renew.timer
echo "HTTPS configured for https://$address. Run deploy.sh to apply the address to the application."
