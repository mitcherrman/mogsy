# PPQ2-C — Premium Pro Play Arena presentation

| | |
|---|---|
| Branch | `ppq2c/premium-presentation` (worktree `C:\Users\mlmit\mogzy-wt\ppq2c-presentation`), local, **not pushed** |
| Base | `924f0192` = `ppq2a/integration-main` (origin/main `d6c67abc` + PPQ2-A `75b50b66` + its docs) |
| Scope | Presentation pieces only, in `src/components/pro-play/arena/**`. No route wired, no reveal system, no change to any shared file |
| Status | **STOP for control-center visual review.** The pieces reach the stage only through a narrowly scoped seam the owner must approve (§4) |

## 1. What was built

All files are in `src/components/pro-play/arena/`.

| File | What it is |
|---|---|
| `ProPlayAnchorPlate.tsx` | The anchor plate for the stage's **media region**. One plate per anchor kind on one dark board: **champion** (loading-art portrait over a dimmed splash, name in the arena's Cinzel title face); **player dossier** (role emblem in a gold crest box, name, role · seasons, team codes; no portrait); **team crest** (the server's short code in a gold heraldic shield, faint monogram as art; no logo); **competition** (competition in large type, its full name, season/patch/window medallions). When the options are champions and the anchor is not, the plate's art on desktop is the **field**: one loading-art slice per option, lettered A–D, all identical. Every plate carries the scope chips and the metric chip as keyboard/touch disclosures |
| `ProPlayOptionContent.tsx` | The **content inside a canonical answer tablet** (not a tablet, not a grid): champion icon / role crest / team shield, the name in large type, and the contract's identity facts (role · seasons + team codes; region · seasons + league codes). `proPlayAnswerSlots()` turns a question into the positional nodes, the column strategy (`pair` for two, `wide-2` for three/four) and the VS seam for a pair. PPQ2-D reveal slots share one cell with the facts and replace them in place |
| `ProPlayQuestionDossier.tsx` | Left `panel` flank: comparison, anchor with an identity ledger (a player's teams with their own spans; a team's leagues by full name), every scope chip spelled out, the metric with its definition, the Recent marker |
| `ProPlaySessionPanel.tsx` | Right `panel` flank: question `n / total`, server score `score / answered`, one pip per question from **received** results only, a legend, and an answered-of-total meter. No opponent, rating, HP, streak or clock |
| `ArenaOrnaments.tsx` | The shared vocabulary redrawn with scoped utilities: board plate, gold corner brackets, gold hairline, chip tones |
| `proPlayArenaModel.ts` | Pure rules: symmetric identity alignment, layout from option count, role mapping, monograms, scope partitioning, `sessionHeadline` |
| `index.ts` | Public exports |
| `ProPlayArena.test.tsx` | 94 tests (§6) |
| `__preview__/` | DEV-only isolated preview page (§5); not a build entry |

## 2. Design decisions

- **One arena, one answer path.** The pieces are hosted by `CanonicalArena`: plates in the stage's media region, content inside the canonical `QuizAnswerOptions` button, dossier and session in the existing `{kind:"panel"}` flanks. The tablet's selection, gating, keycap, every state, the verdict icons, "Your pick", the locked dimming and the academy colours are all the shared grid's. A first version shipped its own tablets; it tripped the repo's `AnswerGrid.elimination.test.tsx` "exactly one answer-rendering path" guard and was replaced (a test in this suite now enforces the same rule on this directory).
- **Answer safety by construction.**
  - Identity is rich for every option or for none (`alignTabletIdentities` checks count, kind and that each subject names the option beside it, in order). If anything is off, `optionContent` is `null` and the canonical label-only tablet stands.
  - Every rich node draws the same rows in the same order, with "—" for an absent value; the media box is on every node.
  - The plate draws only the anchor and the server's scope/metric labels; the champion field lineup is per-option, identical, unnamed and hard-edged (a fade dimmed slice A — rejected as an asymmetry).
  - Reveal slots mount only when `revealed`; the content carries no state vocabulary at all.
  - Nothing reads `presentation` (legacy), `result`, `evidence` or `correct_answer`.
- **Stage geometry is the arena's.** From `lg` the plate fills the media region and yields first (art is absolute, copy pinned); the prompt keeps its reserve. Below `lg` the plate is a compact strip with a floor that grows with its copy, so the page — never a nested scroller — absorbs it.
- **Reduced motion.** No new motion beyond the meter's width transition (`motion-reduce` off). Tablets keep the shared entrance (OS preference honoured by the shared rule).

## 3. Component interfaces for PPQ2-B

```ts
// Media region
<ProPlayAnchorPlate context={asQuestionContext(q.context)} fallbackTitle={q.topic} />

// Answers: everything the canonical grid needs from Pro Play
const slots = proPlayAnswerSlots({
  options,                 // the QuestionView options, server order
  context,                 // asQuestionContext(q.context) — pre-answer only
  revealed: result != null,// only after the server graded
  revealSlots,             // PPQ2-D, positional; ignored until revealed
});
// slots.optionContent: ReactNode[] | null   (null → canonical labels)
// slots.columns: "pair" | "wide-2" | "auto"
// slots.pairDivider: ReactNode | null       (the VS seam, pairs only)

// Flanks (desktop; hidden below lg by the arena)
left:  { kind: "panel", node: <ProPlayQuestionDossier context={context} topic={q.topic} /> }
right: { kind: "panel", node: <ProPlaySessionPanel number={q.number} total={session.total}
          score={session.score} answered={session.answered}
          outcomes={receivedOutcomes /* Map<questionNumber, "correct"|"incorrect"> */}
          complete={session.complete} /> }

// Phone header (panels are hidden below lg): header.title = sessionHeadline({number, total, score, answered})
```

Champion option icons come from the manifest through `useChampionAssets` (same as the plate), so PPQ2-B does **not** need to fill `AnswerOptionView.media`.

## 4. Integration request (owner gate) — the `regions` seam

Nothing in this branch touches a shared file. To put the plate and the tablet content on the stage, PPQ2-B (or an owner-approved seam pass) applies `docs/handoffs/ppq2c/proposed-regions-seam.patch` — 5 files, all additive, all absent for every existing caller:

| File | Change |
|---|---|
| `lib/ranked-core/arenaView.ts` | `ArenaQuestionSurface.regions?: { media?, optionContent?, answerColumns?, pairDivider? }` (not `presentation`: that name is the legacy payload field the arena must never read) |
| `ranked-arena/CanonicalArena.tsx` | passes the four fields to the question surface (4 lines) |
| `question-surface/InteractiveScenarioSurface.tsx` | `mediaNode` replaces the band in the media region (category then shows in the prompt header); `answerContent` / `answerColumns` / `pairDivider` forwarded to `AnswerGrid` |
| `ranked-arena/AnswerGrid.tsx` | forwards `optionContent`, a `columns` override and `pairDivider`; `data-answer-layout="pair"` |
| `quiz/QuizAnswerOptions.tsx` | `optionContent` (positional, all-or-none) replaces media badge + label **inside** the same button; `aria-label` stays `"A. Label"`; `columns: "pair"` (2-up at every width); `pairDivider` drawn over the gap as a `span` (so the `> div` entrance never moves it); a pair's letter moves to the corner |

Checked on the patched host (`C:\Users\mlmit\mogzy-wt\ppq2c-capture`, = this branch + the patch, uncommitted):
- `tsc -p tsconfig.app.json`: the same 2 pre-existing errors as base, none added.
- `CanonicalArena.questionSurface`, `CanonicalArena.boundary`, `question-surface/**`: 204 passed / 2 failed, the two failures identical on base (CRLF source guards: `QuestionMotifLayer.qf1` "Champion/Combat unchanged", `CanonicalArena.boundary` academy).
- `AnswerGrid.elimination` "one answer-rendering path": same result as base (fails on Windows only because the guard compares `\`-separated paths; the file list is the canonical one).
- Ranked/Daily/Journey non-regression of the patched shared files was **not** re-certified with the PPQ2-A pixel/DOM harness; that belongs to the seam pass.

## 5. Visual certification

Harness: `__preview__/index.html` served by the capture host's Vite dev server (`/src/components/pro-play/arena/__preview__/index.html?fixture=&state=pre|selected|correct|wrong&names=real|long&prompt=real|long&rails=panel|none&stage=seam|default`). It mounts the production `CanonicalArena` in `Layout`'s full-bleed frame with the real frozen payloads (`PRO_PLAY_SAMPLES`). Synthetic and labelled as such: the session score/earlier outcomes, and the `names=long` / `prompt=long` stress labels (relabelled on options **and** subjects together, so alignment stays real). Captures: headless Edge, Playwright, `docs/handoffs/ppq2c/cap.cjs` (asset/font disk cache, Supabase blocked).

Matrix: 18 cases × 6 viewports (375×812, 390×844, 768×1024, 1024×768, 1280×800, 1440×900) — every fixture shape, the four states, long names, long stems — plus keyboard focus, hover and reduced-motion captures. Probe per capture: document x-overflow, stage clip, nested scrollers, panel clipping, plate content outside the plate, partly clipped tablet content, last tablet vs fold, answer region vs reserve, broken images, page errors. Results: `docs/handoffs/ppq2c/probe.json` (all 108 rows); selected screenshots in `docs/handoffs/ppq2c/`.

**Results (final sweep, after the canonical-grid refactor):** 108 captures + 7 focus/hover/reduced-motion captures; **0 page errors; 0 probe violations** except the pre-existing 1024×768 x-overflow (1028/1024) on all 18 cases at that size.

| Viewport | Stage height (all 18 cases) | Last tablet bottom (max) | Answers used / reserve | Plate height | Notes |
|---|---|---|---|---|---|
| 375×812 | intrinsic 403–666 | 748 (< 812) | ≤ 348 / none | 120–126 | no x-overflow, no nested scroller; 4 tablets stack 1-col |
| 390×844 | intrinsic 403–666 | 748 (< 844) | ≤ 348 / none | 120–126 | same |
| 768×1024 | intrinsic 416–671 | 753 | ≤ 353 / none | 136–167 | sub-lg stack, panels hidden |
| 1024×768 | **604.2 constant** | 616 | ≤ 156 / 166 | 221 | pre-existing 1028px document width only |
| 1280×800 | **636.2 constant** | 658 | ≤ 156 / 128 | 246–256 | media yields ≤ 10px on rich rounds |
| 1440×900 | **736.2 constant** | 748 | ≤ 180 / 128 | 270–276 | media yields ≤ 6px |

Every desktop stage is the same height for every fixture, state, long name and long stem: the folio and the timeline never move. The 23 "not loaded" images per sub-lg viewport are the desktop-only lineup slices (`hidden lg:flex`, lazy), correctly never fetched. Visual review notes: names, codes and chips stay legible at 375 (≥ 10px chips, 14–17px names); the gold/navy contrast matches the Ranked tablets; long names fall to smaller type tiers (plate) or truncate with `title` (2×2 tablets); keyboard focus shows the academy's gold outline (`focus-*.jpg`); reduced-motion captures are identical in layout.

Screenshot index (`docs/handoffs/ppq2c/*.jpg`): every fixture at 390×844, 1024×768 and 1440×900 (`<fixture>-<state>[-longnames][-longstem]-<viewport>.jpg`) — champion anchor + player options `champion_player`, player anchor + champion options `player_champion`/`pro_play`, team anchor `team_champion`, scope anchor `patch`/`recent`, two-choice `champion_player`/`champion_team`/`recent`, four-choice `t1_lineage`/`pro_play`/`patch`/`flex`, states `selected`/`wrong`/`correct`, long names and long stems — plus 375×812, 768×1024, 1280×800 samples and `focus-`, `hover-`, `reduced-motion-` captures.

## 6. Tests

`npx vitest run src/components/pro-play/arena` → **94 passed**. Covered:
- alignment on all 14 real payloads; plain fallback on a mismatched name, length, mixed kind, no context, reversed order;
- the evidence-value leak scan (the legacy card's sweep) over plate + content + dossier for every payload;
- no reveal slot before grading even when slots are passed; content carries no state vocabulary;
- identical structure per option in server order, media on every option or none; symmetric media when one icon fails;
- the plate never names an option; the lineup is identical, lettered, unnamed and `aria-hidden`;
- slots: `pair`/`wide-2`, VS only for pairs, `null` content when asymmetric, reveal slots in place (facts invisible + `aria-hidden`), nothing interactive inside a tablet;
- session pips from received outcomes only; no opponent/ELO/HP/health/damage/streak/rating/timer/seconds/bot word anywhere;
- dossier spells out scope tooltips, metric definition, anchor ledger, Recent;
- source guards: no `.presentation`, `correct_answer`, `.evidence`, `asEvidence`, `is_correct`; no option sort/filter; no `data-quiz-choice={`, `*AnswerGrid/*AnswerOptions` component or `<button` in this directory; no import from `ProPlayQuiz` or `lib/pro-play/arena`.

Typecheck: the 2 pre-existing errors only (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`). ESLint on the directory: 0 errors, 3 `react-refresh` warnings in the preview files only.

## 7. Assumptions about PPQ2-A

- `ArenaQuestionSurface` as on `ppq2a/integration-main` (`kind:"question"`, `question`, `selectedOptionId`, `permissions`, `onSelectOption`, `reveal`, `inputOpen`, `reportRef`). The pieces themselves import nothing from it; only the preview does.
- Panel flanks stay desktop-only (`hidden lg:block`) and `phoneStacked` applies; on phones the plate's chip disclosures carry the dossier, and the header title should carry the score (`sessionHeadline`).
- Options keep `id = String(index)` in server order, and `context.subjects` arrives in that same order (verified on every fixture; enforced by `alignTabletIdentities`).

## 8. Unresolved presentation limitations

- **Seam not applied** (§4): without it the arena shows the canonical text band and label tablets with these panels.
- **Arena header title** ("Question n / 10") renders very faint in the header strip with `timer:null` — a CanonicalArena header style, not these pieces; PPQ2-B should check it.
- **1024×768 x-overflow (1028/1024)** on every capture: pre-existing in every full-bleed arena (PPQ2-A A5), unchanged.
- **Answer region over its reserve on rich desktop rounds** (team/player tablets with a code line: up to ~180px vs 128px at ≥1280). The stage height does not move (the media region yields first, as designed); the plate gets correspondingly less art.
- **Code rows are one line**: codes that do not fit drop out whole (never half-cut); all names stay in the row's `title`. In the revealed state the canonical "Your pick" label can sit over the code row's right edge.
- **Session panel** has free space between the pips and the meter on tall desktops; it only shows real facts by design.
- **Lineup/plate art** depends on the manifest; a missing key keeps every slot as an identical dark panel (the preview's `names=long` "Nunu & Willump" shows the typographic fallback).
- Player/team portraits and logos remain impossible until the quiz contract ships media keys (PPQ1 Q6).
- Reveal (PPQ2-D), completion (Q3) and the route are untouched.

## 9. Reproduce

```bash
git -C C:/Users/mlmit/mogzy-wt/ppq2c-presentation log --oneline -5
npx vitest run src/components/pro-play/arena
# capture host = this branch + docs/handoffs/ppq2c/proposed-regions-seam.patch (worktree ppq2c-capture, launch entry "ppq2c-capture", port 5263)
node docs/handoffs/ppq2c/cap.cjs <outDir> champion_player:pre,t1_lineage:wrong 390x844,1440x900
```
