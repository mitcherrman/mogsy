# MPE Premium Rewards — Handoff (updated 2026-10-12, second pass)

## Objective and constraints
The user wants focused, *high-quality polish* across existing Mogzy (League of Legends learning game), **not** a redesign or new architecture: compelling end-screen *card discovery and earned Academy XP* moments, synchronized sound design, contextual Mogzy mascot reactions, and one consistent visual language for highlights and transitions. Reuse existing components and the audio engine. Prioritize quality, then credits, then speed. No Docker. Do not change or overlap the separate Daily Challenge / Role Challenge / Quiz Hub workstreams. Do not merge or deploy without review.

## Working branch and PR
- Repo `mitcherrman/mogsy`; base `main` at `8c9c1f73` when the branch started. `origin/main` is two commits ahead (PW4-B Worlds tournament work, no overlap with these files).
- Branch `mpe/premium-reward-polish-20261012`; draft PR https://github.com/mitcherrman/mogsy/pull/6.
- Frontend only. No backend, no DB, no reward accounting changes.
- Local worktree used for this pass: `C:\Users\mlmit\mogzy-wt\mpe-premium-rewards` (deps installed with `npm install --no-save` because `package-lock.json` is out of sync with `package.json` on `main`; the lockfile was not modified).

## What the second pass found in the first-pass prototype (and fixed)
1. **The ceremony was hidden.** Ranked renders the shared body in `compact` mode, which folded `model.review` (the discovery panel) into the closed "Match details" disclosure. The sound fired for a panel the player could not see. The inspector previewed a different composition (full body, frame identity row), so this never showed.
2. **Sound dedupe duplicated the engine.** A module-global `Set<matchId>` guarded replays; the engine already dedupes by `eventId`. It also replayed on a reload or History open (no "watched it live" gate).
3. **Wrong voice.** The discovery cue reused the per-module points-awarded phrase, so a permanent discovery sounded like one more settled round.
4. **Mascot cost and repetition.** `cheering` at 48px with `scale="compact"` has no compact plate, so it fetched a 927 KB PNG; it also repeated the hero's cheer.
5. **No count-up, inconsistent highlights.** Earned XP was a static zoom; the compact strip used a grey-blue gradient unrelated to the gold language.
6. **Preview did not match production.** No one/many/unavailable/none/reload/no-XP states; the XP fixture bypassed the adapter.

## What ships now (all within the authorized scope)

### Discovery ceremony — `src/components/ranked-arena/DiscoveryReveal.tsx`
- Header (eyebrow, Cinzel headline, one-line sub) with **Mogzy `holdingBook`** from the compact 192px WebP (~10 KB) arriving once at the panel's edge.
- Each discovered question is a **card**: gold spine (slate for a retired question), `R<n>` round chip (omitted when the server stated no round), prompt, explicit **NEW** stamp, cyan category badge. `data-metadata` marks `resolved`/`unavailable`.
- Choreography (`DISCOVERY_BEATS`): mascot 120 ms, first card 180 ms, 90 ms stagger capped at 640 ms, one gold light sweep, ambient top wash, collection count climbing from `collectionTotalBefore` to `collectionTotal` 320 ms after the last card (600 ms), CTA last. ~1.4 s to the final beat for three cards.
- **Cue**: `ranked.discovery.reveal` plays as the first card lands, with `eventId: ranked:<matchId>:discovery` (engine dedupe; `discoverySoundEventId()`).
- **`ceremony` prop** (default true): Ranked passes its live-completion flag. False (reload, reconnect, History open) renders the same panel at rest — every fact, no motion, no sound.
- Growth line carries `data-collection-before/total` and the full sr-only sentence at all times; only the visible "after" figure animates.

### Shared result surfaces — `src/components/game-results/*`
- `GameResultsBody`: in **compact**, `model.review` now renders in the open flow between the record strip and the details disclosure (`data-testid="result-review"`); the disclosure keeps the report and timeline. Full variant keeps its order (practice's review is remediation). Sections enter on a stagger via `reward-enter` / `--reward-delay`.
- `ResultProgress`: XP and collection rows are "knowledge" rows (gold spine + wash, `data-knowledge`). `isEarnedXp()` is the one predicate: an `xp` item with a positive `delta`. That row renders `EarnedXpValue`.
- `ResultSummaryStrip`: same knowledge emphasis and the same earned-XP count-up, so Ranked compact and the practice shell reward identically.
- `EarnedXpValue` (new): counts 0 → amount in 640 ms after a 320 ms lead-in, prints the adapter's `value` string verbatim on landing, bumps once (`data-landed`), plays `reward.xp.earned` as the count begins (confirmation note lands with the number), screen reader hears the final value only, reserved width (no layout shift).
- `useCountUp` (new): one rAF easing for both numbers; `animate:false` prints the target at once.
- `ResultHero` uses `reward-enter`; `MogzyMatchReport` no longer animates itself.

### Audio — `src/lib/audio/sfx-renderers.ts`, `sfx-registry.ts`
- New synth voices `sfx.reward.discovery` (paper breath + E5→B5 chime, octave shimmer, E6 tail, ~0.7 s) and `sfx.reward.xp-earned` (three rising ticks under the count, G5+D6 confirmation at ~0.6 s).
- Registry: `ranked.discovery.reveal` → `sfx.reward.discovery` (gain .9); new `reward.xp.earned` (group `reward`, gain .85, 1000 ms replay window). Hierarchy: match result .94 > discovery .9 > earned XP .85 > points awarded .78. Mute, unlock, Audio Studio bindings, legacy settings all apply unchanged.

### Motion vocabulary — `src/index.css` ("MPE — REWARD PRESENTATION" block, placed just before the RM1 duel-banner section)
Not at the end of the file on purpose: the JP5 and Order Forge stylesheet tests slice `index.css` from their own markers to EOF and assert nothing in that slice declares `animation-delay` or `animation`; a block appended after them lands inside their slices and fails them.
`reward-enter`, `reward-card`, `reward-card__spine`, `reward-sheen`, `reward-glow`, `reward-mascot`, `reward-xp-value`. Every keyframe ends at rest; `[data-ceremony="false"]` disables all of it; OS `prefers-reduced-motion` and the app's `html.reduce-motion` both reduce to fades (sheen/spine hidden, delays zeroed for the app switch). Note `.ranked-panel > *` forces children to `position: relative`, so `.reward-glow` sets `position: absolute` itself.

### Ranked wiring — `src/pages/quiz-ranked/useRankedMatch.ts`, `QuizRankedMatch.tsx`
- `useRankedMatch` returns `completedLive: outro !== null` (the same ref-gated live-completion answer the outro is claimed on; stays true after the beat).
- `QuizRankedMatch` passes `ceremony={m.completedLive}`; `rankedDetailsSummary` no longer promises discoveries behind the disclosure.

### Earned Academy XP in production — practice quiz (`src/lib/quiz/sessionResults.ts`, `src/pages/Quiz.tsx`)
- The backend settles practice XP per answer and returns `xp_earned` on each submit; the product already shows "+N XP" per answer. `Quiz.tsx` now records `xpEarned` on each session answer (4 lines) and passes it through. `sessionXpEarned()` sums those settled awards **only when every question in the run has one**; a failed submit, a missing field or a malformed value yields null → no gain row. A zero sum prints no "+0". Row `xp-earned` ("Academy XP earned", `+N XP`, `delta: N`) precedes the unchanged "Account XP" total. **Nothing is inferred from totals.**
- **Assumption to confirm with the backend**: practice XP is granted only per answer (no completion bonus outside the submit responses). If a bonus exists, the row under-reports and should instead come from a settlement figure.
- Ranked still shows no earned-XP row (only per-round XP in a log that may have gaps; see `rankedResultsModel.ts`).

### Inspector — `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` (route `/dev/ranked-arena-inspector`, `import.meta.env.DEV` guard unchanged)
States: `results-full-rated` (production composition: compact frame, `RankedResultDuel` poster, compact body, ceremony), `results-full-bot` (no discoveries), `results-reload` (ceremony off), `results-practice` (no settled XP), `results-earned-xp` (+80 via the production adapter), `discovery-reveal` (three, one retired), `discovery-one`, `discovery-many` (seven), `discovery-unavailable`, `discovery-none`. Controls: **Replay animation** (remounts the stage with a fresh fixture match id so the cue can play again), **Reduced motion on/off** (toggles `html.reduce-motion` for the page only; restored on unmount; a user's own setting is left alone), **Audio status** (engine snapshot: locked / muted / config pending / ready, with Enable audio). Viewport buttons Mobile 375 / Narrow 1024 / Full. No fetch, no persistence, no reward writes (import guard test unchanged).

## Verification (this pass)
- `npx tsc -p tsconfig.app.json --noEmit`: clean.
- Targeted Vitest (game-results, DiscoveryReveal ×2, MatchOverFrame, inspector, audio, sessionResults ×2, Ranked discovery/endScreen/results/useRankedMatch suites): **339 passed, 0 failed**. New suites: `DiscoveryReveal.ceremony.test.tsx` (12), `EarnedXpValue.test.tsx` (6), `sessionResults.earnedXp.test.ts` (8), `sfx-registry.reward.test.ts` (5), inspector (10), compact body (+2), Ranked discovery integration (+2).
- `npx vite build`: passes (~3 min).
- Full `npx vitest run` cannot complete on this Windows machine: the wasm-Postgres migration suites under `src/test/security/*` exhaust the Node heap (also with `--max-old-space-size=8192 --pool=forks`), and the 7 `src/lib/quiz-screenshot/*` tests spawn `/bin/sh`. Both are pre-existing and unrelated. With those excluded, the broad run flagged 31 files; every one was re-run in isolation at this commit AND at the branch's previous commit (`a0b92621`, prototype state, in a throwaway worktree). The only new failures were three stylesheet-slice tests (JP5 ×2, Order Forge ×1) caused by the CSS block's position; moving it above their markers fixed them and no difference against the baseline remains (one lobby-preview analytics file flaked under load and passes 39/39 in isolation). The 50-odd failures those files show at the baseline are pre-existing on this machine (source-scanning guards, hub tests, route contracts) and were not touched.
- ESLint on changed files: 0 errors (6 `react-refresh/only-export-components` warnings, the same pattern the files already used).
- **Browser review (Vite dev server + the desktop app's built-in browser, Audio Studio config loaded, `configReady: true`)**: desktop 1280×860 and mobile 375×812 of every state above. Verified: production composition order (result → poster → strip → discovery → growth → CTA → details → actions), no horizontal overflow at 375, focus order (discovery CTA → details → timeline marks → actions), reduced-motion collapses cards to 1 µs/0 ms with sheen hidden and the collection figure final at once, reload state has `data-ceremony="false"` with no sheen/animation, seven-card stagger caps at 640 ms, unavailable-only and none states, and the earned-XP row landing on "+80 XP" with `data-landed`.
- **Audio**: verified at engine level, not by ear. After the first gesture the AudioContext ran and `__mogzySfxRuntime__` recorded `ranked.discovery.reveal` under `ranked:rkb_demo_preview_<n>:discovery` per replay and `reward.xp.earned` on the practice state. The synth voices' shape is covered by `sfx-registry.reward.test.ts`; listening on a real device is still the user's call.
- Screenshots of mid-animation frames were not reliably capturable (the pane's screenshot path is slow); timing is asserted by the unit tests instead.

## How to replay everything without a match
1. `npm run dev` (port 8080), open `/dev/ranked-arena-inspector`.
2. Click anywhere once (audio unlock), check the "Audio:" readout says ready.
3. Pick a state from the left list (see the list above); press **Replay animation** to rerun the sequence and the cue. Use **Mobile 375** / **Full** for layouts, **Reduced motion** for the accessible path.

## Remaining / not done
- **XP progression bar and milestone emphasis**: not implemented in production or preview. The result model carries no verified `{ xpBefore, xpAfter, tierFloor, tierCeiling }` for the finished run; `academy_*` fields exist on the progress endpoint but are not a settlement of this session. Needs a backend-stated per-run settlement before any bar is truthful.
- Confirm the practice-XP assumption above with the backend owner.
- Listen to the two new voices on a real device and tune peaks if desired (all in `sfx-renderers.ts`).
- `.claude/launch.json` was created locally for the browser preview; it is gitignored.
- The PR description could not be updated from this machine (`gh` is not installed); the intended description text is in this pass's final report and should be pasted into PR 6 by the user.
- Keep the PR in draft; the user reviews and authorizes release.
