#!/usr/bin/env bash
# Put a finished film on the public "social-media" branch of this repo and print its download link, for Buffer
# (Buffer takes a video only from a public URL; TryPost is being retired, Canberk 2026-11-26, to stay at $0).
#   scripts/publish_media.sh out/<id>.mp4   ->  https://raw.githubusercontent.com/canberkvarli/actorrise/social-media/<id>.mp4
# The branch keeps only the last 14 days of films (by the YYYY-MM-DD at the start of the file name).
# Only finished films go there: the branch is public.
set -euo pipefail
f="$1"; name="$(basename "$f")"
work="$(mktemp -d)"
if ! git clone -q --depth 1 -b social-media https://github.com/canberkvarli/actorrise "$work/r" 2>/dev/null; then
  mkdir -p "$work/r"; git -C "$work/r" init -q; git -C "$work/r" checkout -q --orphan social-media
  git -C "$work/r" remote add origin https://github.com/canberkvarli/actorrise
fi
r="$work/r"
cp "$f" "$r/$name"
cutoff="$(date -u -d '14 days ago' +%Y-%m-%d)"
for old in "$r"/20*.mp4; do
  [ -e "$old" ] || continue
  d="$(basename "$old" | cut -c1-10)"
  if [[ "$d" < "$cutoff" ]]; then git -C "$r" rm -q "$old"; fi
done
printf "Rendered Ghost Light films for the social scheduler (Buffer) to download. Kept 14 days.\n" > "$r/README.md"
git -C "$r" add -A
git -C "$r" -c user.name=canberkvarli -c user.email=canberkvarli@users.noreply.github.com commit -qm "media: $name" || true
git -C "$r" push -q origin social-media
echo "https://raw.githubusercontent.com/canberkvarli/actorrise/social-media/$name"
