#!/usr/bin/env bash
# Upload an APPROVED finished video as a GitHub Release asset on this (public) repo
# and print its public URL, which TryPost pulls from. Videos live in releases, not
# in git, so the repo never fills up with mp4s.
#
#   scripts/publish.sh out/<id>.mp4
#   -> https://github.com/canberkvarli/actorrise/releases/download/content-YYYY-MM/<id>.mp4
#
# This makes the file public. Only run it for a video Canberk has approved.
set -euo pipefail
FILE="$1"; NAME="$(basename "$FILE")"
REPO="${REPO:-canberkvarli/actorrise}"
TAG="content-$(date -u +%Y-%m)"   # one release per month keeps the releases page tidy
if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "Content $(date -u +%Y-%m)" \
    --notes "Finished marketing videos (Ghost Light / ActorRise). Not an app release." >/dev/null
fi
gh release upload "$TAG" "$FILE" -R "$REPO" --clobber >/dev/null
echo "https://github.com/$REPO/releases/download/$TAG/$NAME"
