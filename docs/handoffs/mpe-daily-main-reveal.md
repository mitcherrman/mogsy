# Daily Challenge main result — cinematic reveal proposal (research only, 2026-10-14)

Scope: the **Today's Challenge main result** (`DailyMainResult`). Optional stage results and the final recap are touched only to stay consistent. No source files, assets or commits were changed for this document.

## 0. Repository state (verified)

| Item | Finding |
| --- | --- |
| Local checkout `C:\Users\mlmit\OneDrive\Desktop\mogsy` | branch `main` at `0d3fbcbb` (2026-10-09), tracked tree clean. **Stale**: it has none of the files the brief names. |
| `origin/main` (as last fetched) | `fe2c3503` "Merge PR #18: Role Challenge Quiz Hub and arena release" (2026-10-14). It **contains** every PR 6 reward commit (`669af4d5` is an ancestor), plus the Daily compact-header work and the Reconstruct R3C / mobile arena fixes. |
| `mpe/premium-reward-polish-20261012` (worktree `C:\Users\mlmit\mogzy-wt\mpe-premium-rewards`) | tip `669af4d5`, identical to `origin/main` on every file below. The PR 6 handoff says "keep the PR in draft", but its commits are already on `origin/main`; GitHub merge status could not be checked (`gh` not installed). |
| Recommended base | `origin/main` after a fresh `git fetch`, in a new worktree. Not the mpe branch and not the local `main`. |

All code citations below are against `origin/main` (= the mpe worktree).

## 1. Current component and lifecycle findings

**Composition** (`src/pages/quiz-daily-challenge/run/DailyMainResult.tsx`): `StageTag` → `ResultHero` (`reserveScore`) → snapshot slot (`min-h-[10rem] sm:min-h-[6rem]`) → Optional panel → placement → error → `ResultActions` (primary "Play More Challenges" / secondary "Done for now"). Model from `buildDailyMainResult` (`src/lib/daily-challenge/run/stageResultModel.ts`): headline "Today's Challenge", subheading "Scoring…" → "Complete", score `run.mainScore` with label "Daily score", snapshot Correct / Accuracy / Missed.

**Lifecycle of one Daily end** (`DailyRunPage.tsx`, `useDailyRun.ts`, `flow.ts`, `matchHost.ts`, `QuizRankedMatch.tsx`):

1. The hosted Standard match plays its final reveal, then hands back at the instant the Ranked outro would have begun. Hosted matches draw no outro and play no result sting (`outcomeMoment: !host`).
2. The page moves to `stage-settling`: `DailyMainResult` mounts **pending**. `ResultHero` runs its one `reward-enter` (420 ms) now. Mogzy is already `cheering` over "Scoring…". Actions are drawn disabled; every later slot already has its height (DRS1).
3. `useDailyRun.adopt()` receives the synced run. `stageCompletedBetween` fires, the phase becomes `stage-result`, and `daily.stage.complete` plays (voice `sfx.leaguecraft.quiz-complete`, gain 1, `eventId daily:<runId>:stage:<stageId>:complete`).
4. **Same component instance re-renders** with `settled = true` (same switch branch, no key change): the score text appears in the reserved row, the stat grid mounts, labels flip, buttons enable. No CSS animation re-runs, because the only animation was at mount. Result: the sound fires at the landing, but the number simply pops in.

**Consequences worth fixing**
- The reveal is timed to the wrong instant: motion happens when the pending frame appears, not when the score arrives.
- Mogzy celebrates before the result exists (pose is `complete → cheering` regardless of pending).
- `ResultHero` fetches the **full 1024 px PNG** for an 80–96 px draw: `mogzy-cheering-transparent.png` is 927 KB (`thinking` is 1.0 MB). `MOGZY_MASCOT_ASSETS_COMPACT` has no `cheering` or `thinking` plate; the PR 6 handoff flagged this exact cost for `DiscoveryReveal` and sidestepped it with `holdingBook` (10 KB WebP).
- The stat grid mounts with no entrance; the hero's `reward-enter` and the body stagger vocabulary (`GameResultsBody` `ENTER` table) are not used here.

**Already right, keep as is**
- Pending and settled frames share one height; nothing measures at runtime (DRS1 floors, `reserveScore`).
- "Ceremony once" is structural: a reload onto a main-complete day lands on `OptionalEntryBeat`, never on this screen. The only mount that sees `DailyMainResult` settle is the one that watched it.
- Reduced motion has one reader for both channels (`useReducedMotionPreference`), and the `reward-*` CSS block already collapses under both (`src/index.css` ~1448–1580, placed **before** the RM1 marker on purpose: the JP5 and Order Forge stylesheet-slice tests assert no `animation` after their markers).
- The score is `run.mainScore` and nothing else; snapshot values come from the settled stage. No contract touches are needed or proposed.

## 2. Storyboard

`t = 0` is the render in which `settled` flips to true (same instant `adopt` plays `daily.stage.complete`). Everything before `t = 0` is today's pending frame, unchanged except Mogzy's pose. Nothing below changes the height of any slot.

| t (ms) | Beat | Visual | Audio | Mogzy |
| --- | --- | --- | --- | --- |
| pending | **Scoring** | Today's frame. | — | `thinking` (compact plate), still. |
| 0 | **Resolved** | Subheading "Scoring…" → "Complete" re-enters (`reward-enter`, keyed remount). Ambient `reward-glow` wash fades up at the hero's top (1400 ms, rests at 0.6). | `daily.stage.complete` (existing, from `adopt`): G4→C5→E5 arpeggio, done by ~520 ms. | Crossfade to `cheering` (200 ms out) and `reward-mascot` settle (560 ms). |
| 160 → 800 | **The Daily score** (primary reveal) | The big number counts 0 → `mainScore` with `useCountUp` (640 ms, ease-out cubic), width reserved in `ch`, `tabular-nums`. Screen reader gets the final value only. | `daily.score.reveal` at 160 ms (new registry row, existing voice `sfx.reward.xp-earned`): three quiet ticks under the count, G5+D6 confirmation at ~720–800 ms, i.e. with the landing. | At rest. |
| 520 → 1620 | **Light** | One `reward-sheen` pass across the hero panel, crossing the number as it lands. | — | — |
| 560 | Label | "Daily score" enters (`reward-enter`, opacity only; slot already reserved). | — | — |
| 800 | **Landed** | `data-landed="true"` → existing `reward-xp-land` bump (scale 1.1, gold text-shadow, 380 ms). | (confirmation note above) | — |
| 900 | **Performance** | Snapshot grid enters as one block (`reward-enter`, `--reward-delay: 900ms`) inside its reserved floor. | — | — |
| 1100 | **Way on** | Primary label flipped and enabled since t = 0; optional one-shot gold flare on the primary (reuses the `reward-spine` box-shadow keyframes). | — | — |

~1.1 s to the last beat; all motion at rest by ~1.6 s. **No gating**: actions enable at `t = 0`; leaving mid-sequence unmounts and cancels timers. Reduced motion (either channel): count prints the final value at once, crossfade becomes a swap, sheen hidden, delays zeroed by the existing rules; audio unchanged.

Optional stages (`DailyStageResult`) and the recap (`DailyCompletion`) stay static. The Daily score is the one counted number of the day; a second count-up on "7 / 10 correct" would flatten the hierarchy.

## 3. Reuse (no new systems)

| Need | Existing piece | Where |
| --- | --- | --- |
| Count-up with exact landing | `useCountUp` | `src/components/game-results/useCountUp.ts` |
| Landing bump, reserved width, sr-only final | `.reward-xp-value`, `.reward-xp-value__figure`, `[data-landed]` + the `EarnedXpValue` markup pattern (not the component: it hardcodes "+N XP" and the XP cue) | `index.css` MPE block, `EarnedXpValue.tsx` |
| Section / label entrance | `.reward-enter` + `--reward-delay` | `GameResultsBody` pattern |
| Light sweep, ambient wash | `.reward-sheen`, `.reward-glow` (both already handle `.ranked-panel > *` positioning) | `DiscoveryReveal` |
| Mascot settle | `.reward-mascot` keyframes | `DiscoveryReveal` |
| Completion sting | `daily.stage.complete` already fired by `useDailyRun.adopt` | `sfx-registry.ts` |
| Score confirmation voice | `sfx.reward.xp-earned` generator (ticks + confirmation at 0.56–0.6 s, designed for a 640 ms count) under a **new semantic row** `daily.score.reveal`; the registry already does this for `daily.stage.complete` → `sfx.leaguecraft.quiz-complete` | `sfx-registry.ts`, `sfx-renderers.ts` (no renderer change) |
| Dedupe | engine `eventId` (`daily:<runId>:main:score`) | `useSfx` |
| Reduced motion | `useReducedMotionPreference` + existing media / `html.reduce-motion` rules | `src/hooks/useReducedMotionPreference.ts` |
| Beat table convention | `DISCOVERY_BEATS` → a `DAILY_REVEAL_BEATS` const in `DailyMainResult` | `DiscoveryReveal.tsx` |
| Small mascot plates | `MOGZY_MASCOT_ASSETS_COMPACT` fallback-safe lookup | `mascot-assets.ts` |

## 4. Minimal file-level change plan

Core (P1):

1. `src/components/game-results/ResultHero.tsx` — two opt-in props, default off so Ranked / practice / stage results are byte-identical:
   - `revealScore?: boolean`: render `score.you` through a small local `RevealedScore` child (isolates the ~40 rAF re-renders), `useCountUp` 640 ms with `delayMs` 160, `reward-xp-value` classes, `minWidth` in `ch`, aria-hidden figure + sr-only final, `data-landed`; add `reward-glow` and (when revealing) `reward-sheen` children; `data-reveal` on the header.
   - `pendingPose?: MogzyMascotPose`: drawn while `reserveScore && !score`; both plates rendered stacked in the same 80/96 px box so the settled one is already loaded; outgoing gets a 200 ms fade-out, incoming gets `reward-mascot`.
   - Request `scale="compact"` for the hero mascot (lookup falls back to the source where no plate exists, so this is safe for every consumer today).
2. `src/pages/quiz-daily-challenge/run/DailyMainResult.tsx` — `DAILY_REVEAL_BEATS`; pass `revealScore pendingPose="thinking"`; `data-settled`; wrap `daily-main-result-summary` in `reward-enter` at 900 ms; play `daily.score.reveal` with `eventId` when `settled` becomes true (one `useEffect`, ref-guarded like `EarnedXpValue`). Header comment updated.
3. `src/lib/audio/sfx-registry.ts` — add `"daily.score.reveal": { group: "daily", minReplayMs: 1000, relativeGain: 0.9, builtInGeneratorId: "sfx.reward.xp-earned" }` (sits between discovery .9 and earned XP .85 in the documented hierarchy; comment says why it borrows the voice).
4. `src/index.css` — inside the existing MPE block (before the RM1 marker, never at EOF): one `reward-mascot-out` fade keyframe + class, added to the `[data-ceremony="false"]`, media-query and `html.reduce-motion` lists; optionally a `.reward-ready` class reusing the `reward-spine` keyframes for the primary button.
5. `src/components/mascot/mascot-assets.ts` + `public/mascot/mogzy-cheering-transparent-240.webp`, `public/mascot/mogzy-thinking-transparent-240.webp` — compact plates at the base plate's 240 px width (expected 15–25 KB each, versus 927 KB and 1.0 MB today). No generation script exists in the repo; produce them the way the `-192` / `-240` plates were (same crop, same alpha).
6. Tests — new `DailyMainResult.reveal.test.tsx` (fake timers as in `EarnedXpValue.test.tsx`): pending frame unchanged and `thinking` drawn; settle → count passes through the middle and lands on exactly `mainScore`; sr-only final present from the first settled frame; `daily.score.reveal` played once with the event id; reduced motion prints the final value at once; `ResultHero` default props unchanged (snapshot of the Ranked hero). Update `dailyV2P2A.hierarchy.test.tsx` line ~313: assert the sr-only final / `data-landed` after advancing timers instead of `toHaveTextContent("1,234")` on the live figure (today that assertion would pass only by substring accident). Extend `sfx-registry.reward.test.ts` for the new row.

Optional (P2, separate commits, each independently droppable):

7. `ResultAction.highlight?: boolean` in `model.ts` + `ResultActions.tsx` (`data-highlight`) for the 1100 ms primary flare.
8. A `daily-main-result` state in `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` fed by the test fixture (`fixtureV5Run`), so the sequence and the two-voice overlap can be replayed and tuned by ear without a Daily run.

Not touched: `useDailyRun.ts`, `flow.ts`, `stageResultModel.ts`, contracts, `DailyStageResult`, `DailyCompletion`, `DailyRunBeats`, Home Hub (`LolHub.tsx`, `AcademyBulletin`), Patch Brief (`AcademyBroadcastSurface`, `usePatchBriefFeed`). None of those Hub / Brief files import `game-results` or any `reward-*` class (verified by grep on `origin/main`).

## 5. Acceptance criteria

Layout / mobile / capture
- Pending and settled frames have identical height at 375×667, 390×844, 360×640 (9:16 creator capture at 3x) and 1280×860; the sequence adds 0 px at every beat (DRS1 floors are the only height authority).
- No horizontal overflow at 360 px; the score at its widest (`1,234`-style, five characters) stays on one line at `text-5xl`.
- Primary and secondary actions are enabled at `t = 0`; a click at any beat navigates with no stuck timers or console errors.
- Visual check of all three states (pending, mid-count, rest) at 375 px and desktop; the at-rest frame is pixel-identical to today's settled frame apart from the ambient glow at 0.6.

Performance
- Only transform / opacity / text-shadow animate; nothing animates height or width.
- The hero mascot request on a Daily end drops from ~0.9 MB PNG to the compact WebP; no new dependency, no new font, no video.
- The count-up re-renders only `RevealedScore`, not `DailyMainResult`.

Accessibility
- OS `prefers-reduced-motion` and the app's `html.reduce-motion` each produce: final score at once, mascot swap without motion, no sheen, grid visible immediately.
- `aria-live="polite"` on the section announces "Complete", the final Daily score and the label once; intermediate counts are `aria-hidden`.
- Mogzy stays `decorative` (empty alt); pose carries no information that text lacks.
- Focus order unchanged: primary → secondary.

Audio
- `daily.stage.complete` still fires exactly once per stage (existing event id), `daily.score.reveal` exactly once per run (`daily:<runId>:main:score`); StrictMode double-mount does not replay either; muted / locked engine states are no-ops.
- By-ear check on one phone and one desktop: the arpeggio, ticks and confirmation read as one phrase. If they do not, fall back to no second voice (see §6).

Regression
- `GameResultsShell.test`, `GameResultsBody.compact.test`, `DailyStageResult.frame.test`, `DailyRunPage*.test`, `dailyV2P2A.*`, `EarnedXpValue.test`, `sfx-registry.reward.test`, and the JP5 / Order Forge stylesheet-slice tests pass; `tsc -p tsconfig.app.json --noEmit` clean; `vite build` passes.

## 6. Conflicts, unknowns, tradeoffs

**Needs your approval before implementation**
1. **Base**: branch from `origin/main` (`fe2c3503`), not the mpe branch. The local `main` checkout is five days stale.
2. **Two new compact mascot plates** (`cheering`, `thinking`, ~240 px WebP). They are derivatives, not new art, but they are new files under `public/mascot/`.
3. **Pending pose `thinking`** replaces `cheering` during "Scoring…" on this screen only. Alternative if you prefer no pose change: keep `cheering` throughout and play only the `reward-mascot` settle at `t = 0` (then only the `cheering` plate is needed).
4. **Second voice** `daily.score.reveal` reusing `sfx.reward.xp-earned`. Alternative: no new registry row; the landing is visual only and `daily.stage.complete` remains the one sound. This is the one genuinely consequential audio decision; the reuse is cheap to add and cheap to remove.

**Concurrent work**
- `origin/fix/mobile-recording-viewport-fit-20261015` (`c1dd44b6`, not on `origin/main`) edits `src/index.css` in the arena / MAF1 region (~line 19260). The MPE block is at ~1448, so textual conflicts are unlikely but the branch should land first or be rebased over.
- `origin/ui/daily-mobile-single-row-header` is already on `origin/main` (compact `DailyStageChrome`); nothing here touches it.
- Home Hub and Patch Brief branches share no files with this plan.

**Unknowns**
- Typical `stage-settling` duration (network round-trip of the parent sync) is not measured; the storyboard works for both an instant and a multi-second pending window because all motion keys on the settle instant.
- Whether a dev-only inspector state for a Daily fixture is wanted (P2 item 8).
- Whether any admin / Audio Studio binding list must enumerate new registry rows (no coverage test found by grep; verify when adding the row).
- Vertical creator-capture heights are estimated, not measured; the acceptance list makes measurement the gate, and the plan adds no height.

**Tradeoffs taken**
- The count-up starts at 0, not at a partial value, because `mainScore` has no "before" (unlike the collection count). 640 ms keeps it under the attention budget the PR 6 handoff set.
- Snapshot tiles enter as one block rather than per tile: a per-tile stagger would need a new opt-in prop on the shared `ResultStatGrid` for little gain.
- No XP or progression bar: the PR 6 handoff is explicit that no truthful per-run settlement exists; nothing here invents one.

---

# Implementation record (2026-10-14, same day, after approval)

Approved as proposed: base `origin/main`, pending pose `thinking`, two compact plates, `daily.score.reveal` reusing the earned-XP voice.

## Branch and worktree
- Branch `mpe/daily-main-reveal-20261014` cut from `origin/main` `fe2c3503`, worktree `C:\Users\mlmit\mogzy-wt\mpe-daily-reveal` (`npm install --no-save`, lockfile untouched). Not pushed; no PR opened.

## What shipped (files)
- `src/components/game-results/ResultHero.tsx` — `revealScore` and `pendingPose` props (default off), `SCORE_REVEAL_BEATS` (count 160, duration 640, sheen 520, label 560), a local `RevealedScore` (count-up via `useCountUp`, `reward-xp-value` landing bump, `ch`-reserved width, sr-only final value, `data-landed`), stacked mascot plates in one box with `data-pose`, `reward-glow` + `reward-sheen` as the last (absolute) children, subheading keyed so "Scoring…" → "Complete" re-enters, `scale="compact"` for every hero mascot.
  **Also fixed a pre-existing DRS1 bug found while measuring**: the reserved score row and label were rendered with a plain space, which collapses to no line box, so they measured 0 px and the hero grew ~75 px (desktop) when the score landed. They now hold a no-break space; pending and settled heroes measure identical.
- `src/pages/quiz-daily-challenge/run/DailyMainResult.tsx` — `DAILY_REVEAL_BEATS` (cue 160, snapshot 900), `dailyScoreSoundEventId()`, `data-settled`, hero asked to `revealScore pendingPose="thinking"`, snapshot wrapper `reward-enter` at 900 ms, StrictMode-safe one-shot timer that plays `daily.score.reveal` with `eventId daily:<runId>:main:score`.
- `src/lib/audio/sfx-registry.ts` — `daily.score.reveal` (group `daily`, gain .9, replay window 1000 ms, voice `sfx.reward.xp-earned`).
- `src/components/mascot/mascot-assets.ts` + `public/mascot/mogzy-cheering-transparent-240.webp` (11.5 KB) and `mogzy-thinking-transparent-240.webp` (11.7 KB) — 240×360 WebP plates from the 1024×1536 sources (Pillow, LANCZOS, q82), the base plate's size.
- `src/index.css` — inside the MPE block (before the RM1 marker): `.reward-mascot-out` + `reward-fade-out` keyframes, and the `[data-ceremony="false"]` rule for it. The JP5 / Order Forge slice tests still pass.
- Dev inspector (`/dev/ranked-arena-inspector`): new state **"RESULT — Daily · Today's Challenge settles (score reveal)"** — 1.4 s pending, then settle with the stage sting, count, score cue, light and snapshot; "Replay animation" re-runs it under a fresh run id so both cues sound again. Imports only `DailyMainResult` and the Daily wire fixtures (the import-guard test passes).
- Tests: new `DailyMainResult.reveal.test.tsx` (8), inspector (+1), `sfx-registry.reward.test.ts` (+1); `dailyV2P2A.hierarchy.test.tsx` now asserts the spoken final value instead of the live figure.

## Verification
- `tsc -p tsconfig.app.json --noEmit` clean; ESLint on changed files 0 errors (3 `react-refresh/only-export-components` warnings, the files' existing pattern).
- Vitest: Daily run suites, game-results, DiscoveryReveal, inspector, audio reward registry, Ranked end-screen / discovery / hosted, mascot, and the stylesheet-slice tests — all passing (counts in the session log; 251 in the main batch).
- Browser (Vite dev + the desktop app's built-in browser, inspector state above): at 375×812, 360×640 and 1280×860 the pending and settled frames measure **identical** (hero and section delta 0 px, no horizontal overflow). Every expected animation is present with the designed delays (`getAnimations()`): subheading re-enter, mascot out/in, score bump on `data-landed`, label at 560, sheen at 520, glow, snapshot at 900. The count ran 0 → 1,234 and landed with `data-landed="true"`; the plates served were the two new WebPs.
- **Not verified live**: the browser pane was hidden for the whole session, which pauses `requestAnimationFrame` and the CSS timeline, so the sequence was exercised with a timer shim and checked structurally, not watched. Audio was not heard. Both need one human replay on `/dev/ranked-arena-inspector` (click once to unlock audio, pick the Daily state, press Replay; try Reduced motion and Mobile 375).

## Remaining
- Listen to the sting → ticks → confirmation layering on a real device; if it reads as busy, drop the `daily.score.reveal` row (one line in the registry, one effect in `DailyMainResult`) and keep the visual landing.
- The optional P2 primary-button flare was not implemented (the enable + label flip at 0 ms already reads as the way on).
- A `.claude/launch.json` was created in the worktree for the preview; it is gitignored.
