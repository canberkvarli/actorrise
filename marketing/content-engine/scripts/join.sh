#!/usr/bin/env bash
# Join film parts into one video with hard cuts: scripts/join.sh out/<id>.mp4 out/<part1>.mp4 out/<part2>.mp4 ...
# Used for the "story + how-to" films (Canberk, 2026-11-10): a drawn story, then the real Ghost Light
# walkthrough that ends on the Ghost Light card. Each part is rendered on its own with render.sh (only the
# last part has the end card); this re-encodes once at upload quality and loudness-normalises the whole.
set -euo pipefail
out="$1"; shift
args=(); filt=""; i=0
for p in "$@"; do args+=(-i "$p"); filt+="[$i:v:0]scale=1080:1920,setsar=1,fps=30[v$i];[$i:a:0]aresample=48000[a$i];"; i=$((i+1)); done
cat=""; for ((k=0;k<i;k++)); do cat+="[v$k][a$k]"; done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${filt}${cat}concat=n=$i:v=1:a=1[v][a];[a]loudnorm=I=-16:TP=-1.5:LRA=11[ao]" \
  -map "[v]" -map "[ao]" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p -b:v 12M -maxrate 16M -bufsize 24M \
  -movflags +faststart -c:a aac -b:a 256k -ar 48000 "$out"
echo "joined $i parts -> $out"
