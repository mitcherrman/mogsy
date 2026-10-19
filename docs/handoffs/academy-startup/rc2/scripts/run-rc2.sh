#!/usr/bin/env bash
# Authorised 2026-10-19: bundled headless Chromium, one browser at a time (run.mjs enforces it), 30 cold loads, RC1 vs RC2.
# Usage: run-rc2.sh <group>
S=/c/Users/mlmit/AppData/Local/Temp/claude/C--Users-mlmit-OneDrive-Desktop-mogsy--worktrees-academy-core-v1/5bb34c37-2269-427b-8d70-42fb00efb542/scratchpad
OUT=$(cygpath -m $S/acs-rc2)
mkdir -p "$S/acs-rc2"
declare -A BASE=([rc]=https://127.0.0.1:4432 [rc2]=https://127.0.0.1:4435)
cd /c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/academy-core-v1
export ACADEMY_PERF_MAX_MINUTES=12
r() { node scripts/academy-startup/run.mjs "{\"label\":\"$1-$2\",\"base\":\"${BASE[$2]}\",\"out\":\"$OUT\"$3}" 2>&1 | grep -E "rep|wrote|refused|FAILED" | tail -4; }
case "$1" in
  h1) for v in rc2 rc; do r H1 $v ',"reps":3'; done ;;
  h2) for v in rc rc2; do r H2 $v ',"reps":3,"net":"4g"'; done ;;
  h3) for v in rc2 rc; do r H3 $v ',"reps":2,"net":"slow4g","ms":9000'; done ;;
  h4) for v in rc rc2; do r H4 $v ',"reps":2,"path":"/lol"'; done ;;
  h5) for v in rc2 rc; do r H5 $v ',"reps":2,"net":"4g","w":390,"h":844,"dpr":3,"mobile":true'; done ;;
  h6) for v in rc rc2; do r H6 $v ',"reps":2,"reduced":true'; done ;;
esac
echo "GROUP $1 DONE"
