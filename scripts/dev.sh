#!/usr/bin/env bash
# Bring up Deputy: daemon + a Chromium carrying the extension.
# One browser, one profile, always findable, never the user's own.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${DEPUTY_PROFILE:-$HOME/.deputy-chrome}"

bun run build:ext >/dev/null || { echo "extension build failed"; exit 1; }

if ! curl -s --max-time 1 http://127.0.0.1:7331/health >/dev/null 2>&1; then
  echo "starting deputyd…"
  (cd "$ROOT" && nohup bun packages/deputyd/src/index.ts > /tmp/deputyd.log 2>&1 &)
  for _ in $(seq 1 30); do curl -s --max-time 1 http://127.0.0.1:7331/health >/dev/null 2>&1 && break; sleep 0.3; done
fi
curl -s http://127.0.0.1:7331/health; echo

if pgrep -f "user-data-dir=$PROFILE" >/dev/null 2>&1; then
  echo "deputy chromium already running"
else
  echo "starting chromium with the Deputy extension…"
  nohup chromium \
    --user-data-dir="$PROFILE" \
    --load-extension="$ROOT/packages/extension/dist" \
    --disable-extensions-except="$ROOT/packages/extension/dist" \
    --enable-features=WebMCPTesting \
    --no-first-run --no-default-browser-check \
    --renderer-process-limit=4 \
    "${1:-https://en.wikipedia.org/wiki/Main_Page}" \
    > /tmp/deputy-chromium.log 2>&1 &
fi
echo "profile: $PROFILE   (stop with: pkill -f \"user-data-dir=$PROFILE\")"
