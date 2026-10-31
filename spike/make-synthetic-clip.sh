#!/usr/bin/env bash
# Makes a plumbing-test clip: macOS text-to-speech saying deictic sentences over
# an ffmpeg test pattern. There are no real objects on screen, so it only tests
# ingest and transcription, not grounding. Output: data/spike-input/synthetic.mp4
set -euo pipefail

OUT_DIR="data/spike-input"
mkdir -p "$OUT_DIR"

SCRIPT="Today we are making pancakes. Now add this to the bowl. [[slnc 1500]] \
This recipe was my grandmother's. [[slnc 1200]] \
Mix until it looks like this. [[slnc 1500]] \
Then put the pan right here, on the front burner. [[slnc 1000]] \
Pour about this much batter in the middle."

# 16-bit little-endian PCM at 16 kHz, the same format the pipeline sends to Transcribe.
say -o "$OUT_DIR/synthetic-speech.wav" --file-format=WAVE --data-format=LEI16@16000 "$SCRIPT"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/synthetic-speech.wav")

ffmpeg -y -loglevel error \
  -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=${DURATION}" \
  -i "$OUT_DIR/synthetic-speech.wav" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  "$OUT_DIR/synthetic.mp4"

rm "$OUT_DIR/synthetic-speech.wav"
echo "Wrote $OUT_DIR/synthetic.mp4 (${DURATION}s)"
