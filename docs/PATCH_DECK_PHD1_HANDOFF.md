# PHD1 — Patch Hub Cinematic Deck View (prototype, local only)

Branch `patchhub/phd1-cinematic-deck`, worktree `C:\Users\mlmit\mogzy-wt\phd1`. **Not pushed, not merged, not deployed, not linked from the Patch Hub.**

| | |
|---|---|
| Source | `origin/main` = `bdf4bbf1d65cd387801c9477118f1616fb4d6a5e` (fetched 2026-10-10; matched the brief) |
| Final SHA | the commit that adds this file (`git rev-parse patchhub/phd1-cinematic-deck`) |
| Preview | `http://127.0.0.1:5252/dev/patch-deck` (Vite in the worktree, `node node_modules/vite/bin/vite.js --port 5252 --strictPort --host 127.0.0.1`) |
| Deep links | `?patch=26.20&card=<report entity anchor>&face=overview|changes|impact|history|explore` |

## 1. Objective

A second presentation of the same Patch Report the List View shows: a cinematic, sequential deck of cards (one per report entity, Summoner's Rift first) with internal views per champion card, on real Patch Report data, as an isolated `/dev` surface. List View, Catch Up and every PHSR-owned component are untouched.

## 2. Creative direction

**One continuous surface per card, not a boxed layout.** The champion's splash art bleeds in from the left and dissolves, through a horizontal luminance mask, into the information panel on the right. The name is set in Cinzel on the art's foot like a poster title; the direction (Buff / Nerf / Adjustment, exactly as the backend classifies it, with its source on hover) sits under it as a thin rule of coloured light, never a badge. The card's editorial direction is used as *light* (a low radial glow rising from the art) rather than as fill or border.

**Obsidian and gilt.** A deep blue-black ground, warm ivory type in three strengths, and the Patch Hub's existing gold reserved for Riot's new values and the single accent (tab ink, the current tick, the level dial). Direction tints (verdant / crimson / ice) appear only as that light and as the rail's ticks. No cyan glow, no glass panels, no badges.

**The deck as a strip of light.** The stage shows one card; its neighbours lean in as dimmed, staggered portrait slivers (loading art) at the edges, each a prev/next control that tells you who is waiting. Under the stage a chapter rail lays the whole patch out as Riot's sections, width proportional to card count, one tick per card tinted by Riot's bucket, the current tick tall and gold. The cover card makes the metaphor literal once: three champions fanned like a hand of cards beside the patch number.

**Two axes, never confused.** Between cards: arrows, slivers, rail, `←`/`→`, Home/End, swipe on the art only. Within a card: an ARIA tablist of five faces (`[`/`]` as a shortcut); arrow keys inside the tablist move faces and never cards. Content below the art scrolls vertically and never changes cards.

**Three compositions, one system.** Champions (and runes, and mode champions) get the cinematic art card; items sit on a plinth of concentric rings built around the only art Riot publishes (a 64 px icon), with changes alongside; prose sections (Classic — General, Private Replays, Ranked 5s) read as a two-column chapter sheet with every line in Riot's order. Mode cards keep the composition with desaturated art and the mode named in the kicker.

**Phone.** The same card stacks: portrait loading art (composed around the character, so faces survive the crop), the title on its foot, then faces and content in document flow. Verified at 375 and 320 with no horizontal document overflow.

## 3. Faces of a champion card

| Face | What it shows | Source |
|---|---|---|
| Overview | Riot's rationale as a pull quote; the touched abilities as an art rail; the first three exact `before → after` values; a Mogzy Impact tile (parameter facts and a level‑18 projection when the card alone proves one, else a designed "not projected" state); the entity's Mogzy status and the patch's recorded data status; where the direction claim comes from | `report-structure`, PH2 `analyzeImmediate` (zero network), `summarizeReconciliation` |
| Riot changes | Ability by ability, Riot's exact notation, New badges, per-line Mogzy status with the PHSR1 vocabulary and the "what Mogzy held at build" note; Historical Context when the backend analysed one | same structure node as List View; `HistoricalContext` reused |
| Mogzy Impact | For each Champions › Base Stats line: Riot's line, parameter facts, and when projected a level dial (before/after readout, scrubber, 1/6/11/18 + crossover ticks) over the PH4-B graph; provenance of every input; every unavailable reason in plain English | `usePatchImpactLoader`; evidence requested only when this face opens |
| Patch history | The backend's analysed historical context on current lines, then the entity's own entries in earlier published reports (newest first, with Riot's rationale and values), each linking to that patch's List View anchor; honest empty/loading/failed states naming the archive window | earlier reports via the shared `["patch-report", v]` cache keys, fetched only when this face opens |
| Explore | Combat Lab (PH4-C contract), champion docs, this entry in List View, copy link to the card, the same entity's other cards in this patch (K'Sante → ARAM: Mayhem), Riot's notes, the patch's Mogzy data status | existing contracts |

## 4. Data integrity decisions

- Deck order comes from `buildPatchReportStructure`: Riot's main-game sections first in Riot's order, then every other official section in Riot's order; inside a classified section the cards follow Riot's buckets (Buffs → Nerfs → Adjustments → Other). Nothing is merged, dropped or re-ranked within a section; the 26.20 deck is cover + 41 cards for 41 report cards.
- Direction is only ever the backend's claim with its source. **K'Sante 26.20 renders as "Buff — Riot's patch text", as published**; no frontend workaround. The known re-promotion is a backend matter.
- Impact never fetches on render or on card change; the Impact face opening is the request. Lucian 26.20 projects from Riot's compound line with zero evidence requests; Swain/Cassiopeia/Ashe request canonical evidence once, on opening.
- `PUBLISHED_NOT_RECONCILED` (26.20) is stated on the cover, in Overview's footer and in Explore in the PHSR1 words; build-time line statuses say what Mogzy held when the report was built.
- Art: champion splash/loading/icon only from the asset manifest, keyed by `mogzy_entity_ref` for SR champions and by the backend's own `mogzy_image_path` folder for mode entities; items and prose cards keep the report's image; a missing or failed image shows a lettered void, never a broken image. All 16 champions in 26.20 and every mode champion (Bard, Garen, K'Sante, Lee Sin, Swain, Thresh, Bel'Veth, Locke) resolve.
- History only reads the archive the Patch Hub lists (26.10 onward); an SR champion matches only SR champion cards, never its own Arena/Mayhem cards.
- No win rates, no power language, no fabricated history, no invented focal points.

## 5. Files

New (all under PHD1 ownership):

- `src/lib/patch-deck/route.ts` — URL state (`patch`, `card`, `face`).
- `src/lib/patch-deck/deck.ts` — deck model over the report structure; reading helpers (touched groups, headline changes, impact lines, related cards, chapter summary).
- `src/lib/patch-deck/art.ts` — manifest-backed art resolution.
- `src/lib/patch-deck/history.ts` — earlier-report matching.
- `src/lib/patch-deck/fixtures/report-26.20.json` — the production 26.20 report, frozen 2026-10-10 (read-only capture).
- `src/components/patch-deck/` — `PatchDeck` (stage, slivers, rail, keyboard, swipe, transitions), `EntityCard`, `ItemCard`, `SystemCard`, `CoverCard`, `DeckRail`, `FaceTabs`, `DeckArt`, `shared.tsx`, `editorial.ts`, `use-deck-motion.ts`, `faces/{Overview,Changes,Impact,History,Explore}Face.tsx`, `patch-deck.css` (scoped under `.phd1-deck`).
- `src/pages/dev/patch-deck/PatchDeckPage.tsx` — data loading, URL sync, top bar, loading/empty/error states.
- Tests: `src/lib/patch-deck/*.test.ts` (4 files), `src/pages/dev/patch-deck/PatchDeckPage.test.tsx`.
- `docs/phd1-screenshots/` — initial and refined captures (see §7).

Edited: `src/App.tsx` (+6 lines: lazy import and one `<Route path="/dev/patch-deck">` outside `<Layout />`, next to `/dev/mogzy-entry-v2`). No other existing file is touched; no PHSR6-owned component, `PatchReports.tsx`, Layout, navigation or global stylesheet is modified. Reused read-only: `report-structure`, `sr-navigation`, `mogzy-status`, `patch-impact/*`, `usePatchImpactLoader`, `PatchImpactGraph`, `HistoricalContext`, `passiveArt`, `combatLabHandoffFor`, `patchReportHref`, `sharePatchHubLink`, `useChampionAssets`.

## 6. Verification

- **Unit/page tests: 35 passing** (`vitest run src/lib/patch-deck src/pages/dev/patch-deck`): deck order and buckets on the real 26.20 report, degraded payloads, URL round-trips, art resolution incl. mode folders and fail-closed cases, history matching over the 26.10–26.19 corpus; page-level: cover, arrow-key navigation + URL + live region, deep link to K'Sante changes with the published classification, tablist semantics (arrow keys inside never change the card), Lucian projected with zero evidence requests, Swain evidence requested only on opening Impact, history fetched only on opening, Explore links and related-card jump, rail chapter jump into item and 56-line prose sheet with no duplicate ids, patch selector reset.
- `eslint --max-warnings 0` on every new file: clean. `tsc -p tsconfig.app.json --noEmit`: the same 2 pre-existing errors as a clean `bdf4bbf1` (`OnboardingProfile.tsx`, `identity/connections.ts`), zero new.
- Browser (Chromium pane, live production API, patch 26.20): cover, Diana/Lucian/Swain/Cassiopeia/K'Sante champion cards and all five faces, Hextech Rocketbelt item, Classic — General sheet, Bard ARAM: Mayhem mode card; 1440×900, 375×812 and 320×700; `document.scrollWidth === clientWidth` at 320 and 375; no console errors; keyboard `←`/`→`, `]`, Home/End verified; reduced-motion handled through `useReducedMotion` plus a CSS fallback.
- Not run: the full repo suite, Playwright, WebKit/Safari, a real touch device (swipe thresholds are verified by code and framer's pan semantics only).

## 7. Screenshots (`docs/phd1-screenshots/`)

Initial → refined: `00-initial-cover-1440` (rail labels truncated, status tile clipped) → `11-refined-cover-1440`; `01-initial-diana-overview-1440` / `03-initial-swain-changes-1440` (five tabs overflowing, art crop losing right-set faces) → `10-refined-swain-overview-1440` (short tab words, wider crop, proportional rail), `12-refined-diana-overview-1440`, `13-refined-cassiopeia-impact-1920` (canonical-backed health projection at 1920×1080). Also `02-initial-lucian-impact-1440`, `04-initial-cassiopeia-history-1440` (real 26.18 and 26.13 entries), `05-classic-general-sheet-1440`, `06-initial-item-rocketbelt-1440`, `07-mode-bard-aram-mayhem-1440`; phone: `20-mobile-320-swain-overview`, `21-mobile-375-lucian-impact-dial`, `22-mobile-375-lucian-impact-graph`, `23-mobile-375-swain-changes`.

## 8. Limitations

- **Splash focal points.** A single crop (`object-position: 60% 18%`) frames most splashes well (Diana, Lucian, Cassiopeia, Bard) but champions painted far right (Swain) sit partly under the panel veil on desktop. The manifest has no focal-point data; the phone uses loading art, which is composed around the character.
- **History cost.** The history face reads every earlier report in the archive (10 × ~200 KB for 26.20), lazily and through the shared cache. A backend per-entity history endpoint would make this cheap.
- Item icons are 64 px sources scaled to ~140 px on the plinth; acceptable but soft.
- The cover's right column scrolls at 900 px tall viewports (the CTA is below the fold); the stage height is `clamp(560px, 100dvh − 13.5rem, 840px)`.
- No rune card in the live corpus to look at (26.20 has none); runes take the EntityCard composition by design.
- Share uses the deck URL (`/dev/patch-deck`), which is a dev path until integration.
- The worktree's `node_modules` is a copy (Git Bash `ln -s` copies on Windows); irrelevant to the branch.

## 9. Recommended next steps before production integration

1. Decide the List/Deck switch contract (owner decision): the deck's `card` param is already the List View entity anchor, so `?patch=X&card=<anchor>` ↔ `?patch=X#<anchor>` preserves the entity both ways. Reuse `PatchHubViewSwitch`'s pattern with a third link.
2. Move the route under `/lol/patch-reports?view=deck` (or similar) and let `Layout` know it is full-bleed; keep the `.phd1-deck` scope so the shared theme stays untouched.
3. Add a focal-point hint per champion to the asset manifest (or a backend `art_focus`), and consider the loading art for desktop when a splash is right-set.
4. Ask the backend for a per-entity history endpoint; keep the current archive scan as the fallback.
5. A real-device swipe pass (iOS Safari, Android Chrome) and a WebKit run of the page test.
6. Re-promote K'Sante 26.20 on the backend; the deck will show the corrected classification with no frontend change.
