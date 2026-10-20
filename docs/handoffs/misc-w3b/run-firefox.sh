#!/usr/bin/env bash
# Usage (cwd = frontend worktree): bash docs/handoffs/misc-w3b/run-firefox.sh <beforeBase> <afterBase>
# Firefox cannot emulate `isMobile`, so these runs give it the viewport and
# touch only; the geometry is what is being compared, not the device chrome.
BEFORE="${1:-http://localhost:5367}"
AFTER="${2:-http://localhost:5366}"
export ENGINE=firefox
L=docs/handoffs/misc-w3b/evidence
C="node docs/handoffs/misc-w3b/cap.cjs $L"
rm -f $L/firefox.done
$C ff-before "$BEFORE" fixture menu > $L/ff-before-fixture-menu.txt 2>&1
$C ff-after "$AFTER" fixture menu > $L/ff-after-fixture-menu.txt 2>&1
echo done > $L/firefox.done
