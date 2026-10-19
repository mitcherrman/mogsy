#!/usr/bin/env bash
# Authorised 2026-10-18: bundled headless Chromium, one browser at a time (run.mjs enforces it), 38 loads.
# Usage: run-matrix.sh <group>   (groups run in the foreground one after another; each <= ~10 min)
S=/c/Users/mlmit/AppData/Local/Temp/claude/C--Users-mlmit-OneDrive-Desktop-mogsy--worktrees-academy-core-v1/5bb34c37-2269-427b-8d70-42fb00efb542/scratchpad
WT=/c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/academy-core-v1
OUT=$(cygpath -m $S/acs-results)
mkdir -p "$OUT"
declare -A BASE=([main]=https://127.0.0.1:4431 [rc]=https://127.0.0.1:4432 [rcx]=https://127.0.0.1:4433)
cd "$WT"
export ACADEMY_PERF_MAX_MINUTES=12
r() { # label variant json-extra
  local label=$1 v=$2 extra=$3
  node scripts/academy-startup/run.mjs "{\"label\":\"$label-$v\",\"base\":\"${BASE[$v]}\",\"out\":\"$OUT\"$extra}" 2>&1 | grep -v "^\s*$" | tail -4
}
case "$1" in
  h1) for v in main rc rcx; do r H1 $v ',"reps":3'; done ;;
  h2) for v in rcx rc main; do r H2 $v ',"reps":3,"net":"4g"'; done ;;
  h3) for v in main rc rcx; do r H3 $v ',"reps":2,"net":"slow4g","ms":9000'; done ;;
  h4) for v in rcx rc main; do r H4 $v ',"reps":2,"path":"/lol"'; done ;;
  h5) for v in main rc; do r H5 $v ',"reps":2,"net":"4g","w":390,"h":844,"dpr":3,"mobile":true'; done ;;
  h6) for v in rc main; do r H6 $v ',"reps":2,"reduced":true'; done ;;
esac
echo "GROUP $1 DONE"
