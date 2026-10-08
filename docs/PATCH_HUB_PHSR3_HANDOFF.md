# PHSR3 — Summoner's Rift navigation (handoff)

Branch `patchhub/phsr3-sr-navigation`, worktree `C:\Users\mlmit\mogzy-wt\phsr3`.
Status: **complete and certified, ready for combined integration. Not pushed, merged or deployed.**

## 1. Base SHA
`d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` (origin/main re-verified at the start of this pass: unchanged).

## 2. Final SHA
Recorded by the final commit of this branch (`git rev-parse patchhub/phsr3-sr-navigation`). Commits after the
WIP `a0e46cb4`: one completion commit (hardening + tests + this handoff).

## 3. Files changed vs base
Production (5, unchanged set from the WIP):
- `src/components/patch-reports/PatchHubStickyNav.tsx` (new; hardened this pass)
- `src/lib/patch-reports/sr-navigation.ts` (new, pure helpers; unchanged this pass)
- `src/components/patch-reports/PatchHubMasthead.tsx` (`id="patch-hub"`, `scroll-mt-24`)
- `src/pages/lol/PatchReports.tsx` (mounts the navigator; `scroll-mt-24` on the status-notice anchors)
- `docs/PATCH_HUB_PHSR3_HANDOFF.md`

Tests (4 new, no existing test touched):
- `src/lib/patch-reports/sr-navigation.test.ts` (28)
- `src/lib/patch-reports/sr-test-fixtures.ts` (shared SR fixture: champions in all three directions, Items, Runes, Systems, Arena, ARAM: Mayhem)
- `src/components/patch-reports/PatchHubStickyNav.test.tsx` (31)
- `src/pages/lol/PatchReports.phsr3.test.tsx` (27)

Not modified: PH4-A landing logic, PH3 Catch Up, entity/ability/change components, filters, Impact.

### Changes made to the WIP in this pass (real defects found by browser cert)
1. **Active-section probe was transform-dependent.** It was taken from the strip's own rect, which slides in with a
   `translate-y`; after Back from a hidden state a freshly landed heading (12px under the strip) could miss the probe
   by a pixel and leave nothing active until the next scroll. The probe is now `holder.top + 36 (strip height) + 24`,
   independent of the animation, with 12px of slack over the landing position.
2. **Touch/click targets were 16px tall.** Links now have a 24px hit area (WCAG 2.5.8), still inside the 36px strip,
   and the focus ring still has room. Gaps retuned so the strip is about the same width as before.
3. **Right edge fade covered the last destination** at the end of the strip (below 640px). The strip now has
   `max-sm:pr-6` so the last link scrolls clear of the 20px fade.
4. **Keyboard focus left a partly visible link under the fade** (Chrome does not scroll a partly visible focused
   link). Focus now calls the same `revealInStrip` helper the active-follow uses (scrolls the strip only, never the page).

## 4. Sticky activation contract
The navigator renders a static sentinel plus a zero-height `sticky` holder directly after the full section nav. The
holder sticks at `top: calc(var(--app-header-h) + 0.375rem)`. `isCondensedNavStuck(sentinelTop, holderTop)` is true
when the holder is at least 1px below the sentinel, i.e. only after the in-flow nav has scrolled away. While hidden
the strip is `visibility:hidden` (out of the accessibility tree and tab order) with `data-state="hidden"`. Measured
on scroll/resize via one coalesced `requestAnimationFrame`; also measured on mount (a restored scroll position
shows it immediately). It renders nothing at all (no sentinel, no scroll padding) when filtering leaves no SR section.

## 5. SR destination contract
`26.19 | Champions | Buffs n | Nerfs n | Adjustments n | Items | Runes (when present) | Systems | ↑ Top`, in official
section order, built from the filtered structure (`buildSrNavGroups`). Main-game sections are matched by title slug
(`champions`, `items`, `runes`, `systems`, `game-systems`). Champion buckets only (Items' own "Adjustments" bucket is
deliberately omitted). A null-direction champion appears as "Other". Arena, Classic, ARAM: Mayhem and one-off sections
(Team Voice…) stay in the full nav only. Top = `#patch-hub` (the masthead). All links are native fragment links.
Real 26.19 renders: Champions, Buffs 7, Nerfs 8, Adjustments 2, Items, Systems (26.19 has no Runes section; Runes is
covered by unit/component/page tests with a synthetic fixture).

## 6. Mobile horizontal-scroll decision
No destination is dropped. Below 640px the strip scrolls horizontally (hidden scrollbar, right-edge fade, 24px
scroll-padding and right padding so the last link clears the fade); at 768px and up everything fits. Measured:
375px strip 246px wide / 391px content; 320px strip 191px / 391px; 768px 586/586 (fits). The page itself never
overflows horizontally (0 at every width/step).

## 7. Active-section logic
`activeSrAnchor(groups, boxes, probe)`: the deepest destination box (bucket over its section) spanning the probe
line (half-open `top <= probe < bottom`); null outside the main-game sections (e.g. in Arena after Systems), so a mode
section never lights up Systems. Marked with `aria-current="location"`. The strip follows the active link
(`revealInStrip`, margin 24px, scrolls the strip only). Recomputed on scroll/resize only (see limitations).

## 8. Report-only scroll offset
Report anchors carry `scroll-mt-24`. While the navigator is mounted, `html` gets
`scroll-padding-top: max(0px, calc(var(--app-header-h) + 3.375rem - 6rem))` (14px at sm+, 6px on mobile), restoring
the previous inline value on unmount or when filtering removes all destinations. Result: landed headings sit at
**110px (≥768) / 102px (375, 320)**, 12px below the strip's bottom edge (98 / 90). Catch Up never mounts the navigator,
so it never gets the padding (`scroll-padding-top: auto` verified in the browser). Also fixed in passing: the
Mogzy-data status notice anchor now lands below fixed chrome.

## 9. Hash / history behaviour
Native fragment links; no router code was added. Verified in a real browser: a native fragment click fires a popstate
that React Router receives (the hash effect's `scrollIntoView` ran for the clicked id on every Buffs/Nerfs/Adjustments/
Items/Systems click and for a scripted in-page hash change to Vi), the URL hash is exact, and the PH4-A re-apply
lands on the same offset. Sequence top → Champions → Buffs → Nerfs → Adjustments → Vi → Items → Systems → Top then
browser Back eight times: hash, scroll, heading landing, strip state and active destination were correct at every step
at all four widths; the original URL (no hash) with the strip hidden is restored; Forward works; `history.length`
unchanged by Back; zero extra report requests.

## 10. Catch Up preservation
Real browser, all four widths: entering Catch Up from a scrolled report removes the strip and its sentinel and leaves
`scroll-padding-top: auto`; baseline change, scrolled Catch Up, shared `?since=26.14#cu-…` cold deep link (lands, no
strip, no padding), and switching back to Patch Report (strip and padding return) all behave. Page tests assert the
same for Report↔Catch Up, Back/Forward, baseline change and a `#cu-` deep link.

## 11. Filter behaviour
The strip is derived from the filtered structure: search "Vi" → Champions, Adjustments 1, Top; type=item → Items, Top;
type=champion → Champions + the three buckets; every status filter keeps every sticky link resolving to an element;
no matches → no strip, no sentinel, no padding; clearing restores all. Browser and page tests assert every sticky
href resolves.

## 12. Tests (new: 86)
- `sr-navigation.test.ts` 28, `PatchHubStickyNav.test.tsx` 31, `PatchReports.phsr3.test.tsx` 27 — all pass.
- Component tests stub geometry and the frame clock (no scroll-call-count assertions): hide/show, coalescing, resize,
  mount-restored, destinations, filters, active tracking, strip follow (right/left/fits/hidden/keyboard focus),
  scroll-padding set/restore/release, listener and pending-frame cleanup on unmount.
- Mutation-checked: removing the padding restore, the listener removal, the no-destination gate or the stuck
  predicate each makes tests fail (10 / 4 / 3 / 5).
- Regression, focused (`src/pages/lol/PatchReports*`, `components/patch-reports|patch-catchup|patch-impact|patch-hub-combat-lab`,
  `lib/patch-*`, `hooks/usePatch*`; `--maxWorkers=4`): **44 files, 886 tests, all pass.** Plus
  `usePatchBriefFeed.test.tsx` 5/5 (the only other file referencing the masthead/page).
- **Timing note:** one earlier run, executed while the dev server and a Playwright sweep were running, timed out 9 (then 2)
  tests in `PatchReports.catchup.test.tsx` (5s default timeout, 36s file). With the dev server stopped that file passed
  3/3 on this branch and 2/2 on a clean base checkout. Pre-existing timing sensitivity, not a PHSR3 regression; do not
  run the Catch Up page suite concurrently with a sweep.
- ESLint `--max-warnings 0` on all changed/new TS/TSX: clean.

## 13. Browser matrix (headless msedge via Playwright; Supabase blocked; real 26.19 production data)
Script and raw results (git-excluded): `.claude/phsr3-cert/` (`cert.cjs`, `lib.cjs`, `results/*.json|log`, `results/shots/`).
Needs a dev server on :5373 (add a launch entry back if re-running).

| width | checks | strip (top–bottom) | heading landing | page x-overflow | dup ids | page errors | console errors other than blocked Supabase |
|---|---|---|---|---|---|---|---|
| 1280×900 | 99/99 | 62–98 | 110 | 0 | 0 | 0 | 0 |
| 768×1024 | 99/99 | 62–98 | 110 | 0 | 0 | 0 | 0 |
| 375×812 | 105/105 | 54–90 | 102 | 0 | 0 | 0 | 0 |
| 320×640 | 105/105 | 54–90 | 102 | 0 | 0 | 0 | 0 |

Each width: top (strip hidden) → full-nav Champions → Buffs → Nerfs → Adjustments → Vi (hash) → Items → Systems → Top,
then Back ×8 + Forward; cold deep links (exact Vi attack-damage line, group fallback, entity fallback, URL untouched);
cached in-page deep links to Draven and a Draven line (0 report requests); search "Vi", type and status filters;
Catch Up switch/Back/deep link; keyboard walk (Tab order Champions → Buffs → Nerfs → Adjustments → Items → Systems →
Top, ring visible and unclipped on every link, every focused link fully clear of the fade, Enter on Items lands
cleanly); link boxes 24px tall; at 375/320 each clicked destination was clear of the right fade and the last
destination (Systems) clears it at the strip's end. The only console errors are `ERR_FAILED` from the blocked Supabase
requests (about 178 per run).

## 14. TypeScript differential
`npx.cmd tsc -p tsconfig.app.json --noEmit` on a clean detached checkout of exact `d528bf9f`
(`C:\Users\mlmit\mogzy-wt\phsr3-base`, removable) vs this branch: **2 errors on both, line-for-line identical**
(`src/components/onboarding/OnboardingProfile.tsx(180,48)`, `src/lib/identity/connections.ts(263,13)`). PHSR3 adds 0.
(The earlier "6 errors" baseline in the WIP notes does not hold at this SHA.)

## 15. Known limitations
- **Keyboard reach while shown.** The strip precedes the content in DOM order (it follows the full nav), so Shift+Tab from
  Champions content walks back through Team Voice to the top, which hides the strip. It is fully operable once focus is
  on it (verified), and the full section nav remains the keyboard route. Not worth reordering the DOM for a sticky.
- Active highlight is recomputed on scroll/resize only; a pure layout shift without scrolling (late image load) can leave
  it stale until the next scroll. Never observed in cert.
- Below 640px the strip's left edge is a hard clip when scrolled (fade is right-only).
- 24px targets meet WCAG 2.5.8 but not the 44px touch ideal; deliberate to keep the strip restrained.
- Runes: no 26.19 section, so not browser-verified (unit/component/page tested). Chromium only; no Safari/WebKit pass;
  touch was emulated with `hasTouch` and mouse-dispatched clicks.
- jsdom cannot test geometry or native fragment/Back behaviour; those are certified only by the browser script above.

## 16. Integration instructions
1. Branch is based on `d528bf9f` and contains only the files in §3. Merge or rebase onto the integration base; no
   migrations, backend, env or config changes.
2. After merge run: `npx vitest run src/pages/lol/PatchReports src/components/patch-reports src/lib/patch-reports`.
3. Frontend deploy only (Lovable publish); no ordering constraint with any backend.
4. Rollback = revert the commit; nothing persists (the scroll padding is removed on unmount).

## 17. Overlap warning (PHSR1 / PHSR2 / PHSR4)
- `src/pages/lol/PatchReports.tsx`: PHSR3 adds one import, one `<PatchHubStickyNav>` line after `PatchHubSectionNav`
  and `scroll-mt-24` on the two `RECON_ANCHOR` divs. PHSR1 (consumer status) and PHSR2 (Impact discovery) also edit this
  page: expect trivial textual conflicts around those lines, resolve by keeping both.
- `PatchHubMasthead.tsx`: PHSR3 only adds `id` + `scroll-mt-24` to the `<header>`; any PHSR1/PHSR4 masthead restyle must
  keep `id="patch-hub"` (Top link and the spec contract depend on it).
- PHSR4 card polish: the navigator measures `getElementById` of section/bucket anchors and relies on `scroll-mt-24`
  on report anchors plus the html scroll padding. If PHSR4 changes section/bucket anchor ids, header heights or the
  `scroll-mt` values, re-run the cert (heading landing must stay ≥ strip bottom). Do not change entity/section ids.
- Any change to `--app-header-h` or the fixed HUD height changes the landing offsets (formula in §8).
