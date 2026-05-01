#!/bin/bash
set -e

cd "$(dirname "$0")"
CLI=../packages/cli/af.js
OUT=../public/assets

mkdir -p "$OUT"

node "$CLI" "meridian.mp4"          "$OUT/meridian_h264.af"   1920 h264 30 25
node "$CLI" "meridian.mp4"          "$OUT/meridian_h265.af"   1920 h265 30 25
node "$CLI" "meridian_portrait.mp4" "$OUT/p_meridian_h264.af"  800 h264 30 25
node "$CLI" "meridian_portrait.mp4" "$OUT/p_meridian_h265.af"  800 h265 30 25
