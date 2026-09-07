#!/usr/bin/env bash
# A release is built from one verified Git commit. The serving checkout is never pulled into.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo bash deploy.sh'; exit 1; }
ROOT=/opt/moya
[[ -f /etc/moya/deploy.conf && -f /etc/moya/app.env && -f /etc/nginx/conf.d/moya-app.conf ]] || {
  echo 'Run setup-server.sh and enable-https.sh first.'; exit 1;
}
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.'; exit 1; }
# This file is owned by root; app.env is deliberately never executed as shell code.
source /etc/moya/deploy.conf
[[ $REPO_URL =~ ^git@github.com:[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+\.git$ ]] || exit 1
git check-ref-format "refs/heads/$BRANCH"
expected=''
if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && $1 == --expect-sha && $2 =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: deploy.sh [--expect-sha FULL_COMMIT_SHA]'; exit 1; }
  expected=$2
fi
export GIT_SSH_COMMAND='ssh -i /root/.ssh/moya_github -o IdentitiesOnly=yes -o UserKnownHostsFile=/root/.ssh/moya_known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes'
active="$ROOT/active.json"
pending="$ROOT/pending.json"
upstream=/etc/nginx/moya-upstream.conf
candidate=''
switched=0
committed=0
owned_remove() {
  local name=$1
  if docker container inspect "$name" >/dev/null 2>&1; then
    [[ $(docker inspect -f '{{ index .Config.Labels "com.moya.managed" }}' "$name") == true ]] || { echo "Refusing to remove unmanaged container: $name"; return 1; }
    docker stop -t 35 "$name" >/dev/null
    docker rm "$name" >/dev/null
  fi
}
write_upstream() {
  local port=$1
  [[ $port == 3101 || $port == 3102 ]] || return 1
  printf 'proxy_pass http://127.0.0.1:%s;\n' "$port" > "$upstream.new"
  mv "$upstream.new" "$upstream"
}
health() {
  local name=$1
  for ((attempt=0; attempt<30; attempt++)); do
    if docker exec "$name" node scripts/health-check.mjs --full >/dev/null 2>&1; then return 0; fi
    [[ $(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null) == true ]] || break
    sleep 2
  done
  echo "Health checks failed for $name. Inspect locally with: sudo docker logs $name"
  return 1
}
wait_proxy() {
  local container=$1 expected_sha=$2 access_code=000 health_code=000
  local response="$ROOT/proxy-health.json"
  # Reload is asynchronous. A 401 from an old worker does not prove cutover.
  for ((probe=0; probe<25; probe++)); do
    access_code=$(curl --disable --noproxy '*' --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 3 --resolve "$origin:443:127.0.0.1" "https://$origin/api/workspace") || access_code=000
    if [[ $access_code == 401 ]]; then
      # Credentials travel through a pipe, never command arguments or log output.
      health_code=$(docker exec "$container" node --input-type=module -e 'process.stdout.write("Authorization: Basic " + Buffer.from(process.env.MOYA_ADMIN_USER + ":" + process.env.MOYA_ADMIN_PASSWORD).toString("base64") + "\n")' | \
        curl --disable --noproxy '*' --silent --show-error --header @- --output "$response" --write-out '%{http_code}' --max-time 3 --resolve "$origin:443:127.0.0.1" "https://$origin/healthz") || health_code=000
      if [[ $health_code == 200 ]] && jq -e --arg sha "$expected_sha" '.ok == true and .release == $sha' "$response" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 1
  done
  echo "HTTPS readiness failed: private route HTTP $access_code; authenticated health HTTP $health_code; expected commit $expected_sha."
  echo 'Inspect locally: sudo tail -n 30 /var/log/nginx/error.log'
  return 1
}
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $committed == 0 ]]; then
    if [[ $switched == 1 ]]; then
      cp "$ROOT/upstream.before" "$upstream"
      if ! nginx -t || ! systemctl reload nginx; then
        echo 'CRITICAL: routing recovery failed. Candidate retained; inspect Nginx before retrying.'
        exit 1
      fi
      if [[ -n ${old:-} ]] && ! wait_proxy "$old" "$(jq -er .sha "$active")"; then
        echo 'CRITICAL: previous HTTPS route is not ready. Both containers retained for inspection.'
        exit 1
      fi
    fi
    [[ -z $candidate ]] || owned_remove "$candidate" || true
    [[ ! -f $pending ]] || unlink "$pending"
    echo 'Deployment did not complete. The committed release was retained; database backups were not restored over live data.'
  fi
  exit "$status"
}

# A power interruption during cutover leaves a journal. Resolve it before a new release.
if [[ -f $pending ]]; then
  orphan=$(jq -er .container "$pending")
  [[ $orphan =~ ^moya-[0-9a-f]{12}-[0-9]+$ ]] || { echo 'Invalid deployment journal'; exit 1; }
  if [[ -f $active ]]; then
    serving=$(jq -er .container "$active")
    health "$serving" || { echo 'Committed release is unhealthy; preserve both containers for inspection.'; exit 1; }
    write_upstream "$(jq -er .port "$active")"
  else
    cp "$ROOT/upstream.before" "$upstream"
    serving=''
  fi
  nginx -t
  systemctl reload nginx
  [[ $orphan == "$serving" ]] || owned_remove "$orphan"
  unlink "$pending"
fi

nginx -t
origin=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import urlsplit
env=dict(s.split('=',1) for s in Path('/etc/moya/app.env').read_text().splitlines() if '=' in s and not s.startswith('#'))
u=urlsplit(env['PUBLIC_ORIGIN'])
if u.scheme!='https' or u.path not in ('','/') or u.query or u.fragment or u.username or u.port: raise SystemExit('PUBLIC_ORIGIN must be https://IP_OR_DOMAIN without a custom port')
print(u.hostname)
PY
)
# Verify the certificate and private login boundary through Nginx before changing anything.
code=$(curl --disable --noproxy '*' --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 --resolve "$origin:443:127.0.0.1" "https://$origin/")
[[ $code == 401 || $code == 502 ]] || { echo "Unexpected HTTPS status: $code"; exit 1; }

repo="$ROOT/repository.git"
if [[ ! -d $repo ]]; then git init --bare "$repo"; fi
git --git-dir="$repo" fetch --no-tags --force "$REPO_URL" "refs/heads/$BRANCH:refs/heads/deploy-source"
git --git-dir="$repo" fsck --strict
sha=$(git --git-dir="$repo" rev-parse refs/heads/deploy-source)
[[ $sha =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ -z $expected || $sha == "$expected" ]] || { echo 'Remote commit does not match --expect-sha; nothing deployed.'; exit 1; }
remote_matches() {
  local remote
  remote=$(git ls-remote --exit-code "$REPO_URL" "refs/heads/$BRANCH")
  [[ ${remote%%[[:space:]]*} == "$sha" ]] || { echo 'The branch changed during deployment. Run again to deploy the complete latest commit.'; return 1; }
}
remote_matches
stamp=$(date +%s)
release="$ROOT/releases/$sha-$stamp"
git --git-dir="$repo" worktree add --detach "$release" "$sha"
[[ -z $(git -C "$release" status --porcelain --untracked-files=all) ]] || exit 1
image="moya:$sha-$stamp"
echo "Building and testing complete commit $sha"
docker build --pull --build-arg "RELEASE_SHA=$sha" --tag "$image" "$release"
[[ $(docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$image") == "$sha" ]] || exit 1
[[ $(git -C "$release" rev-parse HEAD) == "$sha" && -z $(git -C "$release" status --porcelain --untracked-files=all) ]] || exit 1
remote_matches

old=''
# Initial Nginx points to 3101; keep the preflight database off that route too.
port=3102
if [[ -f $active ]]; then
  old=$(jq -er .container "$active")
  old_port=$(jq -er .port "$active")
  [[ $old_port == 3101 || $old_port == 3102 ]] || exit 1
  if [[ $old_port == 3101 ]]; then port=3102; else port=3101; fi
  health "$old"
  # A reboot after committing the switch can leave the retired container running.
  if [[ -f $ROOT/previous.json ]]; then
    retired=$(jq -er .container "$ROOT/previous.json")
    [[ $retired =~ ^moya-[0-9a-f]{12}-[0-9]+$ ]] || exit 1
    [[ $retired == "$old" ]] || owned_remove "$retired"
  fi
fi
candidate="moya-${sha:0:12}-$stamp"
trap cleanup EXIT
stage="$ROOT/preflight/$sha-$stamp"
install -d -m 0750 -o 1000 -g 1000 "$stage"
if [[ -f $ROOT/data/moya.sqlite ]]; then
  # Online SQLite backup includes committed WAL records; copying a live .sqlite file does not.
  docker run --rm --network none --user 0:0 --mount "type=bind,src=$ROOT/data,dst=/source,readonly" --mount "type=bind,src=$stage,dst=/backup" "$image" \
    node --input-type=module -e 'import {backupDatabase} from "./server/sqlite.mjs"; await backupDatabase("/source/moya.sqlite", "/backup/moya.sqlite");'
  cp "$stage/moya.sqlite" "$ROOT/backups/$sha-$stamp.sqlite"
  chmod 0600 "$ROOT/backups/$sha-$stamp.sqlite"
  chown 1000:1000 "$stage/moya.sqlite"
fi
run_candidate() {
  local data=$1 restart=$2
  docker run --detach --name "$candidate" --label com.moya.managed=true --restart "$restart" \
    --init --security-opt no-new-privileges:true --cap-drop ALL --read-only --tmpfs /tmp:rw,nosuid,size=128m \
    --env-file /etc/moya/app.env --publish "127.0.0.1:$port:3000" \
    --mount "type=bind,src=$data,dst=/data" "$image" >/dev/null
}
# The journal also records a preflight container so a killed script can clean it up next run.
cp "$upstream" "$ROOT/upstream.before"
jq -n --arg container "$candidate" '{container:$container}' > "$pending.new"
mv "$pending.new" "$pending"
run_candidate "$stage" no
health "$candidate"
owned_remove "$candidate"
remote_matches
run_candidate "$ROOT/data" unless-stopped
health "$candidate"
remote_matches
# Switch only after the real persistent database, routes and images pass checks too.
switched=1
write_upstream "$port"
nginx -t
systemctl reload nginx
wait_proxy "$candidate" "$sha"
jq -n --arg container "$candidate" --arg sha "$sha" --arg image "$image" --argjson port "$port" '{container:$container,sha:$sha,image:$image,port:$port}' > "$active.new"
[[ ! -f $active ]] || cp "$active" "$ROOT/previous.json"
mv "$active.new" "$active"
committed=1
unlink "$pending"
[[ -z $old ]] || owned_remove "$old"
echo "Deployment complete: https://$origin/ | commit $sha"
echo 'Source releases, images and database backups are retained. Monitor disk space; keep off-server backups.'
