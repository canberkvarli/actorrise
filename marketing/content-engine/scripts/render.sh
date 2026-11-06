#!/usr/bin/env bash
# Render one story spec to a finished, loudness-normalized vertical video.
#   scripts/render.sh specs/<id>.json            -> out/<id>.mp4
#   scripts/render.sh specs/<id>.json still 300  -> out/<id>_300.png (one frame, for checking)
set -euo pipefail
cd "$(dirname "$0")/.."
SPEC="$1"; ID="$(basename "$SPEC" .json)"
mkdir -p out
# Cloud sessions ship their own Chromium; never run `remotion browser ensure` there.
CHROME="${CHROME:-$(ls -d /opt/pw-browsers/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | head -1 || true)}"
BROWSER_FLAG=(); [ -n "$CHROME" ] && BROWSER_FLAG=(--browser-executable="$CHROME")
COMP="$(python3 -c 'import json,sys; print("ReelVideo" if "beats" in json.load(open(sys.argv[1])) else "StoryVideo")' "$SPEC")"
PROPS="$(python3 -c 'import json,sys; print(json.dumps({"spec": json.load(open(sys.argv[1]))}))' "$SPEC")"
# Voices (narration and scene partner) from ElevenLabs, if the spec has any and the key is here.
if python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); sys.exit(0 if s.get("voice") or any(b.get("kind")=="scene" for b in s.get("beats",[])) else 1)' "$SPEC"; then
  python3 scripts/voice.py "$SPEC" || echo "voices skipped (no ElevenLabs here); rendering without them"
fi
# Music bed, if the spec asks for one (public/music/<id>.wav).
if python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("music") else 1)' "$SPEC"; then
  # ElevenLabs Music when the key is here (licensed, sounds like a real track), else our sampled beds.
  python3 scripts/eleven.py music "$SPEC" || python3 scripts/make_music.py "$SPEC"
fi
CORES="$(nproc 2>/dev/null || echo 2)"
if [ "${2:-}" = "still" ]; then
  npx remotion still src/index.ts "$COMP" "out/${ID}_${3:-0}.png" --frame="${3:-0}" --props="$PROPS" "${BROWSER_FLAG[@]}" --scale=0.4
  exit 0
fi
npx remotion render src/index.ts "$COMP" "out/${ID}.raw.mp4" --props="$PROPS" "${BROWSER_FLAG[@]}" \
  --concurrency="${CONCURRENCY:-$CORES}" --crf=12 --x264-preset=veryfast
# Loudness for phone speakers.
# Upload quality (Canberk, 2026-11-04: videos looked soft on IG/TikTok). Instagram and TikTok re-encode
# everything, so give them a rich source: ~12 Mbps H.264 High, 1080x1920, 30fps, faststart. A dark, still
# film at CRF alone came out near 0.25 Mbps and fell apart on their second encode.
ffmpeg -loglevel error -y -i "out/${ID}.raw.mp4" -c:v libx264 -preset slow -profile:v high -pix_fmt yuv420p \
  -b:v 12M -minrate 8M -maxrate 16M -bufsize 24M -x264-params "nal-hrd=vbr" -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k "out/${ID}.mp4"
rm -f "out/${ID}.raw.mp4"
# Contact strip of 6 frames for a quick visual check.
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "out/${ID}.mp4")"
ARGS=(); for k in 1 2 3 4 5 6; do T="$(python3 -c "print(round($DUR*($k-0.5)/6,2))")"; ffmpeg -loglevel error -y -ss "$T" -i "out/${ID}.mp4" -frames:v 1 -vf scale=270:-1 "out/${ID}_f$k.png"; ARGS+=(-i "out/${ID}_f$k.png"); done
ffmpeg -loglevel error -y "${ARGS[@]}" -filter_complex hstack=6 "out/${ID}_strip.png"
rm -f out/${ID}_f?.png
echo "out/${ID}.mp4"
