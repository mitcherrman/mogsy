# Interaction Mode Prototype Labs — Rangefinder + Glyph Press / Word Puzzle

Status: **BLOCKED (both candidates) — source not recoverable from any pushed ref.**
NOT certified, NOT release-ready, no lab built. Base
`7be45341e59bc047c69b95ff95e8c331a202c893` (frontend), backend
`League_Combat_Simulator@f12a7432d1e9a613e0eaee0c3e6e1151a395834e`.

Owner brief (unchanged): fast admin-only visual playtests; bot/versus and
speed/scoring balance deferred; no public exposure, no invented game data, no
fabricated correctness, no shared Ranked Arena redesign; draft PR + browser
evidence before command-center merge.

## 1. Verdicts

| Candidate | Verdict | Why |
|---|---|---|
| Rangefinder (GM-R1, "PLACE a target on a field", `{ stop }` transport) | **BLOCKED** | No source on any branch/tag of either repo; transport not in production `SegmentChoice`; no backend module. |
| Glyph Press / Word Puzzle | **BLOCKED** | No source, no handoff, no backend module, no content set anywhere. Nothing to inspect for answer leak / input validation / grading. |

Neither was downgraded to PROTOTYPE-ONLY by writing a fresh lab: both mechanics
already exist in an unpushed worktree (see §2), and re-deriving them from a
one-line description would fork the owner's design and, for Glyph Press, require
inventing the word content and its answer key — both explicitly out of bounds.

## 2. Discovery evidence (2026-10-14)

Searched all 212 `mitcherrman/mogsy` and 171 `mitcherrman/league_combat_simulator`
remote branches, tags, full history (`git log --all -S/-G`, commit messages),
file trees of every branch, and GitHub PR search, for
`rangefinder | range finder | GM-R1 | glyph press | glyphpress | word puzzle`.

Only hits (mogsy), all *references*, never source:

- `16592c20` `PRO_PLAY_ASSEMBLY_PAV1_HANDOFF.md` (branch `reconstruct/r3c-frontend`):
  - §2 grammar table: `Rangefinder | PLACE a target on a field | discrete labelled slots, not a geometry`
  - §3: "`{ assignment }` is a new transport shape for the production seam to widen
    (as Rangefinder did with `{ stop }`)"
  - §9 file list: `useStageRoom.ts` "ported from Rangefinder (GM-R1), unchanged";
    Viewport "mounts the primitive (Rangefinder's pattern)"
  - §9: "Untouched: Rangefinder, Glyph Press, Scrub, …, the PA1 worktree."
- this handoff (`ce5182f8`).

Negative evidence:

- `src/lib/ranked-public/client.ts:555` `SegmentChoice` on base has
  `itemId | cardId | selected | order | placement | assignments` — **no `{ stop }`**.
  The Rangefinder seam widening was never pushed.
- `League_Combat_Simulator/ranked_modules/` has `item_cost_duel, mastery_slice,
  mastery_state_slice, match, meta_reflex, order_forge, quiz, reconstruct` —
  **no rangefinder or glyph/word module**, no grader, no content table.
- No `src/components/interaction-grammar/Rangefinder*`, `GlyphPress*`, no
  `src/pages/dev/*rangefinder*` / `*glyph*` on any ref.
- No open/closed PR in either repo mentions either name.
- Container has no extra worktrees, stashes or local refs.

Conclusion: GM-R1 Rangefinder and Glyph Press live only in a local worktree on
the owner's machine (the same place PAV1 ported `useStageRoom.ts` from).

## 3. What unblocks each

### Rangefinder
1. Owner pushes the GM-R1 worktree branch (frontend; and backend if one exists)
   with its handoff, or names the commit/worktree path.
2. Then, in order: verify primitive + lab compile on current base; confirm the
   `{ stop }` `SegmentChoice` branch and whether a server grader exists.
3. If no backend grader: ship as **PROTOTYPE-ONLY** admin lab, banner
   "Visual lab — not authoritatively graded", DEV/admin-gated route only.
4. Authoritative range/position grading needs a **separately scoped backend
   branch** (`ranked_modules/rangefinder.py` + public/reveal contract split +
   server capture fixture), proposed with evidence, not bundled here.
   Domain semantics still to be settled by the owner: what the "field" and
   "slots" are, which source table is the range/position authority, and
   tolerance rules (PAV1 says discrete labelled slots, not geometry).

### Glyph Press / Word Puzzle
1. Owner pushes the worktree (or confirms it was never built — then this is a
   new-module design task, not a playtest).
2. Required before "WORKING ADMIN PLAYTEST": public payload carries no answer
   (letters/tiles only, no solution, no hash of a short solution); input
   validated client- and server-side (charset, length, rate); server-side grading
   against a content source the owner certifies (no invented word list); reveal
   contract separate from public contract; keyboard + touch + responsive matrix.

## 4. Changed files
- `INTERACTION_MODES_PLAYTEST_HANDOFF.md` (this file). No source, route, backend,
  database, Ranked Arena or other workstream touched.
