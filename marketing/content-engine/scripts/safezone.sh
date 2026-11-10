#!/usr/bin/env bash
# Draw the platform safe zones on a few frames of a render, so a run can SEE whether anything sits
# under Instagram / TikTok / YouTube chrome (Canberk, 2026-11-10: top elements got hidden).
# scripts/safezone.sh out/<id>.mp4 [t1 t2 ...]  -> out/<id>_safe.png (frames side by side)
# Red = covered on at least one platform: top 250px (status bar, account name, Reels/For You header),
# bottom 420px (caption, music, buttons), right 150px from y=900 down (like, comment, share column).
set -euo pipefail
v="$1"; shift; ts=("${@:-1 5 10}"); [ $# -eq 0 ] && ts=(1 5 10)
id=$(basename "$v" .mp4); tmp=$(mktemp -d)
i=0
for t in "${ts[@]}"; do
  ffmpeg -loglevel error -y -ss "$t" -i "$v" -frames:v 1 -vf "scale=1080:1920,\
drawbox=x=0:y=0:w=1080:h=250:color=red@0.35:t=fill,\
drawbox=x=0:y=1500:w=1080:h=420:color=red@0.35:t=fill,\
drawbox=x=930:y=900:w=150:h=600:color=red@0.35:t=fill,scale=360:-1" "$tmp/f$i.png"
  i=$((i+1))
done
inputs=(); for ((k=0;k<i;k++)); do inputs+=(-i "$tmp/f$k.png"); done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "hstack=inputs=$i" "out/${id}_safe.png" 2>/dev/null || cp "$tmp/f0.png" "out/${id}_safe.png"
echo "out/${id}_safe.png"
