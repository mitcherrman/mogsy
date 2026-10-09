# Patch Hub — Summoner's Rift launch integration (PHSR1–4) — handoff

Final integration and certification of the four Summoner's Rift Patch Hub launch-readiness workstreams. Frontend only. Not merged to main, not pushed, not deployed.

## 1. Base and sources

| | |
|---|---|
| Repo | `mitcherrman/mogsy` |
| Base: `origin/main` (fetched and verified, no further drift) | `c08882f6982c6eca80431e00051f3af466397f12` |
| Drift since the PHSR base `d528bf9f` | 8 commits, Mastery/Journey only: `MASTERY_RETIREMENT_HANDOFF.md`, `src/pages/Quiz.hub.test.tsx`, `src/pages/Quiz.tsx`, `src/pages/quiz-mastery/{MasteryJourneyPlayerPage,MasteryJourneysPage}.tsx`, `src/pages/quiz-mastery/MasteryJourneys.test.tsx`. No Patch Hub file. |
| Branch | `patchhub/phsr-launch-integration` |
| Worktree | `C:\Users\mlmit\mogzy-wt\phsr-integration` (`node_modules` junction to the primary checkout) |
| Final SHA | the commit that adds this file (`git rev-parse patchhub/phsr-launch-integration`); code tip `a211d33c` |

| Source | Branch | Verified tip (matched the brief exactly) | Base |
|---|---|---|---|
| PHSR1 consumer status | `patchhub/phsr1-consumer-status` | `f7697a82f1530ae6c7dc22fe0774ce74da7b945b` | `d528bf9f` |
| PHSR2 Impact discovery | `patchhub/phsr2-impact-discovery` | `3a0231aee0d1f6f373e152534b59451da3ffb4a4` | `d528bf9f` |
| PHSR3 SR navigation | `patchhub/phsr3-sr-navigation` | `965da9029393e0cde4816584e6583a58c5d82b87` | `d528bf9f` |
| PHSR4 card polish | `patchhub/phsr4-card-polish` | `90ee790f6f53822ffc4354429eb3197cee57cf7f` | `d528bf9f` |

The four source branches were not modified.

## 2. Integration order and merges

Explicit `--no-ff` merges, full branch history preserved:

| Order | Merge commit | Source |
|---|---|---|
| 1 | `2149b668` | PHSR1 `f7697a82` |
| 2 | `9e5d75f4` | PHSR2 `3a0231ae` |
| 3 | `8ec21ede` | PHSR3 `965da902` |
| 4 | `92d5e2f1` | PHSR4 `90ee790f` |
| — | `a211d33c` | integration-only reconciliation (§3) |

**No textual conflicts.** The only file touched by two workstreams, `PatchReportEntityCard.test.tsx` (seam 1), auto-merged because the hunks are disjoint. Verified after merge: PHSR1's three vocabulary assertions (`Mogzy data update flagged`, `none recorded`, `^pending`, `Not auto-checked by Mogzy`) and PHSR4's fallback fixture (`{ ...jayceCard, mogzy_entity_ref: null }`) are both present, and the file passes 13/13. The merged tree passed all 12 workstream test files (230 tests) before any integration edit.

## 3. Integration-only changes (`a211d33c`)

All are combined-integration defects found by reviewing the merged page; no workstream was redesigned.

| File | Change | Why |
|---|---|---|
| `src/lib/patch-reports/mogzy-status.ts` | One `STATUS_COPY` map gives each reconciliation status a `headline` (notice) and a `short` label (masthead); `summarizeReconciliation` returns `shortLabel`. Unknown status → "Mogzy data status" in both. `RECONCILED_WITH_HELDS` body reworded (§5). | Seam 2: no second, independent wording map. Seam 3: brief's preferred copy. |
| `src/components/patch-reports/PatchHubMasthead.tsx` | Pill text = `summarizeReconciliation(reconciliation).shortLabel`; the component keeps only the tone map. `id="patch-hub"` and `scroll-mt-24` untouched. | Seam 2: the pill said "Mogzy data partly current" / "not reconciled" next to PHSR1's new banner. |
| `src/lib/patch-reports/filter.ts` | `STATUS_LABELS` = `MOGZY_STATUS_LABEL` (alias). | **PHSR1's handoff called this export dead. It is not:** `PatchReports.tsx` renders the public "Filter by Mogzy status" `<select>` from it (also on main). Options said Mismatch / Not represented / Needs interpretation / Unresolved. Option values (raw enums) and filtering are unchanged. |
| `src/components/patch-reports/PatchDataStatusNotice.tsx` | First-layer counts in check units only; the no-consumer count leaves the first layer (it stays in Technical details' state list); units caveat reworded. | Seam 3 (§5). |
| `PatchDataStatusNotice.test.tsx`, `mogzy-status.test.ts` | Assertions moved to the new copy (none removed); +2 notice tests (arithmetic guard, zero-checks case), +1 summary test (one wording map, short labels, unknown status), review-only hold phrase. | |
| `src/pages/lol/PatchReports.phsr-integration.test.tsx` (new, 12 tests) | Page-level seam tests on the real page (§10). | |

No backend enum, payload, anchor id, CTA logic, Impact math, scroll offset or card layout changed.

## 4. Final public status vocabulary

Line / entity (`MOGZY_STATUS_LABEL`, PHSR1, unchanged; now also the status-filter options):

| Enum | Label |
|---|---|
| `matches` | Mogzy data current |
| `applied` | Mogzy data updated |
| `pending` | Mogzy update in review |
| `mismatch` | Mogzy data update flagged |
| `unresolved` | Not yet matched to Mogzy data |
| `needs_interpretation` | Not auto-checked by Mogzy |
| `not_represented` | Not modeled by Mogzy |

Patch level (`STATUS_COPY`):

| Status | Notice headline | Masthead pill |
|---|---|---|
| `RECONCILED` | Mogzy's gameplay data is up to date with this patch | Mogzy data up to date |
| `RECONCILED_WITH_HELDS` | Mogzy's gameplay data is partly updated for this patch | Mogzy data partly updated |
| `RECONCILIATION_FAILED` | Mogzy's gameplay data update didn't finish | Mogzy data update didn't finish |
| `PUBLISHED_NOT_RECONCILED` / absent | No full Mogzy data update is recorded for this patch | No Mogzy data update recorded |
| unknown future status | Mogzy data status | Mogzy data status |

The old words (Mismatch, Not represented, Needs interpretation, Unresolved, "not reconciled", "partly current", the "Mogzy:" prefix) appear nowhere on the rendered page, including disclosures and screen-reader text (page test + browser scan at all four widths). Raw enums remain only as `Status code` / reconciliation keys under Technical details.

## 5. Final reconciliation banner (26.19, production data)

> **MOGZY DATA STATUS**
> **Mogzy's gameplay data is partly updated for this patch**
> Riot's patch notes below are complete. Mogzy has updated the changes it can safely incorporate; some mechanics are not yet modeled or need review. This describes Mogzy's own data — it never changes or disputes Riot's notes.
> 42 gameplay-data checks: 11 now up to date · 24 not modeled yet · 7 need review.
> Most other Riot notes do not map directly to a Mogzy gameplay-data field.
> Mogzy notes on individual changes were recorded when this report was built, before this update ran.
> › Technical details — status `RECONCILED_WITH_HELDS` · operation `26.19#1`, pipeline note, every terminal state with its count (incl. `NO_MOGZY_CONSUMER 173`), and: "One Riot change line can produce more than one gameplay-data check — a base stat with per-level growth is checked as two numbers — so the update counts 215 items in its own units, and its totals can differ from the number of changes listed in the report."

- Hold phrase is computed: both holds → "some mechanics are not yet modeled or need review"; only not-modeled → "some mechanics are not yet modeled"; only review → "some changes need review"; none → sentence ends.
- "Most other Riot notes…" only when there are checks and no-consumer notes; with zero checks it reads "Riot's notes for this patch do not map directly…".
- Nothing is hardcoded to 26.19; the first layer never shows 173, 214 or 215, and never says "changes" for checks. The masthead's "214 changes" therefore never sits beside a sum that reaches 215.
- Kept from PHSR1 on purpose: the Riot-first disclaimer sentence and the build-time note (Draven depends on it, §7).

## 6. Final Impact CTA state machine (PHSR2, unchanged)

| PH2 state | Label | `data-cta` |
|---|---|---|
| projected, `crossoverLevel = N` | View crossover at level N | `crossover` |
| projected, no crossover | View level 1–18 impact | `levels` |
| candidate (`parameter_only` + `history_incomplete`, evidence not loaded; also loading / failed) | Check level 1–18 impact | `check` |
| settled unavailable / parameter-only after evidence | View impact details | `details` |
| no Impact / unavailable / deferred family | no CTA | — |

No eager fetch, no new math, no auto-open (browser: graph chunk and `/api/meta/champion-stats` requested only on open; Vi opens with zero API requests).

## 7. Draven 26.19 combined behaviour

Order in the line: Riot **62 → 64** values → Mogzy Impact "Base AD 62 → 64 +2 · +3.2%" → closed CTA **Check level 1–18 impact** → status row "Mogzy data update flagged" (amber, muted, closed). Nothing in the closed line mentions 62 as Mogzy's value, "currently", "pending" or a dispute. Opening the status row: "When this report was built, Mogzy's data still had 62 here, not Riot's new value, so it was flagged for a Mogzy data update. … This is about Mogzy's own data, not Riot's patch note. Mogzy Impact works from Riot's published numbers. Mogzy's value when this report was built: 62". The banner's build-time sentence covers what happened after (prod now holds 64). Opening Impact loads evidence once, then the CTA becomes **View level 1–18 impact** (no crossover), the graph renders (Base AD at 18: 119.8 → 121.8), and provenance credits Riot for 62 → 64. Header shows "Mogzy data update flagged"; Combat Lab is the quiet "Combat Lab" link (`/combat-lab?attacker=draven`).

## 8. Vi 26.19 combined behaviour

Header: portrait, Vi, entity copy-link, "◆ Adjustment (inferred)" chip, "2 changes · Mogzy data update flagged", quiet Combat Lab top-right (desktop) / own compact row (phone). Base Stats AD `63 + 3.5/Level → 61 + 3.9/Level`; Impact base AD 63 → 61, growth 3.5 → 3.9, level 18 122.5 → 127.3; CTA **View crossover at level 8**; status row "Not auto-checked by Mogzy" (kept: build-time value 63 differs from the header). Passive Blast Shield shows the stored passive art (image loaded) with the `P` badge; status "Mogzy data update flagged". Opening Explore: graph chunk loads lazily, zero API requests, "crosses at 8" tick and "Crosses at 8" marker, change copy-link copies `…?patch=26.19#s-patch-champions__e-champion-vi__g-base-stats__c-attack-damage`; entity link copies `…?patch=26.19#s-patch-champions__e-champion-vi`. Tab order: copy link → Open Vi in Combat Lab → View crossover at level 8 → status disclosure, each with a visible gold focus ring. Cold deep link to the exact Vi AD line, the group fallback and the entity fallback all land clear of the sticky strip.

## 9. Real corpus findings (26.19 unless noted; production API, read-only)

| Card | Result |
|---|---|
| Aatrox | Quiet shell, one Combat Lab (104×40), no clipping at any width; two line rows (`flagged`, `not modeled`). |
| Aphelios | Five groups, header "Not modeled by Mogzy" once, **0** line rows; long formulas wrap inside value boxes at 320–1280; height 700 (1280) / 1,184 (375). |
| Aurora | E "Mogzy data update flagged" (formula only under Technical details), R "Not modeled by Mogzy"; independent and truthful. |
| Draven | §7. |
| Elise | Spider Queen stored passive art loads; two ability groups; 0 line rows; W keeps its own icon. |
| Vi | §8. |
| Fiora / Lillia / Ryze | Closed "Check level 1–18 impact"; after open "View level 1–18 impact" with graph. |
| Bel'Veth 26.15 | Closed "Check level 1–18 impact" with **zero** evidence requests; after open the evidence settles unavailable → "View impact details", no graph. (Recaptured fresh; PHSR2's `docs/phsr2-captures/` predate this and were not used.) |

Combined review (1280 and 375, all six cards): one coherent hierarchy — Riot entity and commentary, Riot values (the dominant element), Impact as a gold rail annotation, muted Mogzy status, quiet share + Combat Lab, sticky strip only when deep. No conflicts between PHSR4's quieter shell and PHSR2's gold CTA (gold now marks Riot's new values, Impact and focus only). No aesthetic change was needed.

## 10. Tests

| Run | Result |
|---|---|
| Workstream files on the merged tree, before integration edits (12 files) | 230 / 230 |
| Integration seam tests `PatchReports.phsr-integration.test.tsx` | 12 / 12 |
| Regression batch 1, `src/pages/lol/PatchReports*` (9 files, incl. `PatchReports.catchup`, ph4a ×2, ph4c, history, phsr3, phsr4, integration) | 122 / 122 |
| Batch 2: `components/{patch-catchup,patch-hub-combat-lab,patch-hub-share,patch-impact,patch-reports}`, `hooks/usePatch{CatchUpLoader,HubShare,ImpactLoader}`, `lol/broadcast/usePatchBriefFeed`, `pages/CombatLab.deeplink` (22 files) | 375 / 375 |
| Batch 3: `lib/{patch-catchup,patch-catchup-loader,patch-hub-combat-lab,patch-hub-share,patch-impact,patch-impact-loader,patch-reports,combat-lab}` (39 files) | 975 / 975 |
| **Total regression** | **70 files, 1,472 tests, 0 failures**, no unhandled errors |

Each batch was its own `vitest run --maxWorkers=3` process with the dev server stopped. `PatchReports.catchup.test.tsx` passed in the batch; no timeout was seen and none was changed.

## 11. Mutation checks (integration seams; each restored byte-for-byte, `git status` clean after)

| # | Mutation | Caught by |
|---|---|---|
| 1 | Masthead pill back to "Mogzy data partly current" | 2 integration tests (pill, stale-word scan) |
| 1b | Status filter `mismatch` back to "Mismatch" | 1 integration test |
| 2 | PHSR1 redundant-status suppression disabled | 3 (PHSR1 Aphelios, Elise; integration Aphelios) |
| 3 | PHSR2 candidate CTA "Check" → "View" | 9 (PHSR2 discovery incl. Draven/Fiora/Lillia/Ryze/Bel'Veth; integration Draven, Bel'Veth) |
| 4 | PHSR3 scroll-padding cleanup removed | 10 (sticky component + page, incl. Catch Up clean) |
| 4b | PHSR3 masthead landing margin removed | 1 integration test (seam 4) |
| 5 | PHSR4 passive runtime `onError` fallback removed | 1 (falls back to `P` glyph) |
| 5b | PHSR4 stored passive art disabled | 6 (PHSR4 + integration Vi, Elise) |

## 12. ESLint, TypeScript, build

- `eslint --max-warnings 0` on all 32 TS/TSX files changed vs `origin/main`: **clean**.
- `tsc -p tsconfig.app.json --noEmit` (the repo's `node_modules/typescript/bin/tsc`, same binary `npx.cmd tsc` resolves) on a clean detached checkout of exact `c08882f6` and on the integration tree: **2 errors each, byte-identical output** (`OnboardingProfile.tsx(180,48)`, `identity/connections.ts(263,13)`, both TS2345 Supabase typing). **0 new.**
- `npm.cmd run build` (vite build + item/champion prerender + verify): **exit 0**; 4,762 modules, built in 25.7s; 213 item and 173 champion prerendered pages verified. Warnings are pre-existing (Tailwind ambiguous `duration-[…]`/`ease-[…]` classes not in any changed file; chunk-size; supabase client dynamic/static import). The prerender rewrote the tracked `public/sitemap.xml` as a side effect; that was reverted, and `dist/` removed.

## 13. Browser matrix

Headless msedge via Playwright against a local Vite server on this worktree (port 5391, launch entry `phsr-int`), production API read-only, real 26.19 / 26.15 data. **Supabase-blocked twice over**: every `supabase.(co|in)` request aborted by route, and the worktree's local `.env` temporarily pointed `VITE_SUPABASE_URL` at an unresolvable `*.supabase.invalid` host (restored to the committed value afterwards; never staged). No auth, profile or analytics write could reach production; no non-GET request to any other host was observed. Combat Lab links were inspected, never followed. Scripts and raw results (git-excluded): `.claude/phsr-int-cert/` (`nav-cert.cjs` = PHSR3's cert retargeted, `cards-cert.cjs`, `review.cjs`, `mutate.py`, `results/`).

| Width | Navigation cert | Card / interaction cert | Strip | Heading landing | Page x-overflow | Dup ids | Page / console errors |
|---|---|---|---|---|---|---|---|
| 1280×900 | 99 / 99 | 54 / 54 | 62–98 | 110 | 0 | 0 | 0 / 0 |
| 768×1024 | 99 / 99 | 54 / 54 | 62–98 | 110 | 0 | 0 | 0 / 0 |
| 375×812 | 105 / 105 | 54 / 54 | 54–90 | 102 | 0 | 0 | 0 / 0 |
| 320×640 | 105 / 105 | 54 / 54 | 54–90 | 102 | 0 | 0 | 0 / 0 |

(Console totals were only the deliberately blocked Supabase requests, ~180 per run.) Strip geometry and landing offsets are identical to PHSR3's standalone certification, so PHSR4's layout did not move PHSR3's scroll contract.

Card cert per width: no stale wording (visible or hidden); pill text; `id="patch-hub"`; status filter inside the viewport; six cards with 0 clipped descendants, one Combat Lab inside the card and not over the title, every action ≥24px high (share/Combat Lab/CTA 40, disclosures 32), commentary before changes, Aphelios 0 rows, Vi/Elise passive art loaded; keyboard focus ring on share, Combat Lab and CTA; Vi lazy graph + share; Draven, Fiora, Lillia, Ryze candidate → confirmed; Bel'Veth 26.15 Check → details.

## 14. Navigation, history, filters, Catch Up

- **Sequence** Top → Champions (full nav) → Buffs → Nerfs → Adjustments → Vi (hash) → Items → Systems → Top (strip), then Back ×8 and Forward, at every width: exact hash, heading landed clear of the strip, strip shown/hidden correctly, correct `aria-current` destination, the router saw every fragment navigation, original URL (`?patch=26.19`, no hash, strip hidden) restored, Forward works, no history corruption, no extra report requests.
- **Deep links**: cold exact Vi AD line, group fallback (`…__c-renamed-by-riot` → group, URL untouched), entity fallback; cached in-page hash to Draven and Draven AD with **0** report requests.
- **Filters**: search "Vi" → Champions, Adjustments, Top (all resolve); type Champions → Champions + buckets only; type Item → Items only; four status options each keep every sticky link resolvable; no matches → no strip, no sentinel, no padding; clearing restores it.
- **Catch Up**: switching in removes the strip and leaves `scroll-padding-top: auto`; baseline 26.14 and scrolled Catch Up stay clean; Back returns to the report with the strip; cold `?since=26.14#cu-…` deep link lands with no strip or padding; switching back to Patch Report restores both. PH3 behaviour (incl. `PatchReports.catchup` and PH4-A Catch-Up tests) intact.

## 15. Changed-file audit (`git diff --name-status origin/main...HEAD`, 49 files)

| Source | Files |
|---|---|
| PHSR1 | `docs/PATCH_HUB_PHSR1_HANDOFF.md`; `PatchReportChangeLine.tsx`, `PatchReportChangeLine.phsr1.test.tsx`, `PatchReportStatus.tsx`; `lib/patch-reports/phsr1-sr-fixtures.ts` |
| PHSR1 + integration | `PatchDataStatusNotice.tsx`, `PatchDataStatusNotice.test.tsx`; `lib/patch-reports/mogzy-status.ts`, `mogzy-status.test.ts` |
| PHSR2 | `docs/PATCH_HUB_PHSR2_HANDOFF.md`; `docs/phsr2-captures/*` (12 PNG + `report.json`); `patch-impact/{PatchImpact.tsx, PatchImpactExplore.tsx, cta.ts, PatchImpact.test.tsx, PatchImpact.discovery.test.tsx}` |
| PHSR3 | `docs/PATCH_HUB_PHSR3_HANDOFF.md`; `PatchHubStickyNav.tsx`, `PatchHubStickyNav.test.tsx`; `lib/patch-reports/{sr-navigation.ts, sr-navigation.test.ts, sr-test-fixtures.ts}`; `pages/lol/PatchReports.tsx`, `PatchReports.phsr3.test.tsx` |
| PHSR3 + integration | `PatchHubMasthead.tsx` |
| PHSR4 | `docs/PATCH_HUB_PHSR4_HANDOFF.md`; `patch-hub-combat-lab/CombatLabHandoffLink.tsx`, `CombatLabHandoffLink.test.tsx`; `PatchReportAbilityGroup.tsx`, `PatchReportEntityCard.tsx`, `PatchReportEntityHeader.tsx`, `PatchReportEntityCard.phsr4.test.tsx`, `passiveArt.ts`; `pages/lol/PatchReports.phsr4.test.tsx` |
| PHSR1 + PHSR4 (seam 1) | `PatchReportEntityCard.test.tsx` |
| Integration only | `lib/patch-reports/filter.ts`; `pages/lol/PatchReports.phsr-integration.test.tsx`; this handoff |

No unrelated file. The primary checkout and its untracked files were not touched.

## 16. Cleanup

- `C:\Users\mlmit\mogzy-wt\phsr3-base`: verified clean and detached at `d528bf9f`; its `node_modules` junction removed with `rmdir` (shared `node_modules` verified intact), then `git worktree remove` + `prune`.
- My own temporary tsc baseline `C:\Users\mlmit\mogzy-wt\phsr-int-base` (detached `c08882f6`): removed the same way.
- Kept: the four source worktrees (`phsr1`–`phsr4`) until integration is accepted; this worktree; the `phsr-int` launch entry in the primary checkout's git-excluded `.claude/launch.json` (for re-running the cert).

## 17. Known limitations

- **Line status is still a build-time snapshot** (PHSR1 §8): Draven/Vi/Fiora/Lillia/Ryze lines describe Mogzy's data at report build; prod has since applied them. The copy is truthful but can't say "updated after publish" per line until the backend serves each reconciliation row's terminal state beside the line.
- The banner still says "this patch", not "26.19" (PHSR1's optional `patchVersion` prop not added; not a combined defect).
- "Mogzy data current" (the `matches` line label) and the masthead's "Mogzy data up to date" are different on purpose (line vs patch); both are consumer phrasing.
- PHSR2's committed `docs/phsr2-captures/` show the pre-correction "View" label for Draven/Fiora closed. They are historical; do not use them as evidence (owner may delete them before merge).
- PHSR3 limitations carry over: the strip precedes Team Voice in DOM order (Shift+Tab from content cannot reach it while shown; the full nav is the keyboard route); active highlight recomputes on scroll/resize only; Runes has no 26.19 section (unit/page-tested only); 24px strip targets meet WCAG 2.5.8 but not 44px.
- Chromium (msedge) only; no WebKit/Safari or real touch device. Touch emulated with `hasTouch`.
- The status filter at 26.19 offers all seven statuses even when a patch has no card in some of them (unchanged pre-existing behaviour).

## 18. Main integration instructions

1. `git fetch origin && git rev-parse origin/main` — expect `c08882f6…`. If it moved, re-verify the drift touches no Patch Hub file; if it does, re-merge and re-run §10.
2. From the primary repo (or a fresh main worktree): `git merge --no-ff patchhub/phsr-launch-integration` (fast-forward is also possible while main is still `c08882f6`).
3. Re-run, bounded: `node node_modules/vitest/vitest.mjs run src/pages/lol/PatchReports --maxWorkers=3`, then the component and lib batches in §10 as separate processes. Do not run the whole suite in one process.
4. Frontend-only deploy (Lovable publish). No backend, env, migration or ordering constraint.
5. Rollback: revert the merge. Nothing persists (the sticky scroll padding is removed on unmount; no storage keys).

## 19. Recommendation

**GO** for merging to main: all four certified branches combine without conflict, the three combined defects found (stale masthead pill, stale public status filter, 42 + 173 arithmetic beside the masthead's 214) are fixed through the existing semantic authority, and tests, mutations, lint, type-check, build and the four-width browser matrix are green.
