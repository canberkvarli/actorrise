#!/usr/bin/env bash
# Put a finished video where the scheduler (TryPost) can pull it, and print its public URL.
#
# Videos live on the orphan branch `content-media` of this public repo, never on main or
# any code branch, so the app's history stays clean. (GitHub Releases would be nicer but
# cloud sessions are not allowed to create releases.)
#
#   scripts/publish.sh out/<id>.mp4
#   -> https://raw.githubusercontent.com/canberkvarli/actorrise/content-media/<id>.mp4
#
# The file becomes public. It is the same video that goes out on TikTok/YouTube, and it
# only goes live on those platforms after Canberk approves it in TryPost.
set -euo pipefail
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
NAME="$(basename "$FILE")"
REPO="${REPO:-canberkvarli/actorrise}"
BRANCH="content-media"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone -q --depth 1 --single-branch -b "$BRANCH" "https://github.com/$REPO.git" "$WORK" 2>/dev/null || {
  git -C "$WORK" init -q -b "$BRANCH"
  git -C "$WORK" remote add origin "https://github.com/$REPO.git"
}
cp "$FILE" "$WORK/$NAME"
cd "$WORK"
git add "$NAME"
git -c user.name="Canberk Varli" -c user.email="canberkvarli@gmail.com" \
  commit -q -m "Add $NAME" || true
git push -q origin "$BRANCH"
echo "https://raw.githubusercontent.com/$REPO/$BRANCH/$NAME"
