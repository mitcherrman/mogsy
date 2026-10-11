# MATCH GRID — M1 handoff (GM-M1, Fable pass)

> **Status (MG-P3, 2026-10-10): M1 is the approved VISUAL / INTERACTION
> PROTOTYPE and gold standard — not production logic.**
>
> * Its temporary rune authority (frontend `runeData.ts` intersected with the
>   then-34-row backend `runes` table → "33 agreed runes") is **superseded by
>   MG-P1**: the backend `runes` table is now the wiki-certified authority
>   (62 runes; `rune_canonical`), and MG-P2's `match.v1` module deals, freezes
>   and grades every board server-side.
> * The authority intersection, `gradeRuneRound` and the client-side round
>   catalogue are **no longer production logic**. They now live only in the
>   DEV lab (`src/pages/dev/match-grid/labRuneRounds.ts`, quarantined), kept for
>   visual diagnosis.
> * The production path is `ranked-core/modules/matchGridModule.tsx` (MG-P3):
>   it renders exactly the frozen entities/groups P2 sends and shows only the
>   server's reveal. See `MATCH_GRID_P3_HANDOFF.md`.
> * File moves since this note was written: `src/lib/match-grid/runeAuthority.ts`
>   → `src/pages/dev/match-grid/labRuneRounds.ts`.

## Objective

Prove the MATCH cognitive mechanic ("which entities belong together?") as a
flagship Mogzy interaction, discover its premium visual language, and establish
which categorical authorities are production-ready. First family: **rune → rune
tree**. Not a quiz repeated N times: the player builds a relationship map and
locks it; the authority grades afterwards.

## Worktrees / branches

| Repo | Worktree | Branch | Base |
|---|---|---|---|
| mitcherrman/mogsy (frontend) | `mogsy/.worktrees/match-grid-m1` | `match-grid/m1-fable` | `origin/main` = `bdf4bbf1` (verified) |
| mitcherrman/League_Combat_Simulator (backend) | none created | — | `origin/master` = `63847f4f` (verified; read-only audit only) |

No backend branch was needed: the prototype reads the existing public endpoint
`GET /api/meta/runes` and the existing `/assets/runes/*.png`. Nothing pushed,
published or deployed; production data untouched.

## Authoritative content findings (full table: `docs/MATCH_GRID_AUTHORITY_AUDIT.md`)

* **DataDragon is a prohibited source** in the backend (`docs/source_authority.md`). The frontend's `live-esports/runeData.ts` (62 perks) is DataDragon-generated legacy data; the backend's production rune authority is the `runes` table (34 hand-typed rows, unversioned, served by `/api/meta/runes`).
* Scripted cross-check: **33 of 34 backend rows agree with the frontend table on tree and keystone status; 0 disagree; Phase Rush is backend-only and stale.**
* M1 therefore deals only the **agreed roster** (Precision 10 · Domination 6 · Sorcery 6 · Resolve 6 · Inspiration 5) when the backend answers, and says so in the harness chrome. No second authority was created; no facts were hand-copied.
* Champion → roles is many-to-many by the authority's own definition (`primary_role` is informational only). The contract reserves `membership: "many"` for it; M1's primitive **throws** on it rather than falsify a single home. Not prototyped.
* Next exact families: item → wiki type tier (Basic/Epic/Legendary/Boots), champion → resource, ability → champion. Effect/mechanic tags, class tags and the slot manifest are excluded.

## Product decisions

* **Structure: grouping, not pairing.** Sigils (entities) seat onto seals (groups). Many-to-one is the honest shape of rune → tree; the one-to-one "pairing grid" prototype from MIG1.3 (`mig1/3-order-match-lab`, on HOLD) solved itself by elimination.
* **Visual thesis — the relational instrument.** A navy-stone board with engraved orbit guides; five discipline seals (brass rim, engraved glyph, twelve rim ticks that light per seated sigil, Roman index); runes are brass-rimmed sigil discs; each seating draws a **thread** from seal to sigil in the discipline's hue, so the board visibly forms five constellations. Materials ≈70% academy (navy, brass, vellum ledger, Cinzel/Lora/Inter) / 30% hextech (measured guides, a bright core in a stable thread, cyan correction mark).
* **Two compositions, one semantics.** Desktop: *constellation* (seals along a lower band, sigils fan above on fixed ring seats). Phone (≤719px wide): *ledger* (one wire per discipline, seal left, sigils on the wire). Three height tiers: compact (≤719px tall), normal, tall (≥820×1360).
* **Interaction: one action per rune.** Drag starts immediately on mouse (4px slop) and after a 180ms hold on touch (8px slop → scroll instead); drops are forgiving (whole column/row + 24–36px slack, nearest seal wins); tap-then-tap; keyboard **digit 1–K seats the focused sigil**, Enter holds, arrows walk seals, Enter seats, Delete/Backspace returns to the well, Escape drops. No "select first" step.
* **No answer leakage.** `MatchPublic` cannot carry an answer; every seal arms identically while a sigil is held; threads are coloured by *group*, never correctness; `data-mark` exists only once `reveal` exists; the primitive and `board.ts` contain no grader and no domain word (source-contract test).
* **Seats never reflow.** Each (group, seat index) is a fixed point; a freed seat is reused; nothing already placed moves because a neighbour arrived or left.
* **Reveal choreography** (1.5s budget, instant under reduced motion): freeze → marks (stable threads brighten; fractured threads dash and fade; ✓/✕ glyphs) → travel (misplaced sigils lift and cross to their canonical seal; new thread inks in) → ledger (vellum plate takes over the well's footprint: verdict, N of M stable, one card per corrected rune with "→ Tree · Keystone/Minor rune · was in X"; a fully correct board lists each discipline's members) → done (`onRevealComplete` once). The final correct board is the teaching artifact.
* **Response shape** `{ assignments: [{entity, group}] }` is deliberately **not** assignable to `SegmentChoice` (compile-time assertion). The one production seam is the `SegmentChoice` widening + `submitChallenge` body.

## Relevant files (all new unless noted)

| Path | Role |
|---|---|
| `src/lib/match-grid/contract.ts` | Neutral contract: `MatchPublic`, `MatchValue` (entity → {group, seat}), `MatchResponse`, `MatchReveal`, `membership` |
| `src/lib/match-grid/board.ts` (+ `.test.ts`) | Pure seating helpers, forgiving snap, `settleReveal` (description, not grading), **no grader** |
| `src/lib/match-grid/layout.ts` | Reserved geometry: constellation / ledger compositions, tiers, fan seats, well sockets |
| `src/lib/match-grid/reveal.ts` | Reveal clock plan |
| `src/lib/match-grid/runeAuthority.ts` | Rune → tree adapter: reads `runeData.ts`, intersects with `/api/meta/runes`, seeded round catalogue (7 rounds: 3/4/5 groups, uneven, empty seal, dense), **prototype-only** `gradeRuneRound` |
| `src/components/match-grid/MatchGrid.tsx` + `matchGrid.css` (+ `.test.tsx`) | The primitive |
| `src/components/match-grid/RuneTreeGlyph.tsx` | Host-side seal faces for the five trees (decorative) |
| `src/pages/dev/match-grid/MatchGridLab.tsx` | DEV-only harness/host: `/dev/match-grid?round=…&state=open\|complete\|revealed-right\|revealed-wrong&roster=backend\|frontend&motion=reduce` |
| `src/App.tsx`, `src/components/Layout.tsx` (modified) | DEV-gated route + full-bleed |
| `e2e/match-grid-continuity.spec.ts`, `playwright.arena.config.ts` (regex) | Per-frame continuity + capture matrix |
| `docs/MATCH_GRID_AUTHORITY_AUDIT.md` | The audit |

Infrastructure reused: `interaction-grammar/types.ts` (`InteractionPhase`, `SubjectMedia`), `reconstruct.ts::snapToSocket`, `useReducedMotionPreference`, `resolveQuizAssetUrl`, `runeData.ts`, the backend `runes` endpoint and rune art, the DEV route gate pattern, the arena Playwright project.

## Current state

Prototype complete and running in the dev harness. Unit + e2e green (below). Not wired into Ranked (by design — see "What should be productionized").

## Tests / browser evidence

* `npx vitest run src/components/match-grid src/lib/match-grid` — **32 passed** (board helpers 14; primitive 18: direct assignment, tap-tap, keyboard hold/arrows/Enter, immediate mouse drag, forgiving near-miss, touch swipe = scroll, drop-on-well return, reassignment, no duplicate seat, Lock enable/payload/freeze, pre-lock no-leak DOM, source-contract no grader/no domain, staged reveal + single completion, all-correct reveal, reduced motion instant, continuity: one board height + same sigil nodes across phases, ledger inside the well footprint).
* `npx playwright test -c playwright.arena.config.ts match-grid-continuity` (needs a vite on :8123 — on Windows start it via the `.claude/launch.json` entry; the config's `node_modules/.bin/vite` command does not run under cmd) — 13 tests: per-animation-frame sampling of root/head/board/first+last seal/foot/status/lock through open → first seat → reassign → full → Lock → locked → marks → travel → ledger → done → next round, at 1600×900, 1280×720, 1366×650, 1280×600, 390×844, 360×640, normal and reduced motion, **≤1px** budget (the only >1px commit is the next-round board swap, excluded by design), plus a pre-lock style-equality probe (a right and a wrong seat have identical computed styling, thread states all `open`, zero marks, no ledger). **Result: 13 passed**; worst structural movement between consecutive frames 0.00px on every region at every viewport (the first attempt found two real items that are now fixed: the phone status line reflowing by 14px between open and locked, now a reserved two-line box; and edge wing seats clipping at 1600×900, now clamped).
* Captures written by that spec to `C:/Users/mlmit/OneDrive/Desktop/match-grid-m1-shots/` (`<viewport>[-rm]-01-open … 03-full … 04-reveal-f0..f4 (frame series) … 05-settled.png`).
* Hand-driven in the Claude browser pane: drag, tap-tap, column drop, digit seating, Delete, reveal-wrong, reveal-right, phone open/complete/reveal, 1280×600, 1600×900.

## Accessibility

Native buttons; every sigil and seal tabbable with full names ("Electrocute. In Domination", "Domination, rune tree 2 of 5. Holds two: …"); one `role="status"` live region written only on discrete actions and once for the whole reveal (verdict + each correction in words); marks are glyphs (✓ ✕ ➜) plus text, never colour alone; 44px minimum targets (sigils 44–58, seals 54–100, lock 44); brass focus rings; reduced motion honours both the OS query and the app's `reduce-motion` class.

## Limitations

* Grading is a **harness stand-in** (`gradeRuneRound` in the host's closure). Production must grade server-side and send `MatchReveal`; the primitive already cannot grade.
* The production `runes` table knows only 34 runes (33 usable) and carries no revision; it needs a wiki re-source before Ranked exposure. Rune art and the rune ids map still come from DataDragon-era files.
* `membership: "many"` is reserved, not implemented (no champion → roles board).
* Degenerate piles (10+ sigils under one seal) overflow the fixed fan sideways by design; captions truncate to one line in the well and on the wire (full names in the accessible name, status line and ledger).
* Tree seal faces are Academy glyphs, not Riot's 32px tree icons (too small to carry a hero anchor).
* The lab's page chrome is harness-only; the primitive has no arena flanks, opponent line or timer yet.

## What is prototype-only vs. to productionize

Prototype-only: `MatchGridLab.tsx`, `gradeRuneRound`, the client-side round catalogue, `?state=` pre-arrangement.

Productionize (the seam, Reconstruct pattern):
1. Backend `match.v1` module: one eligibility function over the `runes` table (re-sourced), frozen public payload `{prompt, entities[{token,label,media}], groups[{token,label,hue,glyph}], membership}` with positional opaque tokens, private `{canonical, facts, source_revision}`, `validate_challenge_input({assignments})`, grader, `challenge_reveals` body `{assignments, canonical, entity_correct, is_correct, facts, source}`; add `canonical`/`entity_correct` to the forbidden pre-reveal keys.
2. Frontend: widen `SegmentChoice` with `{ assignments }`, map the body in `submitChallenge`; `contracts.ts` block/choice/reveal readers; `modules/matchGridModule.tsx` wrapping `MatchGrid` (phase derivation, draft keyed by segment, inline lock-reveal for bot matches); registry entry; sigil/transcript seams.
3. Move `src/lib/match-grid/contract.ts` types into `interaction-grammar/types.ts` once GM-S1 has landed (a rename, not a redesign).

## Next task

Backend `match.v1` module on a re-sourced, revision-stamped `runes` table (and item → type tier as the second family), then the frontend module wrapper and registry entry, re-running `match-grid-continuity` inside the real `CanonicalArena`.

## Final

Commits on `match-grid/m1-fable`: `257bbe74` (the prototype, adapter, lab, tests, audit) + this handoff note. Baseline note: `src/lib/admin/admin-registry.routes.test.ts` has two failures (Premium Trends / `/admin/knowledge` master-admin) that reproduce on a sibling worktree without these changes; they are pre-existing.
