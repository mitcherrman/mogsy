#!/usr/bin/env bash
# RECONSTRUCT-R3C live matrix (DEV ONLY). Usage: matrix.sh <r3c|base> <outdir> <args for play-match.mjs...>
# Needs RC_SCRATCH (holds rig-r3c/ rig-base/ scratch DBs) and the servers from README.md.
set -u
SP="${RC_SCRATCH:?set RC_SCRATCH to a scratch directory outside any repo}"
WTS="${RC_BE_WORKTREES:-C:/Users/mlmit/OneDrive/Desktop/League_Combat_Simulator/.worktrees}"
which=$1; out=$2; shift 2
if [ "$which" = r3c ]; then
  export RC_BACKEND_WORKTREE="$WTS/reconstruct-r3c-be" RC_RIG_DATA="$SP/rig-r3c" RC_BACKEND_PORT=8187 RC_FRONTEND_URL=http://localhost:8151
  export RC_FE_PACKAGE="C:/Users/mlmit/mogzy-wt/reconstruct-r3c-fe/package.json"
else
  export RC_BACKEND_WORKTREE="$WTS/reconstruct-r3c-be-base" RC_RIG_DATA="$SP/rig-base" RC_BACKEND_PORT=8188 RC_FRONTEND_URL=http://localhost:8152
  export RC_FE_PACKAGE="C:/Users/mlmit/mogzy-wt/reconstruct-r3c-fe-base/package.json"
fi
export RC_PLAYWRIGHT_EXE="${RC_PLAYWRIGHT_EXE:-C:/Users/mlmit/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe}"
cd "$(dirname "$0")"
echo "== $which $*"
timeout 400 node play-match.mjs --out "$out" "$@" 2>&1 | grep -E '^(wrote|segments|Error)|Timeout|rror:' | cut -c1-300
