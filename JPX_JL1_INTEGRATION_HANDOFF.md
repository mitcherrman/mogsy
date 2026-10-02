# JPX + JL1 frontend integration (local, fast verification)
Base `origin/main` 08c49bdc. Merged: `jl1/admin-journey-launchers` fee2324a, `jpx/playtest-ux` a9e20d6a. No conflicts; no file overlap with the new main commits (SC-RENAME3 / RCP1 / PHASE1 touch Stat Check labels, level badge, option media). Screenshots: `docs/handoffs/jpx-integration/`.
Release order (with backend): JL1 presets -> this frontend -> shard `effects` backend. Backend integration branches: stage 1 `jpx/int-be-stage1` (master fe485edb + JL1), stage 2 `jpx/int-be-jl1` (= stage 1 + shard effects).
Pre-existing failures on origin/main (not ours): AdminPlatformPolicies "no file outside the policy module…", AdminQuizReview.proPlay "--review-key".
