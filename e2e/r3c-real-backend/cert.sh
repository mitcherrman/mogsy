#!/usr/bin/env bash
# RECONSTRUCT-R3C live certification matrix (DEV ONLY). Usage: cert.sh <r3c|base> <outdir>
# Sequential (one active match per user per stack). ~20 matches.
set -u
which=$1; out=$2
M="$(dirname "$0")/matrix.sh"
# Every required viewport, normal motion: correct, timeout, then a wrong FINAL (pacing).
for vp in 1600x900 1440x900 1280x720 1280x600 390x844 360x640; do
  bash "$M" "$which" "$out" --vp $vp --plan right,timeout,wrong --shots 1
done
# Reduced motion: a timeout first, a correct final.
for vp in 1440x900 1280x600 390x844 360x640; do
  bash "$M" "$which" "$out" --vp $vp --motion reduce --plan timeout,wrong,right --shots 1
done
# Light app theme, with a timed-out FINAL round.
for vp in 1440x900 390x844; do
  bash "$M" "$which" "$out" --vp $vp --scheme light --plan wrong,right,timeout --shots 1
done
# 250 ms of latency on every API call.
bash "$M" "$which" "$out" --vp 1440x900 --latency 250 --plan wrong,right,wrong --shots 0
# Reloads: an ordinary round's hold, then the final round at each presentation boundary.
bash "$M" "$which" "$out-reload" --vp 1440x900 --plan wrong,wrong,wrong --reload 1 --shots 0
for spec in "1440x900 hold" "360x640 hold" "1440x900 outro" "390x844 outro" "1280x600 end" "360x640 end"; do
  set -- $spec
  bash "$M" "$which" "$out-reload" --vp $1 --plan right,wrong,wrong --reload-final $2 --shots 1
done
