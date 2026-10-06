# Patch Hub PH4-A: share links and resilient landing

Frontend only. No backend, Combat Lab, quiz, Studio, graph or domain (`lib/patch-impact`, `lib/patch-catchup`) changes.

## 1. Baseline

| | |
|---|---|
| Base SHA (`origin/main`, verified, no drift) | `0b25b3c492fedba71b6f21f8c6a3f9eb783db31e` |
| Branch | `patchhub/ph4a-share-links` |
| Final SHA | see `git rev-parse patchhub/ph4a-share-links` (the commit that adds this file; a SHA cannot name itself) |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph4a` (outside OneDrive; `node_modules` junction) |
| Audit input | `docs/PATCH_HUB_PH4_ACTIONS_AUDIT.md` on `patchhub/ph4-actions-audit` (84f996b3); not copied into this branch |

## 2. Files changed

New
- `src/lib/patch-hub-share/urls.ts`: `reportAnchorUrl(patch, anchor)`, `catchUpEntryUrl(since, entryId)`
- `src/lib/patch-hub-share/anchors.ts`: `changeShareEligibility`, `anchorFallbacks`, `resolveLandingTarget`
- `src/hooks/usePatchHubShare.ts`: `sharePatchHubLink`, `canUseNativeShare`, `usePatchHubShare`
- `src/components/patch-hub-share/ShareLinkButton.tsx`
- Tests: `lib/patch-hub-share/share.test.ts`, `hooks/usePatchHubShare.test.ts`, `components/patch-impact/PatchImpactChangeAnalysis.share.test.tsx`, `pages/lol/PatchReports.ph4a.report.test.tsx`, `pages/lol/PatchReports.ph4a.catchup.test.tsx`

Edited
- `pages/lol/PatchReports.tsx`: `entityShare` slot, landing effect (frame re-apply, cleanup, fallback)
- `components/patch-reports/PatchReportEntrySlots.ts`: new optional `entityShare` slot
- `components/patch-reports/PatchReportEntityHeader.tsx`: permalink uses the slot
- `components/patch-impact/PatchImpactChangeAnalysis.tsx`, `PatchImpact.tsx`, `PatchImpactExplore.tsx`: thread an optional `shareChange`
- `components/patch-catchup/PatchCatchUpEntry.tsx`, `PatchCatchUpView.tsx`, `render-context.ts`: per-entry share via the render context (`shareSince`)

## 3. URL contracts

| Surface | URL |
|---|---|
| Report entity | `https://mogzy.lol/lol/patch-reports?patch=<version>#<entity anchor>` |
| Report change (Explore) | `…?patch=<version>#<…__g-<group>__c-<property>>` |
| Catch-Up entry | `https://mogzy.lol/lol/patch-reports?since=<baseline>#cu-…` |

- Always built from explicit inputs plus `SITE_URL`, never from `window.location`.
- `patch` and `since` never coexist; no `?through=`; remembered-baseline behaviour is untouched.
- Catch-Up shows no share when there is no baseline (`?view=catchup` has no entries anyway).
- The entity permalink keeps a site-relative `href` of the same canonical form, so open-in-new-tab and no-JS still work. A plain click copies/shares, then `replace`-navigates to the canonical `?patch=…#anchor` (no history entry). Modified clicks stay native.

## 4. Share eligibility (`changeShareEligibility`)

A per-line share is offered only when the change has a Riot `property_name` label and no other line in the same card shares its group + property. Verified against `semantic-ids.ts`: duplicates get `-2`/`-3` by order, and an unlabelled line is `c-change`, so both are positional.

| Target | Share |
|---|---|
| Entity | always |
| Labelled, unique change (Vi 26.19 AD, Vi Passive Shield, Draven 26.19 AD) | eligible |
| Unlabelled (real Zeri 26.10 R, `…__c-change`) | no, `unlabelled` |
| Duplicate group+property (synthetic pair in tests; none exist in the frozen corpus) | no, `duplicate` |
| Catch-Up entry | always, with a baseline |

Per-line share is only surfaced inside Impact Explore (projected Base Stats lines). No per-line buttons on the report.

## 5. Share behaviour

- Desktop (`pointer: fine`): always copy + sonner "Link copied" / "Could not copy link".
- Touch (`pointer: coarse`) with `navigator.share`: native share with the exact URL. Cancel (`AbortError`) is silent; any other failure falls back to copy.
- Reason: Edge and Safari desktop expose `navigator.share`, and a system sheet is wrong for a control called "Copy link". This refines the audit's "native share whenever present".
- No new notification system; sonner only (the pattern from `BlogShareButtons`).

Accessible names: entity "Copy link to {name} changes"; change "Copy link to {name} {property} change in Patch {v}"; Catch-Up "Copy link to {name} changes since Patch {since}". Targets are 40px.

## 6. Landing and fallback

Report hash effect: scroll, then one `requestAnimationFrame` re-apply if the element is still connected. The pending frame is cancelled before rescheduling and on unmount. No `scrollRestoration` change.

Candidates: exact id → group id (strip `__c-…`) → entity id (strip `__g-…`). It never climbs above the entity and never picks a sibling; an unknown entity does not scroll. Fallback affects landing only: the URL is not rewritten, and share URLs never use it.

## 7. Tests

| Run | Result |
|---|---|
| PH4-A new files (5) | 38 tests pass |
| PH1/PH2/PH3 regression set (`lib/patch-reports`, `components/patch-reports`, `patch-impact`, `patch-catchup`, `lib/patch-impact`, `patch-impact-loader`, `lib/patch-catchup`, `patch-catchup-loader`, `hooks/usePatch*`, `pages/lol/PatchReports*`, `components/lol/broadcast`), `--maxWorkers=4` | 40 files, 762 tests pass |
| ESLint on changed TS/TSX | 0 errors, 0 warnings |
| `tsc -p tsconfig.app.json --noEmit` | 6 errors, identical set to a clean checkout of the same SHA (OnboardingProfile, identity/connections, 4× practiceLeaveContract.test) |

Mutation: removing the second-frame block from `PatchReports.tsx` makes "re-applies the scroll once on the next frame" and "unmounting cancels the pending frame" fail (15/17 pass); restored, 17/17.

Coverage map to the brief: 1, 2 (urls + page), 3, 4 (Explore only for eligible lines; component test for duplicates), 5, 6 (hook), 7, 8 (cold/cached), 9, 10, 11, 12, 13, 14 (Catch-Up stays in Catch-Up and the existing PH3 catch-up suite still passes), 15.

## 8. Browser certification

Real route, Vite dev server on this worktree (port 5342), production API, built-in browser; clipboard/share stubbed to record what was sent.

| Check | Desktop 1280 | Mobile 375 (touch emulation) |
|---|---|---|
| Entity share (Vi) | copies `…?patch=26.19#s-patch-champions__e-champion-vi`; page URL had no `?patch=` | Draven entity: native share with the canonical URL |
| Explore "Copy link to this change" (Vi AD, Draven AD) | exact change URL, 40px | native share with exact URL, 176×40 |
| Vi Passive Shield | no share | n/a |
| Exact-line landing after load | top 96px | top 196px (Draven AD) |
| Fallback (`c-renamed-by-riot`) | lands on the group; URL unchanged | n/a |
| Catch-Up share (Bel'Veth, Sundered Sky; 77 entries, 77 controls) | `?since=26.14#cu-…`, no `patch=`, stays in Catch-Up, 0 report permalinks | native share with exact URL; entry lands at top 96px |
| Horizontal overflow | none | none |
| Duplicate IDs | 0 | 0 |
| Console errors | none | none |

Not covered: real browser-restoration timing (covered by the frame-clock tests, as PH3), Safari/iOS native share sheet, real clipboard permission prompts. Screenshots were unavailable (the pane was not visible); verification was DOM-based.

## 9. Deviations from the audit

1. The audit lists Bel'Veth 26.15 "Total Attack Animation" as positional with no per-line share. In current code it is labelled and unique (`…__c-total-attack-animation`), so the helper calls it eligible. It is `mechanical`, so Explore never renders for it and no share is offered. The unstable example used is the real Zeri 26.10 unlabelled line plus a synthetic duplicate pair.
2. Native share is touch-only (§5).
3. The entity header's permalink became 40×40 (was a ~24px icon), for touch targets. The heading row can grow by a few px.

## 10. Known limitations

- Explore open state and level are not in the URL (a shared change link lands on the line, Explore closed). This matches the audit.
- A `?since=` link covers (X, latest], so content grows as patches ship; the entry persists.
- Anchors can still change if Riot renames a property, group slot or section id; landing then degrades to the group or entity.
- The only `useMemo` dependency change in Catch-Up (`since`) is intentional; it only affects the context object.

## 11. Merge instructions

No conflicts expected with PH3: `PatchReports.tsx`, `PatchCatchUpEntry.tsx`, `PatchCatchUpView.tsx` are on main at 0b25b3c4. From the primary checkout:

```bash
git fetch origin && git rev-parse origin/main   # expect 0b25b3c4…, else re-verify
git merge --no-ff patchhub/ph4a-share-links
npx vitest run src/lib/patch-hub-share src/hooks/usePatchHubShare.test.ts src/pages/lol/PatchReports --maxWorkers=4
```

Rollback: revert the merge; no data or schema involved. Do not run the whole suite in one process.

## 12. Next recommended task

PH4-B: the Explore level graph (audit §3 / §13), then PH4-C: "Open in Combat Lab" (champion only). The share control in Explore sits below the provenance block, so the graph can go between the scrubber and the readout without moving it.
