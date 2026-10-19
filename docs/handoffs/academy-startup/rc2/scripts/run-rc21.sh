#!/usr/bin/env bash
# Authorised 2026-10-19: bundled headless Chromium, one browser at a time (run.mjs enforces it), 10 cold loads, RC2.1 only.
S=/c/Users/mlmit/AppData/Local/Temp/claude/C--Users-mlmit-OneDrive-Desktop-mogsy--worktrees-academy-core-v1/5bb34c37-2269-427b-8d70-42fb00efb542/scratchpad
OUT=$(cygpath -m $S/acs-rc21)
mkdir -p "$S/acs-rc21"
B=https://127.0.0.1:4436
cd /c/Users/mlmit/OneDrive/Desktop/mogsy/.worktrees/academy-core-v1
export ACADEMY_PERF_MAX_MINUTES=12
r() { node scripts/academy-startup/run.mjs "{\"label\":\"$1-rc21\",\"base\":\"$B\",\"out\":\"$OUT\"$2}" 2>&1 | grep -E "rep|wrote|refused|FAILED" | tail -4; }
r H1 ',"reps":3'
r H2 ',"reps":3,"net":"4g"'
r H4 ',"reps":2,"path":"/lol"'
r H5 ',"reps":2,"net":"4g","w":390,"h":844,"dpr":3,"mobile":true'
echo RUN DONE
