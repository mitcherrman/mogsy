#!/usr/bin/env bash
# Usage (cwd = frontend worktree): bash docs/handoffs/misc-w3b/run-batch.sh <beforeBase> <afterBase> [browser-channel]
# Captures before (base checkout's dev server) and after (this worktree's) for
# the three views on both surfaces. One run is ~8 viewports x ~20 s.
BEFORE="${1:-http://localhost:5367}"
AFTER="${2:-http://localhost:5366}"
export BROWSER_CHANNEL="${3:-msedge}"
L=docs/handoffs/misc-w3b/evidence
C="node docs/handoffs/misc-w3b/cap.cjs $L"
rm -f $L/batch.done
$C before "$BEFORE" live menu > $L/before-live-menu.txt 2>&1
$C after "$AFTER" live menu > $L/after-live-menu.txt 2>&1
$C after "$AFTER" fixture menu > $L/after-fixture-menu.txt 2>&1
$C before "$BEFORE" fixture ranked > $L/before-fixture-ranked.txt 2>&1
$C after "$AFTER" fixture ranked > $L/after-fixture-ranked.txt 2>&1
$C before "$BEFORE" fixture invite > $L/before-fixture-invite.txt 2>&1
$C after "$AFTER" fixture invite > $L/after-fixture-invite.txt 2>&1
echo done > $L/batch.done
