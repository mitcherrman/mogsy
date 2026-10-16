# `captureV1.json` — provenance

Copied **verbatim** (byte-identical) from backend `mitcherrman/League_Combat_Simulator`
branch `perfect-timing/pt42-score` at commit `4e9a6758` (PT4.2-SCORE),
file `perfect_timing/fixtures/capture_v1.json`, written by
`perfect_timing/tests/make_capture.py`. Blob `sha256 75ed8e85…`.

PT4.2-SCORE changed only `scoring_version` (`pt-scoring-0.1` → `pt-scoring-0.2`)
from the previous copy (PT3 `1b81c460`, `sha256 335c1f02…`); its one miss
already scored 0.

- One `perfect_timing.deal.v1` response (5 rounds) and the
  `perfect_timing.release.v1` response for each round.
- Data source: PT3's **test fixture database**, whose rows are copied from the
  committed ledger `audit/champdata_p11_cooldown_ledger.csv` (2026-09-07).
  It is not production data and does not certify a current patch
  (`patch_label: null`, `patch_source: "unknown"`).
- No value in it was written by hand on the frontend. Do not edit it: regenerate
  it on the backend and copy it again, updating the SHA above.

Consumers: `src/lib/perfect-timing/contract.test.ts`,
`src/pages/admin/perfect-timing/PerfectTimingPage.test.tsx`,
`e2e/perfect-timing-owner.spec.ts`.
