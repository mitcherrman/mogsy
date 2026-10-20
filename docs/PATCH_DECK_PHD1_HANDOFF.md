# PHD1 — Patch Hub Cinematic Deck View (prototype, local only)

Branch `patchhub/phd1-cinematic-deck`, worktree `C:\Users\mlmit\mogzy-wt\phd1`. **Not pushed, not merged, not deployed, not linked from the Patch Hub.**

| | |
|---|---|
| Source | `origin/main` = `bdf4bbf1d65cd387801c9477118f1616fb4d6a5e` (fetched 2026-10-10; matched the brief) |
| R1 (first prototype) | `967bc0a9` |
| R2 (visual excellence pass) | the commit that adds this revision of the file (`git rev-parse patchhub/phd1-cinematic-deck`) |
| Preview | `http://127.0.0.1:5252/dev/patch-deck` (Vite in the worktree: `node node_modules/vite/bin/vite.js --port 5252 --strictPort --host 127.0.0.1`) |
| Deep links | `?patch=26.20&card=<report entity anchor>&face=overview|changes|impact|history|explore` |

## 1. Objective

A second presentation of the same Patch Report the List View shows: a cinematic, sequential deck of cards (one per report entity, Summoner's Rift first) with internal views per champion card, on real Patch Report data, as an isolated `/dev` surface. List View, Catch Up and every PHSR-owned component are untouched. R2 keeps R1's identity and raises the craft: art direction per champion, a stronger information hierarchy, face-specific compositions, a cover with one obvious way in, a legible navigator, and a designed phone experience.

## 2. The design system (R2)

**Obsidian and gilt, unchanged.** Deep blue-black grounds, warm ivory type in four strengths (`--dk-ink` to `--dk-ink-4`), the Patch Hub's gold reserved for Riot's new values and the one accent (tab ink, current tick, level dial, the primary button). Editorial direction (Buff / Nerf / Adjustment, exactly as the backend classifies it, source on hover) is colour used as *light*: a rule beside the name, a low glow at the art's foot, the rail's ticks. Never a badge, never a fill. One tile style exists (`.dk-tile`), used sparingly and never nested.

**Type.** Cinzel for names and patch numbers; Lora for Riot's own words (pull quotes at 17–19px); Inter for everything else at a 15px base; Space Mono for every number Riot published. Section labels are small caps with a rule to the edge. Riot's new value is the loudest object on any panel: mono, bold, 12% larger than its struck-through predecessor, underscored in dim gold. The arrow now travels with the new value, so a wrap never strands it.

**Composition decided by the artwork** (§3). Panel width follows the face: Overview 50%, Changes 52%, Impact 66%, History 64%, Explore 50%; the art box yields from 78% to 58% on the broad faces and the name shrinks to a corner mark, so the reader always knows whose card it is while the data gets the room.

**Motion.** A card change is a short fade-and-settle on the frame with a parallax inside it: the hero slides 90px, the panel 36px, both at 520ms on one ease. Faces fade up 12px in 220ms with a sprung tab ink. `prefers-reduced-motion` collapses every duration to 1ms (`useReducedMotion` in components, a global CSS override for the rest). No motion is decorative: everything moves because something changed.

## 3. How artwork focal points are handled

- `src/lib/patch-deck/focal.ts` holds **explicit per-champion focal metadata** for 46 champions (every champion in the 26.19 and 26.20 decks, SR and mode), authored by hand on 2026-10-10 from each splash on a 10% grid (contact sheets rendered from the manifest's own `splash/0_default.jpg`). Each entry is the face as a fraction of the 1215×717 image. No runtime guessing; an unknown champion falls back to a centred composition.
- **The focal point chooses the card's side.** A face right of 56% mirrors the card: art on the right, information on the left (`data-side="right"`). Swain (67%), Diana (68%), Cassiopeia (62%), Lucian (74%), Vayne (82%) are mirrored; K'Sante (33%), Neeko (50%), Lillia (46%), Bel'Veth (46%) keep the art on the left. The veil therefore always falls on the scene, never on the subject, and the deck gains a natural left/right rhythm.
- **Within the side, the crop is solved, not eyeballed.** `objectPositionFor` measures the art box (ResizeObserver) and computes `object-position` so the face lands on the side's anchor (36% in from the open edge, 40% down). It clamps rather than zooms: the deck never scales art above `cover`.
- Phones use the portrait loading art, which Riot composes around the character, with a fixed upper-centre crop.
- Verified on Swain, Diana, Cassiopeia, K'Sante, Lucian at 1920, 1440 and 1280 (`docs/phd1-screenshots/r2/`).

## 4. Faces of a champion card

| Face | Composition | Source |
|---|---|---|
| Overview | Riot's rationale as a large pull quote; touched abilities as an art rail; the first three exact values at display size; the Mogzy Impact tile (zero-network facts, level-18 projection when the card alone proves one) or one honest sentence; status footer | `report-structure`, PH2 `analyzeImmediate`, `summarizeReconciliation` |
| Changes | One stanza per ability: 52px art, slot kicker, name; each line with Riot's full notation, per-line Mogzy status note, Historical Context when analysed | same structure node as List View |
| Impact | Broad stage, split: left Riot's line, the before/after readout and parameter facts; right the deck's own SVG level chart (`DeckImpactChart`, drawn from PH4-B's `buildImpactChartModel`, click a level column to select it), the scrubber with 1/6/11/18 + crossover ticks, provenance. Unavailable reasons in plain English | `usePatchImpactLoader`; evidence requested only when this face opens |
| History | Editorial timeline: an archive strip (every listed version, this entity's appearances lit and clickable), then each earlier entry with the patch number in Cinzel, direction, Riot's rationale and values, linking to that patch's List View anchor | earlier reports via shared `["patch-report", v]` keys, fetched only when this face opens |
| Explore | Combat Lab (PH4-C), champion docs, List View anchor, copy link, the same entity's other cards (K'Sante → ARAM: Mayhem), Riot's notes, the patch's data status | existing contracts |

## 5. Cover, navigator, phone

- **Cover.** The fan of three champions is itself the entry control (hover lifts the hand); the patch number leads; a solid gold **Begin with Champions →** sits directly under the stats, above the fold at 1440×900; chapters are a numbered contents list; Mogzy's data status is a one-line headline with its explanation behind a disclosure (truthful, compact).
- **Navigator.** Three readings under the stage: a gold progress hairline notched at chapter boundaries; chapter pills (never truncated, modes after a divider, the current one gold); this chapter's cards as tinted ticks with the current one tall, the card's name and `n / 41` beside them, and explicit previous/next buttons. Slivers at the stage edges show the neighbours' portraits with an arrow badge and brighten with a gold edge on hover.
- **Phone.** Portrait art with the name on its foot; a face bar that sticks under the top bar and carries the champion's icon and name; Impact stacks (chart full width, 300px tall); History's strip scrolls; swipe only on the art; the chapter pills scroll, the ticks and `n / 41` follow. No document overflow at 375 or 320.

## 6. Data integrity

Unchanged from R1 and re-verified: deck order from `buildPatchReportStructure` (SR first, Riot's buckets inside, nothing merged or dropped); direction only as the backend states it (**K'Sante 26.20 still renders "Buff — Riot's patch text"**; the re-promotion is a backend matter); Impact never fetches on render; `PUBLISHED_NOT_RECONCILED` stated in the PHSR1 words; art only from the manifest; history only from the listed archive; no win rates, power language, invented history or invented focal points. The new chart copies PH2's values through PH4-B's pure model and does no stat math.

## 7. Files

R2 adds `src/lib/patch-deck/focal.ts` (+ test) and `src/components/patch-deck/DeckImpactChart.tsx`, and rewrites `patch-deck.css`, `EntityCard`, `DeckArt`, `FaceTabs`, `shared.tsx`, `CoverCard`, `DeckRail`, `PatchDeck` and the five faces. Everything is still under `src/lib/patch-deck`, `src/components/patch-deck`, `src/pages/dev/patch-deck`, plus the six-line route registration in `src/App.tsx`. No PHSR6-owned component, `PatchReports.tsx`, Layout, navigation or global stylesheet is modified; reused read-only: `report-structure`, `sr-navigation`, `mogzy-status`, `patch-impact/*` (incl. `graph/chart-model`), `usePatchImpactLoader`, `HistoricalContext`, `passiveArt`, `combatLabHandoffFor`, `patchReportHref`, `sharePatchHubLink`, `useChampionAssets`.

## 8. Verification

- **Tests: 40 passing** across 6 files (`vitest run src/lib/patch-deck src/pages/dev/patch-deck`): R1's suites plus `focal.test.ts` (coverage of every deck champion, side selection, crop solving incl. clamping and the exact-fit case) and, in the page test, the chart drawing 18 hit columns and a click moving the scrubber to level 8.
- `eslint --max-warnings 0` on every deck file: clean. `tsc -p tsconfig.app.json --noEmit`: the same 2 pre-existing errors as a clean `bdf4bbf1`, zero new.
- **Browser (Playwright Chromium, full resolution, live production API, 26.20)**: cover, Diana / Swain / K'Sante / Cassiopeia / Lucian with all faces, Hextech Rocketbelt, Classic — General at 1920×1080, 1440×900, 1280×800; phone opening state, sticky face bar, Changes, Impact (chart + dial) and History at 375×812 @2x and 320×700 @2x; `scrollWidth === clientWidth` on every capture; zero console errors; chart click, keyboard `←`/`→`/`]`/Home/End, reduced-motion capture. Captures in `docs/phd1-screenshots/r2/`; R1's remain in `docs/phd1-screenshots/` for the before/after.
- Not run: the full repo suite, Playwright e2e configs, WebKit/Safari, a real touch device.

## 9. Remaining issues

1. **Focal coverage is a hand-authored table.** 46 champions today; a champion outside it gets the centred fallback (still correct, just less composed). The right home for this is the asset manifest (`focal: {x, y}` per splash) so every surface can share it.
2. **Impact chart y-axis** follows PH4-B's bounds; for a small change on a large stat (Cassiopeia health −20 on 2296) the two lines nearly coincide, which is honest but visually quiet. The readout and bubble carry the number; a secondary "difference by level" view would be the next step.
3. **History cost** is unchanged: the face reads every earlier report lazily (10 × ~200 KB for 26.20). A per-entity endpoint would make it cheap.
4. **Item art** is a 64 px source scaled to ~150 px on the plinth; soft but acceptable. **Rune cards** have no live example in the corpus.
5. The **cover's status disclosure** collapses the reconciliation body by default; the headline is always visible.
6. **Mobile swipe** is verified through framer's pan semantics and code, not on a real device; the sticky face bar relies on the card being `overflow: visible` on phones (desktop keeps `overflow: hidden` for the rounded frame).
7. Share still points at `/dev/patch-deck`, a dev path until integration.

## 10. Recommended next steps before production integration

1. Owner review of the mirrored composition rule (56% threshold) and the focal table; then move the focal data into the manifest.
2. Decide the List/Deck switch contract: the deck's `card` param is the List View entity anchor, so `?patch=X&card=<anchor>` ↔ `?patch=X#<anchor>` preserves the entity both ways; reuse `PatchHubViewSwitch`'s pattern with a third link.
3. Move the route under `/lol/patch-reports?view=deck` (or similar), let `Layout` treat it as full-bleed, keep the `.phd1-deck` scope.
4. A per-entity history endpoint; keep the archive scan as fallback.
5. Real-device pass (iOS Safari, Android Chrome) and a WebKit run of the page test.
6. Re-promote K'Sante 26.20 on the backend; the deck shows the corrected classification with no frontend change.
