# PHSR4 — Summoner's Rift champion-card visual polish (CERTIFIED, local only)

Branch `patchhub/phsr4-card-polish`. **Not pushed, not merged, not deployed.**

| | |
|---|---|
| Verified base | `origin/main` = `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` (fetched 2026-10-07; unchanged) |
| WIP commit | `e6330785` (visual changes) |
| Certified code SHA | `096c0480` (tests + passive-art helper). The branch tip is this commit plus the one handoff-only commit above it; `git log` shows both. |

## Final files changed vs base (10)
Production (5): `CombatLabHandoffLink.tsx`, `PatchReportEntityHeader.tsx`, `PatchReportEntityCard.tsx`, `PatchReportAbilityGroup.tsx`, `passiveArt.ts` (new helper).
Tests (4): `CombatLabHandoffLink.test.tsx` (new), `PatchReportEntityCard.phsr4.test.tsx` (new), `PatchReportEntityCard.test.tsx` (fixture fix), `src/pages/lol/PatchReports.phsr4.test.tsx` (new; a sibling of the `ph4a`/`ph4c` page tests, **not** an edit to `PatchReports.tsx`).
Doc (1): this file.
No file owned by another PHSR/PH workstream is touched (`PatchReports.tsx`, `PatchHubMasthead`, `PatchHubSectionNav`, `PatchReportChangeLine`, `PatchReportStatus`, `PatchDataStatusNotice`, `patch-impact/**`, `lib/patch-reports/**`).

## Final visual hierarchy decisions
1. **Identity leads.** Portrait, then name + share icon + direction chip, then count/status. Nothing competes with it.
2. **Combat Lab is a quiet secondary action**: flask + "Combat Lab", muted text, no border, no gold. The accessible name and text content remain the full "Open {Champion} in Combat Lab"; the lead-in is `sr-only` (label-in-name satisfied). `href` is unchanged. Gold keeps a single role here: the keyboard focus ring.
3. **Header layout**: grid. Desktop: actions top-right (col 3, row 1). Phone: a compact row under the identity text, portrait spanning both rows, so the action never takes a full-width row and never pushes Riot's text down. The wrapper (`data-testid="patch-report-entity-actions"`) exists only when the slot returns something.
4. **One quiet card edge**: `border-border/45`, no shadow. Ability groups are separated by inset faint neutral hairlines, not full-bleed cyan rules. Ability icon frames are neutral. **Gold is reserved for meaningful League information** (new values, slot lettering/kicker).
5. Riot commentary stays directly under the header and above every ability change.

## Passive art
- Authority/source: `getAbilityIconUrl(ref, "P")` from `src/lib/combat-lab/abilityIcons.ts`, the same stored `assets/champions/<folder>/passive.png` Combat Lab and Journey use (table `src/data/championAbilityIcons.ts`). Implemented in `passiveArt.ts` (`storedPassiveIconUrl`). No new artwork, no new mapping, no per-champion code.
- Applies only to a **P-slot group** on a **Champions-section champion card** (`isChampionsSectionChampionCard`) with a non-empty `mogzy_entity_ref`, **and** only when the backend published no icon. Keyed by catalog ref, never guessed from the display name.
- **Fallback contract** (all tested): backend icon wins; else stored art if resolvable; if the image errors at runtime → the `P` glyph tile; no catalog ref / not in the art table / Arena, item or system card → `P` glyph. Castable abilities (Q/W/E/R) are unchanged (backend URL or slot glyph, never stored art).
- Verified earlier: all 27 champions with passive changes in 26.10–26.19 have stored passive art. Re-verified this pass: Vi and Elise passive art loads (64×64) in the browser.

## The failing test: diagnosis confirmed
`PatchReportEntityCard.test.tsx` "slot glyph when no icon exists" used `jayceCard` (Champions section, ref `Jayce`, present in the art table), so its passive now correctly resolved stored art and never reached the fallback. Production behaviour was right; the fixture was stale. Fix: the test now renders the same card with `mogzy_entity_ref: null`, so the fallback path is genuinely exercised; **no assertion was weakened or removed**. The runtime-error fallback and Arena/unmapped fallbacks are additionally covered in the new file.

## Tests
New: **32** (CombatLabHandoffLink 6, card-level 21, page-level real-corpus 5). Updated: 1 fixture.
Coverage of the 14 requested contracts: 1 one-action-per-champion, 2 URL unchanged, 3 accessible name, 4 share kept (and not in the actions cluster), 5 no empty wrapper (null ref, item, Arena system, SR champion outside Champions), 6 wrap structure (grid, `col-start`, `flex-wrap`, no `w-full`, portrait row-span), 7 entity heading levels (h2/h3/h4 → ability one below), 8 commentary position, 9 ability heading hierarchy + labelled groups, 10 long formulas (full text, no `nowrap`/`truncate` up to the card, `overflow-wrap:anywhere`), 11–13 passive art / fallback / non-passive, 14 no champion name, `assets/champions`, `passive.png` or `.png` literal in any Patch Report component source (scanned via `import.meta.glob ?raw`, all 174 table names).
Page-level (real corpus 26.19): Vi/Elise passive art, one action + share + change counts on the six reviewed cards, Aphelios 5 groups, every card's wrapper-iff-handoff / heading level / commentary order, no duplicate IDs.
Mutation-checked: disabling passive art, always rendering the wrapper, a hardcoded champion string, and a drifting aria-label each fail the intended tests (then restored).
Layout facts that jsdom cannot measure (overflow, clipping, touch size) are certified in the browser, below.

## Regression (bounded to 3 workers, three batches, no full-repo run)
- Pages (`src/pages/lol/PatchReports*`): 7 files, **83** tests, 51 s (includes PH4-A report+catch-up, PH4-C, history-integration, catch-up).
- Components + hooks (patch-catchup, patch-hub-combat-lab, patch-hub-share, patch-impact, patch-reports, usePatchCatchUpLoader, usePatchHubShare, usePatchImpactLoader): 17 files, **291** tests, 11 s.
- Libs (combat-lab, patch-catchup, patch-catchup-loader, patch-hub-combat-lab, patch-hub-share, patch-impact, patch-impact-loader, patch-reports): 37 files, **929** tests, 14 s.
- Total **61 files, 1,303 tests, 0 failures.**

## ESLint / TypeScript
- `eslint --max-warnings 0` on all 8 changed/added TS/TSX files: **clean**. (It caught a real `react-refresh/only-export-components` warning from exporting the helper out of a component file; fixed by moving it to `passiveArt.ts`.)
- `tsc -p tsconfig.app.json --noEmit`: PHSR4 and a clean checkout of exactly `d528bf9f` produce the **identical** 2 errors (`OnboardingProfile.tsx(180,48)` and `identity/connections.ts(263,13)`, both TS2345 Supabase typing). **Zero new.** (The historical 6-error baseline was not assumed.)

## Browser certification (dev server on live data, patch 26.19; Aatrox, Aphelios, Aurora, Draven, Elise, Vi)
| | 1280 | 375 | 320 |
|---|---|---|---|
| horizontal page overflow | none (1265/1265) | none (375/375) | none (320/320) |
| clipped descendants in any card | 0 | 0 | 0 |
| Combat Lab vs title / share overlap | none | none | none |
| Combat Lab size / inside card | 107×40, yes | 107×40, yes | 107×40, yes |
| share target | 40×40 | 40×40 | n/a (same classes) |
| header height | 96 | 135 (baseline was 145) | 135–161 |
| Riot commentary above changes | yes | yes | yes |
- Duplicate element IDs: none. Page errors / console errors: none.
- Focus ring: keyboard Tab from the share icon lands on Combat Lab with `:focus-visible` and a 2 px gold ring; tab order share → Combat Lab.
- Visual reads (screenshots): 1280 Vi, Aphelios, Draven, Elise; 375 Vi and Aphelios; 320 Elise. All six cards at all three widths were additionally covered by the measured checks in the table (overflow, clipping, overlap, sizes, ordering). Aphelios long formulas wrap inside their value boxes at 1280/375 with five groups and acceptable density; Draven's Mogzy Impact block sits cleanly in the quieter shell; Elise's Spider Queen and Vi's Blast Shield passive art render with the `P` badge; Vi's "Adjustment (inferred)" chip, Mogzy Impact and Combat Lab/share cluster coexist without collision at 1280/375. Aphelios and Vi at 320 were not eyeballed, only measured.
- `sr-only` spans report `scrollWidth > clientWidth` by design; they are not overflow.
- Limits: headless pane, Chromium only (no WebKit/Safari run); lazy images can show an empty frame for a moment before they load (pre-existing behaviour).

## Temporary baseline cleanup
Removed the `phsr4-base` worktree (clean, detached at `d528bf9f`) after removing its `node_modules` **junction** (a link to the shared primary `node_modules`; `rmdir` on the link only, shared copy and the `phsr4` link verified intact). Removed the `phsr4-base` entry from `.claude/launch.json` (git-ignored, primary checkout; file re-validated as JSON). The `phsr4` entry (the real workstream dev server) and every other worktree/entry were left alone.

## Limitations
- Stored passive art covers champions in `CHAMPION_ABILITY_ICON_FILES` (174); a future champion absent from it shows the `P` glyph until that table is updated (correct fail-closed behaviour).
- Passive art depends on the Combat API asset host; if it is down the `P` glyph appears via the `onError` fallback.
- Not verified on WebKit/Safari or on a real touch device (touch size is verified by measurement only).

## Integration
Merge `patchhub/phsr4-card-polish` onto `origin/main` (base `d528bf9f`). It touches only the five production files above, so it should merge cleanly with PHSR1–3 as long as they stay out of them. **Overlap warning:** `PatchReportEntityHeader.tsx`, `PatchReportEntityCard.tsx` and `PatchReportAbilityGroup.tsx` are PHSR4-owned. If PHSR1/2/3 also edit these (PHSR2 Impact discovery attaches through slots and should not; PHSR3 sticky nav should not), expect a textual conflict in the header JSX. `PatchReports.tsx` is not touched here, so the PH4-A/PH4-C slot wiring is unchanged. After combining, re-run `src/pages/lol/PatchReports.phsr4.test.tsx`, `PatchReports.ph4c.test.tsx` and `src/components/patch-reports`.
