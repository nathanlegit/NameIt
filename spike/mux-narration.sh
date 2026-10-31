#!/usr/bin/env bash
# Puts a narration track (e.g. an ElevenLabs export) over a stock clip, replacing
# any original audio. The video stream is copied, not re-encoded, so it is fast
# and lossless. The output stops at whichever input ends first.
#
# Usage: spike/mux-narration.sh <stock-video> <narration-audio> <output.mp4>
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <stock-video> <narration-audio> <output.mp4>" >&2
  exit 1
fi

STOCK_VIDEO="$1"
NARRATION="$2"
OUTPUT="$3"

mkdir -p "$(dirname "$OUTPUT")"

# -map 0:v = video from input 0; -map 1:a = audio from input 1 (original audio dropped).
ffmpeg -y -loglevel error \
  -i "$STOCK_VIDEO" \
  -i "$NARRATION" \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 160k \
  -shortest \
  "$OUTPUT"

echo "Wrote $OUTPUT"
