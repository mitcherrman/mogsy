# DV2-P2A — Live Daily V2 Hierarchy (frontend) — handoff

Date: 2026-10-08 · Frontend only · feature branch pushed, **not merged, not published (Lovable)**. Backend untouched.

## 1. Objective

Make the live Daily Challenge frontend read and present the Daily V2 plan-v5 contract (backend B1 + B2 + B1.1, `ec3500d0`). It must stay exactly as before against today's v4 backend, because this frontend ships **before** `ec3500d0` reaches backend master.

## 2. Verified bases

| What | SHA |
|---|---|
| Frontend `origin/main` (branch base) | `d528bf9fe87e22371ff3dacf4eeb2f58fe383a33` |
| Backend production `origin/master` | `f3a164f15ef440530000cd50db68eb9f986974b1` (read only) |
| Backend reviewed v5 stack (`origin/dv2/b2-main-history`) | `ec3500d0f396b10381e9294269b09a40cf03d7e5` (read only) |

Branch `dv2/p2a-live-hierarchy`. Worktree `C:\Users\mlmit\mogzy-wt\dv2-p2a`. Untouched base checkout for differentials: `C:\Users\mlmit\mogzy-wt\dv2-p2a-base` (detached at `d528bf9f`).

## 3. Authoritative backend contract (checked in source at `ec3500d0`, not taken from the handoffs)

- `service.snapshot()` sends `plan_version` (master already sends it; it is `4` today) and, from B1, `main_completed_at` and `main_score`. Both are NULL until a v5 Standard settles, and NULL for every v1–v4 run. Both are NULL when the columns are missing. It sends no `main_complete`. `wiring.present()` passes them through unchanged.
- `_main_score` is the child reader's integer `summary["score"]` (bool/None/str/float refused → 500, nothing written). `_complete_main` freezes the pair inside the same `BEGIN IMMEDIATE` that completes Standard. A snapshot therefore carries **both or neither**, and carries them **exactly when Standard is `completed`**.
- `plan.has_main_daily(v) = v >= 5`. The v5 order is `standard` + seeded shuffle of (`time_trial`, `survival`) + `weak_areas` (eligible only) + `review` last. `validate_stage_order` refuses any other frozen v5 order. Order Forge is not served.
- The parent stays `active` after main completion. `completed` still means every stage is resolved. No skip-extras mutation exists.
- Backend `_TITLES`: the Review stage's content title is `"Review"`.

## 4. Live-run contract additions (`src/lib/daily-challenge/run/contracts.ts`)

`DailyRun` gains `planVersion: number | null`, `mainCompletedAt: string | null`, `mainScore: number | null` (camelCase, like the rest of the DTO). Pure helpers:

- `MAIN_DAILY_PLAN_VERSION = 5`
- `hasMainDaily(run)`: `planVersion !== null && planVersion >= 5`
- `isMainDailyComplete(run)`: `hasMainDaily && mainCompletedAt !== null && mainScore !== null`
- `mainStage(run)`: Standard (index 0) for v5+, otherwise null

Reader rules (`readMain`, v5+ only; every failure is a `DailyRunParseError`):

- `main_completed_at` is a non-empty string or null/absent. `main_score` is a non-negative integer or null/absent. Bool, fractional, string, negative and object values are refused.
- Half a pair is refused. It is never completed with a guessed value.
- The pair must be present **iff** Standard is `completed`. Main completion is never inferred from the stage status, and a contradictory payload is not accepted.
- There is exactly one Standard, at index 0, and the sections never step back (Today → More Challenges → Review). This is the backend's `validate_stage_order`, generalised by category so a future Order Forge (bonus) would still parse. As a result, grouping into sections can never reorder a stage.
- `main_complete` is never read.

Legacy (v1–v4, or no `plan_version`): `mainCompletedAt` and `mainScore` are always null, and any wire values are ignored (the same rule as History B2). No v5 structural rule applies.

## 5. The exact v4/v5 switch

`hasMainDaily(run)`, i.e. the server's `plan_version >= 5`, and nothing else. Never the stage kinds, their positions, or Standard's status. Tests prove that a v5-shaped day (`V5_ELIGIBLE_DAY` kinds) at `plan_version: 4` renders the legacy linear Daily.

## 6. Section presentation design

`stageCategory.ts` gains `DailySectionId` (`today | more | review`), `DAILY_SECTION_LABEL`, `dailySection(stage)` and `dailySections(run)` (groups in server order, empty sections dropped). They map main → Today's Challenge, bonus → More Challenges, training → Review.

| Surface | v1–v4 (unchanged) | v5 |
|---|---|---|
| Daily intro | "N stages today" + numbered ladder | **Today's Challenge** eyebrow, the Standard tag, content, rule; one quiet line "More Challenges and Review open after — both optional". No lineup. |
| Stage intro position | "Stage X of N" / "Final stage" | "Today's Challenge" / "More Challenges · Optional" / "Review · Optional" (+ `data-section`) |
| Header chrome position | "Stage X of N" | section label |
| Header exit link | "Exit Daily Challenge" | before main: "Exit Daily Challenge"; after main: "Done for now" |
| Stage-result eyebrow | "Daily Challenge · Stage X of N" | "Daily Challenge · <section>" |
| Ladder | numbered `StageLadder` | `SectionLadder`: three labelled groups ("· Optional" on the two optional ones), no numbers, the same ✓ / skipped marks and DRS1 reservation |
| Optional stage result | — | Continue, plus a quiet "Done for now" tertiary (drawn disabled while pending, so it fills a slot) |
| Final Continue label | "See today's results" | "See today's recap" |

Weak Areas and Recently Missed keep their own identities and the approved sentences. Server order is never changed.

## 7. Main-result design (`DailyMainResult.tsx`, model `buildDailyMainResult`)

It replaces the stage result when a v5 Standard settles (and while it is settling). It uses the same `ResultHero` / `ResultStatGrid` / `ResultActions`:

- the Standard tag;
- the hero: eyebrow "Daily Challenge", headline **TODAY'S CHALLENGE**, status line **Complete**, the big number = **`run.mainScore`** labelled "Daily score";
- the snapshot from Standard's own settled result: Correct `x / y`, Accuracy, Missed. There is no Points tile (it would repeat the hero's number);
- an "Optional" panel: "Keep playing if you like. Nothing here changes your Daily score." with the More Challenges and Review tags actually in the run;
- [placement slot, as on stage results];
- two equal-height choices: **Play More Challenges** (or "Start Review" / "See today's recap" by what comes next) and **Done for now**.

No rank, percentile, tier, streak, Answer Streak or personal best. `mainCompletedAt` is used only as authority and is not printed.

**Pending → settled (DRS1):** the headline is constant, the status line reads "Scoring…" until settled, the hero reserves the score row, the snapshot slot has Standard's floor, the optional panel is built from the plan, and both actions are drawn (disabled while pending). Measured in the browser: the section, hero, slot and panel heights are **identical** pending vs settled at 1280px (702/348/96/120) and 375px (893/356/160/187). There is no horizontal overflow at 375px.

## 8. Leave-guard semantics (`dailyLeaveContract.ts`)

`shouldGuardDailyLeave(run, flow)` replaces `isActiveDailyRun` as the guard's `active`:

- v1–v4, and v5 before main completion: guarded while the parent is active (unchanged). Copy: the legacy copy is unchanged. v5 pre-main says "Today's Challenge isn't finished yet…" (normal) or "Today's Challenge is still live… about 45 seconds…" (live).
- v5 after main completion: guarded **only** when `hasLiveDailyChild` holds. That covers an in-progress or launching child with a child match id, including one behind its tag and a hidden settling Survival child. The copy is "Leave <Stage>?" / "Today's Daily is complete and saved. <Stage> is still live: leaving does not forfeit immediately, but return within about 45 seconds or it may end." / Keep playing / Leave.
- `optional-entry`, the main result, a non-live stage tag, and a terminal handback awaiting sync are all unguarded after main completion.
- Browser Back, the header link and HUD links all go through the same router blocker, so they follow the same rule. "Done for now" is `navigate("/quiz")` with **no server call**, unguarded because main is complete. The run stays `active` and resumable.

~~Known gap: the launch window before a child id exists was unguarded.~~ **Closed in DV2-P2A.1 (§17):** a mount-local launch latch keeps leaving guarded from the player's commit until the launch reaches a known outcome.

## 9. Hub-status semantics (`status.ts`, `PlayScrollRecord.tsx`)

`DailyStatusView` gains `optionalOpen`. `resolved` and `total` become `number | null`.

- v1–v4: unchanged values (`completed` = parent completed; `resolved/total` = all-stage counts).
- v5: `completed` = **main** complete. `resumable` = parent active (so both can be true). `optionalOpen` = both true. `resolved` and `total` = **null**: no all-stage count exists for v5.

Consumers: only `PlayScrollRecord` renders it (`resolved/total/resumable` were never drawn in production). A main-complete day with optional content open draws the done panel **"Today's Daily Complete"** / "Optional More Challenges and Review are still open." Its one action is "Continue optional challenges", which closes the record and calls the existing `onPlayDailyChallenge`. The Daily page reads the existing run, so nothing new is created. A fully finished v5 day and every v4 day render as before ("Today's Challenge Complete" / "Come back tomorrow." / practice). Preview fixtures and test literals gained `optionalOpen: false`.

## 10. Recovery behaviour

A new presentation phase, `optional-entry`, uses a mount-local latch (`optionalEntryUp`):

- On arrival (`readToday`), `arrivesAtOptionalEntry(run)` is: v5, main complete, parent active, current stage `pending`/`launching` with **no child id**. In that case the page shows `OptionalEntryBeat`: the plan date, "TODAY'S CHALLENGE / COMPLETE", the frozen Daily score (from the snapshot, not a replayed result), the section ladder, "Up next · Optional <tag>", and **Play More Challenges / Start Review** plus **Done for now**.
- Nothing launches until the player continues (`enterOptional` clears the latch). After that the normal tag-then-launch path runs at the backend's current stage.
- Standard is never replayed, and the main result is never re-shown on load (it exists only for the mount that watched Standard settle, as before).
- A live optional child (`in_progress` with a child id) skips the entry and uses the existing recovery: it is remounted as `recovered` with no tag replay.
- An untouched v5 run plays the (v5) Daily intro as before. A finished v5 run shows the v5 completion.

## 11. Final parent completion

- v5: title **"All Done for Today"**, with the note "More Challenges and Review finished. Today's Daily was already complete." The recap is grouped as Today's Challenge (the Standard row leads with the frozen Daily score, then `x / y`), More Challenges and Review, using only the stages in the run. The perfect banner and skip notes are unchanged.
- v1–v4: "Daily Challenge Complete" with the linear recap, unchanged.

## 12. Guest save gate

**Unchanged.** It was never on the main result: it stays a portaled overlay on the final completion only, so the earned Standard result is never covered. Consequence (owner decision, deferred): a v5 guest who chooses "Done for now" after the main result is not prompted to save until they finish the optional content. No persistence behaviour was added.

## 13. Files

Source:
- `lib/daily-challenge/run/{contracts,flow,stageCategory,stageResultModel,fixtures}.ts`
- `lib/daily-challenge/status.ts`
- `components/quiz/play-scroll/PlayScrollRecord.tsx`
- `pages/quiz-daily-challenge/run/{DailyRunPage,DailyRunBeats,DailyStageResult,DailyStageChrome,DailyCompletion,StageTag}.tsx`
- `pages/quiz-daily-challenge/run/{useDailyRun,dailyLeaveContract}.ts`
- **new** `pages/quiz-daily-challenge/run/DailyMainResult.tsx`
- `pages/dev/{lobby-preview/LobbyPreviewPage,play-scroll/PlayScrollPreviewPage}.tsx` (the `optionalOpen` field only)

Tests:
- **new** `run/dailyV2P2A.hierarchy.test.tsx` (45 tests)
- `run/dailyV2P0.compat.test.tsx`: section F's "nothing reads the main fields yet" pins are superseded. They now pin "a legacy run never gets main-complete behaviour".
- `play-scroll/RankedPlayScroll.test.tsx`: +2 hub tests.
- `Quiz.playScroll.test.tsx`: `optionalOpen` in its literals.
- `ranked-arena/DailyOnCanonicalArena.boundary.test.tsx`: `DailyMainResult.tsx` is registered in its two file lists.

Doc: this file.

## 14. Tests and gates

The P2A suite covers:
- current v4 parse and behaviour;
- a missing `plan_version`;
- the switch on `plan_version` only;
- v5 pre-Standard having no main fields (null and absent);
- the authoritative `main_score` (≠ the stage score), and 0;
- half-pair refusal, 5 bad scores and 3 bad timestamps;
- no status inference in either direction;
- the order guard, with either bonus order kept;
- `main_complete` not being read;
- sections (TT+Survival → More, WA+RM → Review, no reordering, ineligible);
- position labels;
- hub status v4 / v5-pre / v5-main / v5-done;
- a full v5 end-to-end run: no "N stages" / "Stage X of N" / "Final stage" anywhere, the main result shown before any optional launch, the optional score not touching `main_score`, the Review sentences, and the final "All Done for Today" grouped recap;
- "Done for now" making zero transport calls (main result and entry) with the run still active;
- reload after main → `optional-entry`, no replay, no launch, then resuming at the current stage; reload onto Review; a live optional child recovered;
- hub start intent creating nothing;
- the leave guard pre-main / main-complete (3 phases) / live child / settling Survival / legacy, plus the page-level guard toggling;
- v4 end to end unchanged;
- the guest gate only on the completion, never over the main result;
- no rank / percentile / tier / streak / leaderboard / personal-best copy.

Mutation check: **17/17 mutants killed**. They covered the switch, the half pair, status inference, the order guard, a negative score, `optionalOpen`, the v5 all-stage count, the guard in both directions, the reload entry, the score source, the v5 close title, the global position, the ladder, the main-result routing, the v5 intro and the hub clause.

Differential (`--maxWorkers=4`, the same 14 suite paths on the base `d528bf9f` checkout and on the branch):
- base: 57 files, **20 failed** / 1102 passed.
- branch: 58 files, **20 failed** / 1149 passed.
- The **failing node IDs are identical** (diffed).
- Inherited failures:
  - `QuestionTimeline.test.tsx` ×14 (popover timeouts)
  - `playModeCard.styles.test.ts` ×2
  - `syntheticRankedHistory.test.ts` ×1
  - `useSafeTemporalBack.test.tsx` ×1
  - `DailyOnCanonicalArena.boundary.test.tsx` ×2: stale lists that miss `entry.ts`, `stageCategory.ts`, `dailyLeaveContract.ts` and flag "Continue Daily". The branch's failure detail names the same missing files and the same single offender; only the counts move by the newly registered `DailyMainResult.tsx`.

Static checks:
- `tsc -p tsconfig.app.json --noEmit`: 2 errors, both inherited (`OnboardingProfile.tsx:180`, `identity/connections.ts:263`).
- ESLint on every touched file: 0 errors, 1 warning, which is pre-existing on base (`PlayScrollRecord.tsx:90`, react-refresh).
- `git diff --check` (cr-at-eol) against the base: clean.

Visual check: a throwaway dev route (removed, not committed) rendered the v5 intro, the main result (settled and pending), the optional entry, an optional stage result and the final recap at 1280px and 375px. That run produced one fix (optional panel groups stack label-over-tags) and the height measurements in §7.

## 15. Known deferred work

- Guest save prompt at main completion (§12): an owner decision.
- History UI: still shows `basic.score` (B2 adds `main.daily_score` / `parent`; FE History P2 is separate).
- The backend Review content title is "Review" under the "RECENTLY MISSED" tag (a backend `_TITLES` concern if the owner wants it changed).
- `DailyOnCanonicalArena.boundary.test.tsx` stale lists (inherited).
- Order Forge, skip-extras, streaks, leaderboard, personal best: out of scope.

## 16. Next integration step

Note: while this slice was in progress, `origin/main` advanced to `c08882f6` (8 Mastery-retirement commits, 6 files under `quiz-mastery`/docs, no Daily, play-scroll or result files). `git merge-tree origin/main <branch>` is clean. Re-run the focused Daily suites after the merge.

1. Command-center review of `dv2/p2a-live-hierarchy`.
2. Merge to frontend `main` and **publish (Lovable)**. Against the v4 backend the change is inert: every v4 path is unchanged and tested.
3. Verify the published bundle against production v4 (`/api/daily-run/today` parses; hub and Daily unchanged).
4. Only then release backend B1 + B2 + B1.1 (`ec3500d0`) to master. Railway deploys master on push. Deploy order: FE P2A first.
5. After the backend release: one live v5 run end to end (main result → Done for now → hub "Today's Daily Complete" → resume → optional-entry → finish → "All Done for Today").

## 17. DV2-P2A.1 — optional-launch leave race (correction on `ba395e5b`)

Command-center review approved P2A at `ba395e5b`, except for one defect. On a main-complete v5 day, once the player chose an optional activity, `useDailyRun` started `launchStage()` behind the stage tag. Until the response arrived, the snapshot still said "pending, no child", so `shouldGuardDailyLeave` (which needs `hasLiveDailyChild`, i.e. a child id) left departure unguarded. The request could then finish after navigation and create a live child nobody saw. P2A was not redesigned.

Verified first: `origin/dv2/p2a-live-hierarchy = ba395e5b`, frontend `origin/main = c08882f6` (not merged, not rebased), backend stack `ec3500d0` (untouched).

### The latch (state machine)

Mount-local controller state in `useDailyRun`: `optionalLaunchFor: string | null` (stage id), mirrored in a ref. The pure predicates live in `lib/daily-challenge/run/flow.ts`:

- `optionalLaunchTarget(run)`: the current stage id iff the run is v5, main complete, parent active, and the current stage is `pending`/`launching` with `childMatchId === null`. Otherwise null, so a v1–v4 run, a pre-main v5 run, a finished run, or a stage that already has a child can never latch.
- `optionalLaunchInFlight(run, latched) = latched !== null && optionalLaunchTarget(run) === latched`.

```
            (page load / reload)                      never set: a load invents nothing
 IDLE ─────────────────────────────────────────────── optional-entry & main result stay unguarded
  │  commit = the player's action, synchronously, before any launch:
  │    • enterOptional()       (Play More Challenges / Start Review on optional-entry)
  │    • continueFromResult()  (Play More Challenges on the main result; Continue on an optional result)
  │    • retry()               (Try again on a failed launch)
  │  latch ← optionalLaunchTarget(run)   (null if nothing optional to launch → stays IDLE)
  ▼
 COMMITTED / IN FLIGHT   optionalLaunchPending = true → guarded, copy "<Stage> is starting…"
  │
  ├─ launch response binds a child ───────► derived false; hasLiveDailyChild → LIVE guard
  │                                          (the existing ~45-second copy)
  ├─ launch fails ─► re-read the run (quiet readRun):
  │     ├─ server shows NO child ─────────► latch cleared → IDLE: leaving is free; error + Try again shown
  │     ├─ server shows a child (lost resp.)► child marked fresh, error cleared → LIVE guard
  │     └─ re-read fails too (unknown) ───► latch kept: still guarded as "starting"
  └─ stage stops being current / run ends ─► derived false (the latch names a stage id)
```

- The re-read happens only when this mount latched that stage, so v1–v4 and pre-main v5 never make an extra call.
- `optionalLaunchPending` is passed to `shouldGuardDailyLeave(run, flow, pending)` and `dailyLeaveCopy(run, flow, pending)`. After main completion the guard is `pending || hasLiveDailyChild`.
- Copy while starting, which never claims a live child: "Leave Time Trial?" / "Time Trial is starting. Today's Daily is complete and saved, but leaving now may still start Time Trial." / Keep playing / Leave.
- The live-child copy (about 45 seconds) is unchanged. `optional-entry`, the main result and between-activity screens stay unguarded. "Done for now" still makes no call. v1–v4 are untouched (the latch cannot form for them).

### Tests: `run/dailyV2P2A1.launchRace.test.tsx` (13)

These run the real `useDailyRun`, the real router blocker (`useTransactionalLeaveGuard`), a fixture backend and launches held open by the test:

- main complete on `optional-entry` → HUD link leaves with no dialog and no launch;
- Play More Challenges → guarded at once while the launch is held, with the snapshot still `pending` / no child. Back (POP) is blocked with the "starting" copy (no 45-second claim). Releasing the launch switches the open dialog to the live copy and keeps the destination; still guarded while live; confirmed Leave leaves;
- a link pressed synchronously right after the commit is blocked: no free render tick;
- refused launch → error shown, `readRun` confirms no child → leaving is free;
- Try again re-latches → guarded again;
- lost response with the child created → no error left, the child plays as a fresh entry, live guard;
- refused launch and failed re-read → stays guarded (unknown);
- Play More Challenges from the in-session MAIN result → guarded at once;
- Done for now from the main result → zero transport calls, no dialog;
- v4: legacy copy and guard unchanged, no "starting" copy, `optionalLaunchTarget(legacy) === null`;
- pure seam: target/in-flight predicates, reload (no commit) never in flight, and the guard and copy combinations.

Reload onto a pending optional stage staying `optional-entry` and unguarded is covered by the first test and by P2A's recovery tests.

**Mutation (this seam): 13/13 killed.** The mutants:
- the guard ignores the latch: this is the **original defect**, and 6 tests fail;
- the page does not pass the latch;
- no commit on entry, Continue or Try again;
- a confirmed-childless failure keeps the latch;
- any failure drops the latch without asking;
- an unknown outcome drops the latch;
- a lost-response child is not handled;
- in-flight ignores the stage;
- the target ignores main completion (legacy could latch);
- the starting copy claims a live child;
- a reload invents the latch.

**Differential vs an exact `ba395e5b` checkout** (`C:\Users\mlmit\mogzy-wt\dv2-p2a-ba395`), on the same 14 suite paths as §14:
- `ba395e5b`: 58 files, 20 failed / 1149 passed.
- P2A.1: 59 files, 20 failed / 1162 passed.
- The failing node IDs are **identical**. The `DailyOnCanonicalArena.boundary` failure detail is byte-identical.

Static checks: `tsc` shows only the 2 inherited errors. ESLint on the touched files: 0 problems. `git diff --check` (cr-at-eol): clean.

Files:
- `lib/daily-challenge/run/flow.ts` (two predicates)
- `pages/quiz-daily-challenge/run/useDailyRun.ts` (latch, commits, failure re-read, `optionalLaunchPending`)
- `pages/quiz-daily-challenge/run/dailyLeaveContract.ts` (third parameter; "starting" copy)
- `pages/quiz-daily-challenge/run/DailyRunPage.tsx` (passes the latch)
- new test `run/dailyV2P2A1.launchRace.test.tsx`
- this section

Commits: `08542a47` carries the code fix and the race suite. A shell slip pushed it with a placeholder "WIP P2A.1" title; it was not force-rewritten. The follow-up commit adds this section and tightens the lost-response test (the one surviving mutant before that fix). Both sit on `ba395e5b`, which is unchanged.

Status: **READY.** Integration still waits for P2B, as instructed. This branch is not merged or rebased onto `main` and not published.
