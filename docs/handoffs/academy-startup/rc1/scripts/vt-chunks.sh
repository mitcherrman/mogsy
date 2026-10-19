#!/usr/bin/env bash
# Usage: vt-chunks.sh <worktree> <outdir>
# Runs the frontend vitest suite as fresh processes per chunk (the whole suite OOMs in one process).
WT="$1"; OUT="$2"
mkdir -p "$OUT"
cd "$WT" || exit 1
EXCL="src/test/security/pt2cProfileFrameAuthority.test.ts"
run() {
  local name="$1"; shift
  timeout 1500 node node_modules/vitest/vitest.mjs run "$@" --maxWorkers=4 --reporter=verbose --exclude "$EXCL" --exclude "node_modules/**" --exclude "e2e/**" > "$OUT/$name.log" 2>&1
  echo "$name exit=$?" >> "$OUT/summary.txt"
}
: > "$OUT/summary.txt"
for d in src/pages/academy-core src/pages/dev src/pages/admin src/pages/quiz-daily-challenge; do
  run "$(echo $d | tr / _)" "$d"
done
# rest of src/pages excluding the above
run src_pages_rest src/pages --exclude "src/pages/academy-core/**" --exclude "src/pages/dev/**" --exclude "src/pages/admin/**" --exclude "src/pages/quiz-daily-challenge/**"
run src_lib src/lib
run src_components src/components
run src_hooks src/hooks
run src_rest src --exclude "src/pages/**" --exclude "src/lib/**" --exclude "src/components/**" --exclude "src/hooks/**"
echo DONE >> "$OUT/summary.txt"
