# PHSR3 — Summoner's Rift navigation (handoff, WIP)

Branch `patchhub/phsr3-sr-navigation`, worktree `C:\Users\mlmit\mogzy-wt\phsr3`,
base origin/main `d528bf9f` (verified). Dev entry `phsr3`, port 5373. Not pushed or merged.

## Status: IN PROGRESS (stopped at usage limit). Not ready to merge yet.

### Built
- `src/lib/patch-reports/sr-navigation.ts`: pure helpers. Main-game sections are Champions, Items, Runes, Systems / Game Systems, matched by title slug and kept in official order. Champion Buffs/Nerfs/Adjustments(/Other) buckets come from the filtered structure. Also `activeSrAnchor` (the deepest box spanning the probe line; null outside the main-game sections), `isCondensedNavStuck`, and `PATCH_HUB_TOP_ANCHOR = "patch-hub"`.
- `src/components/patch-reports/PatchHubStickyNav.tsx`: a single line, `26.19 | Champions Buffs 7 Nerfs 8 Adjustments 2 | Items | Systems | ↑ Top`.
  - Sits in a zero-height sticky holder after the full section nav, at `top: calc(var(--app-header-h) + 0.375rem)`, so it shows only once the full nav has scrolled away. A sentinel and holder comparison gives the threshold.
  - Uses plain fragment links, so history, Back and deep links work like the full nav. Hidden means inline `visibility:hidden`, which takes it out of the accessibility tree and the tab order.
  - Marks the current location with `aria-current="location"`.
  - Below 640px the strip scrolls horizontally with a fade and follows the active link. All destinations stay one swipe away.
  - While the report is mounted it sets html `scroll-padding-top: max(0px, calc(var(--app-header-h) + 3.375rem - 6rem))`, giving 6px on mobile and 14px from sm up. It restores the previous value on unmount, so Catch Up is unaffected.
- `PatchHubMasthead`: the header now has `id="patch-hub"` and `scroll-mt-24`, so the Top link lands at y=0.
- `PatchReports.tsx`: mounts the sticky nav. The reconciliation-notice anchors get `scroll-mt-24`, which fixes an existing case where they landed under the HUD.
- Not modified: the entity, ability, change-line, status and Impact components, and the filters (they need no change).

### Measured (headless msedge, 26.19)
| width | bar (top–bottom) | heading lands at | x-overflow |
|---|---|---|---|
| 1280 | 62–98 | 110 | 0 |
| 375 | 54–90 | 102 | 0 |
| 320 | 54–90 | 102 | 0 |

The bar is hidden at the top of the page and shown after jumping to Champions. Champions and Nerfs are highlighted correctly when active. The probe found no page errors; the only console errors were `ERR_FAILED` from the deliberately blocked Supabase calls.

At 375px the strip is 248px wide but its content is 387px, so it scrolls. At 768px and above everything fits.

### Remaining
1. Write unit tests for `sr-navigation.ts` and page tests covering spec items 1–15. Stub `getBoundingClientRect` on the sentinel and holder, then dispatch scroll; use role queries for hidden/shown. Check the Items link, the Systems link, the Top href, filter removal (no broken anchors), and Catch Up (no nav, scroll-padding cleared).
2. Run the existing PatchReports, PH3 and PH4-A suites plus tsc (main baseline is 6 errors).
3. Run the full browser cert at 1280/768/375/320: top → Champions → Nerfs → Vi → Items → Systems → top. Check Back through each step, a cold deep link (`#…vi__g-base-stats__c-attack-damage`), duplicate IDs, the focus ring, and that the strip follows the active link to Items/Systems at 375. Then take screenshots.
4. Confirm whether a native fragment click updates React Router's location in the browser (popstate). If it does, the hash effect re-applies `scrollIntoView`, which honours the same padding.
5. Squash the WIP commit and finish this handoff.
