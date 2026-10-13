#!/usr/bin/env bash
# RECONSTRUCT-R3B live matrix (DEV ONLY). Usage: matrix.sh <r3b|base> <outdir> [quick|timeout]
# Needs RC_SCRATCH (holds rig-r3b/ rig-base/ scratch DBs) and the servers from README.md.
set -u
SP="${RC_SCRATCH:?set RC_SCRATCH to a scratch directory outside any repo}"
WTS="${RC_BE_WORKTREES:-C:/Users/mlmit/OneDrive/Desktop/League_Combat_Simulator/.worktrees}"
which=$1; out=$2
if [ "$which" = r3b ]; then
  export RC_BACKEND_WORKTREE="$WTS/reconstruct-r3b-be" RC_RIG_DATA="$SP/rig-r3b" RC_BACKEND_PORT=8177 RC_FRONTEND_URL=http://localhost:8141
  export RC_FE_PACKAGE="C:/Users/mlmit/mogzy-wt/reconstruct-r3b-fe/package.json"
else
  export RC_BACKEND_WORKTREE="$WTS/reconstruct-r3b-be-base" RC_RIG_DATA="$SP/rig-base" RC_BACKEND_PORT=8178 RC_FRONTEND_URL=http://localhost:8142
  export RC_FE_PACKAGE="C:/Users/mlmit/mogzy-wt/ranked-int1-fe/package.json"
fi
export RC_PLAYWRIGHT_EXE="${RC_PLAYWRIGHT_EXE:-C:/Users/mlmit/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe}"
cd "$(dirname "$0")"
run() { echo "== $which $*"; timeout 400 node play-match.mjs --out "$out" "$@" 2>&1 | grep -E '^(wrote|segments|Error)|Timeout|rror:' | cut -c1-300; }
if [ "${3:-}" = timeout ]; then run --vp 1440x900 --plan timeout,right,timeout; exit 0; fi
for vp in 1280x600 1440x900 390x844 360x640; do
  run --vp $vp --plan right,wrong,wrong --shots 1
done
run --vp 1280x600 --motion reduce --plan right,wrong,wrong
run --vp 390x844 --motion reduce --plan right,wrong,wrong
if [ "${3:-}" != quick ]; then
  run --vp 1440x900 --plan wrong,right,timeout
  run --vp 1440x900 --plan right,right,right
  run --vp 1440x900 --plan wrong,wrong,wrong --reload 1
  run --vp 1440x900 --plan right,wrong,wrong --reload 3
  run --vp 390x844 --plan right,wrong,wrong --reload 3
fi
