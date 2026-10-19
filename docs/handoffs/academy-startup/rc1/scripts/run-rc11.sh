#!/usr/bin/env bash
# Authorised 2026-10-18 (second run): bundled headless Chromium, one browser at a time, 12 cold loads: H1+H2, RC1 vs RC1.1, 3 reps.
S=/c/Users/mlmit/AppData/Local/Temp/claude/C--Users-mlmit-OneDrive-Desktop-mogsy--worktrees-academy-core-v1/5bb34c37-2269-427b-8d70-42fb00efb542/scratchpad
OUT=$(cygpath -m $S/acs-rc11)
mkdir -p "$OUT"
declare -A BASE=([rc]=https://127.0.0.1:4432 [rc11]=https://127.0.0.1:4434)
cd /c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/academy-core-v1
export ACADEMY_PERF_MAX_MINUTES=12
r() { node scripts/academy-startup/run.mjs "{\"label\":\"$1-$2\",\"base\":\"${BASE[$2]}\",\"out\":\"$OUT\"$3}" 2>&1 | grep -E "rep|wrote|refused|FAILED" | tail -4; }
for v in rc11 rc; do r H1 $v ',"reps":3'; done
for v in rc rc11; do r H2 $v ',"reps":3,"net":"4g"'; done
echo RUN DONE
