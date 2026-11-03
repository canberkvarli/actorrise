#!/usr/bin/env bash
# Run the real Ghost Light app as a web page at phone size, for marketing recordings only.
# The iOS app's repo is never changed: this clones a fresh copy of Ghost Light main, applies
# web-preview.patch (web-only shims: react-native-web, a CanvasKit entry, an offline stub,
# no anonymous sign-in on web, an /api pass-through), builds the web export and serves it.
#
#   ghostlight-web/serve.sh [port]     -> http://127.0.0.1:<port>  (default 8099), runs in the background
#   then: BASE_URL=http://127.0.0.1:8099 APP=ghostlight node recorder/record.mjs explore /search
#
# If the patch stops applying because Ghost Light changed, fix it against the new main and
# regenerate the patch (git format-patch), never push it to the ghostlight repo.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8099}"
WORK="${GL_WORK:-/tmp/ghostlight-web}"
if [ ! -d "$WORK/.git" ]; then
  git clone -q --depth 1 https://github.com/canberkvarli/ghostlight "$WORK"
  git -C "$WORK" -c user.name=preview -c user.email=preview@local am -q --3way "$HERE/web-preview.patch"
fi
cd "$WORK"
# Public client config (the publishable key ships inside the iOS app; it is not a secret).
cat > .env <<ENV
EXPO_PUBLIC_SUPABASE_URL=https://ppvqmbzuqvzpiuqaiqfy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_6X-B4xO0C0ndogzqzy8RAw_BJETJmsh
ENV
[ -d node_modules ] || EXPO_OFFLINE=1 npm ci --no-audit --no-fund --loglevel=error
nohup bash scripts/web-preview.sh "$PORT" > /tmp/ghostlight-web.log 2>&1 &
for i in $(seq 1 180); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && { echo "Ghost Light web on http://127.0.0.1:$PORT"; exit 0; }; sleep 2; done
echo "Ghost Light web did not come up, see /tmp/ghostlight-web.log" >&2; exit 1
