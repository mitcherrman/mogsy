# PLAY — Playtest Director Handoff

This file is the durable record of the Playtest Director workstream. The PLAY0
handoff existed only in an uncommitted, ephemeral worktree
(`.worktrees/play0`, branch `play0/director-audit`). PLAY1 recreates its
authoritative conclusions here and commits them together with the
implementation, so they survive the worktree.

Status: **PLAY1 implemented on `play1/director-vertical-slice` and ready for review.** The migration is not applied anywhere yet. See §12.

---

## 1. Objective

Playtest is a host-directed presentation, research and conversion wrapper
around the canonical Daily Challenge.

```
Playtest Director (host, admin)
  → Playtest Participant Wrapper (tester)
    → canonical Daily Challenge parent run
      → canonical Bot Ranked child stages
```

### PLAY must not own

- Daily composition
- question selection
- Standard, Time Trial or Survival rules
- Weak Areas logic
- Review logic
- Ranked gameplay
- question truth
- canonical learning-history analytics
- Premium entitlement
- Stripe payment truth

## 2. Owner-locked decisions

1. The Founding Playtester first year costs **$39.99**. *(Not implemented in PLAY1.)*
2. The future renewal costs **$99.99/year**. *(Not implemented in PLAY1.)*
3. Eventually, a server-verified eligible enrollment will unlock the private
   `founding_playtester` offer, replacing a shared access code. *(Not implemented in PLAY1.)*
4. Testers who are already Premium:
   - may participate;
   - may not buy the Founding Playtester subscription again;
   - are not counted as new paid conversions.

   *(Not implemented in PLAY1.)*
5. The Daily stays at **one official run per user per UTC day**. PLAY1 does not
   change this and adds no replay or reset semantics. For manual certification,
   use an account and UTC day on which the Daily has not been completed.
6. **The manifest controls presentation return points.** "Pause after every
   stage" is never architecture. A Playtest manifest decides which gameplay
   milestone returns control to the presentation. PLAY1 proves exactly one
   stage-return boundary.
7. The existing `admin` role is enough to host PLAY1. PLAY1 adds no `playtest_host` role.
8. Normal external enrollment will later require Discord linking, with an
   admin/manual exception path. Discord is **not** part of PLAY1.
9. The old RB Guided Playtest (`/quiz/playtest`) stays intact during PLAY1. It
   is retired in a separate cleanup after PLAY1 succeeds.

## 3. Architecture conclusions (PLAY0)

### Minimal persistent model

Four tables only:

| Table | Holds |
|---|---|
| `playtest_cohorts` | durable cohort data and the invitation capability |
| `playtest_enrollments` | one tester in one cohort, plus a host-facing progress projection |
| `playtest_director_state` | **the** authoritative presentation state, one row per cohort |
| `playtest_feedback` | structured answers, one per enrollment and prompt |

Everything else stays where it already lives:

- General telemetry stays in `analytics_events`, with `playtest_*` names. There is no `playtest_events` table.
- Daily gameplay and results stay in canonical Daily/Ranked persistence (Railway).
- Realtime presence is transient and is **not** a table (PLAY2).
- Payment truth will remain Stripe/Premium-owned (PLAY2+).

### Reuse

- `has_role` for authority (admin; `master_admin` passes through `has_role`)
- `AdminRoute`
- `ProtectedRoute`
- analytics `track()`
- canonical visitor, session and interaction IDs (`src/lib/analytics/correlation.ts`)
- the Admin Leaguecraft › Ranked › **Playtests** panel as the Director home
- the current Daily route component (`DailyRunPage`)
- the current Daily transport seam (`DailyRunTransport`)

### Daily seam

`DailyRunPage` accepts a swappable `transport`. PLAY wraps that transport in a
**pass-through observer** and never modifies Daily internals.

What the observer can detect:

| Condition | Rule |
|---|---|
| Stage terminal | the relevant stage has `status === "completed"` or `"skipped"` |
| Daily terminal | the run has `status === "completed"` |

When the manifest says presentation control should return, the wrapper
**unmounts** Daily. When gameplay is released again, Daily remounts and its
canonical resume (`GET /api/daily-run/today`) continues. PLAY never duplicates
Daily state.

**Known Daily completion issue:** `DailyCompletion` hard-codes navigation to
`/quiz`. PLAY1 does **not** edit Daily or DailyCompletion. Instead, the wrapper
regains control whenever its watched terminal condition occurs, so a
participant never depends on that link. This boundary is tested (§10).

### Realtime design

- `playtest_director_state` is authoritative. Realtime only speeds up propagation.
- The participant re-reads the authoritative row on initial load, refresh,
  reconnect (channel `SUBSCRIBED`), tab-visible and `online`.
- A fallback poll runs about every **15 s**.
- A client never depends on receiving every host click. A higher `revision` always wins, so duplicates and reordering are harmless.

### Security

A **tester**:
- may enroll only through a legitimate, high-entropy invitation;
- may read only the participant-safe cohort and director data needed for their own experience;
- may read their own enrollment;
- may submit their own feedback;
- may **not**:
  - advance the Director;
  - modify another tester;
  - forge host state;
  - forge payment status.

An **admin**:
- creates and manages cohorts;
- inspects enrollments;
- advances Director state;
- reads Playtest feedback.

This uses the existing admin authority, with no new role.

## 4. Repository state

| Repo | SHA | Notes |
|---|---|---|
| FE mogsy, PLAY1 base | `origin/main` `4b3be0cbe2767d3107f4462082755066b26b398b` | Worktree `.worktrees/play1`, branch `play1/director-vertical-slice` |
| BE League_Combat_Simulator | `origin/master` `acb2a946d65e8afb0deba02a5dec9165d8414716` | Deployed to Railway `web`. The Ranked, Mastery and Practice start schemas accept optional `visitor_id`, `session_id` and `interaction_id`, which closes the FE→BE 422 hazard. PLAY1 needs **no** backend change. |

## 5. Schema

Migration: `supabase/migrations/20260927120000_play1_director_foundation.sql`. It is purely additive and safe to re-run.

**`playtest_cohorts`**
- Columns:
  - `id`
  - `invite_slug`: 64 lowercase hex characters built from two v4 UUIDs (about 244 random bits). It is generated server-side and is UNIQUE.
  - `name`
  - `manifest_id`, `manifest_version`: identity of the code-owned manifest, not a copy of it.
  - `status`: `open` or `closed`.
  - `created_by`, `created_at`, `updated_at`

**`playtest_director_state`**
- There is one row per cohort, keyed by `cohort_id` (PK/FK).
- Columns: `scene_id`, `build_step`, `revision`, `updated_by`, `updated_at`.
- It is created atomically with its cohort by `playtest_create_cohort`.

**`playtest_enrollments`**
- UNIQUE `(cohort_id, user_id)`.
- Columns:
  - `status`: one of `joined`, `in_gameplay`, `checkpoint_reached`, `feedback_submitted`, `completed`. It is a **host-facing projection** and is monotonic.
  - `visitor_id`, `session_id`: canonical correlation captured at join.
  - Daily identity, `daily_run_id` and `daily_plan_date`, plus a display-only cache of the last observed snapshot: `daily_run_status`, `daily_stage_index`, `daily_stage_status`.
  - `progress_scene_id`, `progress_updated_at`, `joined_at`, `updated_at`.
- **None of this is Daily truth.** The authority is Railway's `daily_runs`.
- Discord and payment columns are deliberately omitted until PLAY2.

**`playtest_feedback`**
- Columns: `cohort_id`, `enrollment_id`, `user_id`, `prompt_key`, `scene_id`, `response`, `created_at`.
- `response` is a jsonb object of at most 4 KB.
- UNIQUE `(enrollment_id, prompt_key)`.

**RPCs** (all `SECURITY DEFINER`, `search_path = public`, EXECUTE revoked from `PUBLIC` and `anon`, granted to `authenticated`):

| RPC | Caller | Behavior |
|---|---|---|
| `playtest_create_cohort(name, manifest_id, manifest_version, initial_scene_id)` | admin | Creates the cohort and its director row at revision 0 |
| `playtest_set_cohort_status(cohort_id, status)` | admin | Opens or closes the cohort |
| `playtest_director_advance(cohort_id, expected_revision, scene_id, build_step)` | admin | Compare-and-set on `revision`. Returns `(applied, scene_id, build_step, revision, updated_at)`. When the call is stale or repeated, it returns `applied = false` and the current row, and changes nothing. |
| `playtest_join(invite_slug, visitor_id?, session_id?)` | tester | Creates or resumes the caller's own enrollment and returns participant-safe cohort data plus `answered_prompt_keys` |
| `playtest_report_progress(enrollment_id, status, scene_id?, daily…)` | tester | Own enrollment only. Status never regresses. |
| `playtest_submit_feedback(enrollment_id, prompt_key, scene_id, response)` | tester | Own enrollment only. The first answer stands, and a repeat returns `created = false`. |
| `playtest_admin_roster(cohort_id)` | admin | Enrollments, `profiles.display_name`, progress and feedback |

**Realtime:** `playtest_director_state`, `playtest_enrollments` and `playtest_feedback` are added to `supabase_realtime`, guarded so the step can be re-run.

## 6. RLS and security

- **Browser privileges:** browsers have **SELECT only** on all four tables. There is no INSERT, UPDATE or DELETE privilege and no write policy, so every write goes through an RPC above.

- **Read access by table:**

  | Table | Who can read |
  |---|---|
  | `playtest_cohorts` | admins only. The slug is never readable by testers; they receive participant-safe fields from `playtest_join`. |
  | `playtest_director_state` | admins, or users enrolled in that cohort. This is also what scopes Realtime delivery. |
  | `playtest_enrollments` | the owner (`user_id = auth.uid()`) or an admin |
  | `playtest_feedback` | the owner (`user_id = auth.uid()`) or an admin |

- **Enrollment:**
  - It requires a non-anonymous `auth.uid()`: a guest session gets `playtest_account_required`.
  - It requires possession of the slug. An unknown slug, a cohort UUID used in place of the slug, and a closed cohort (for a new tester) all raise the same `playtest_invitation_invalid`, so the RPC is not an oracle.
  - An existing enrollee can resume a closed cohort.

- **Director:** it is moved only by `has_role(auth.uid(), 'admin')`, and `master_admin` passes through `has_role`. There is no `playtest_host` role.

- **Deletes:** Realtime `postgres_changes` DELETE events bypass RLS filtering, so nothing attaches meaning to deletes.

## 7. Manifest contract

- **Location:** `src/features/playtest-director/manifest.ts`. The manifest is code-owned and versioned. `resolveManifest(id, version)` resolves it, and there is no DB editor.

- **Scene types** (`PlaytestScene`):

  | Type | Carries |
  |---|---|
  | `PresentationScene` | `builds[]`. `build_step` N shows the first N. |
  | `GameplayScene` | `surface: "daily_challenge"` and `returnWhen` |
  | `FeedbackScene` | one `prompt {key, question, options}` |
  | `CompletionScene` | a completion screen |

- **Return condition:** `returnWhen` is a `GameplayReturnCondition`, either `{type:"stage_terminal", stageIndex}` or `{type:"daily_terminal"}`. **Return points live only here.**
  - A future manifest can choose a different stage, the whole Daily, or several gameplay scenes, with no change to Daily or to the wrapper.
  - A `stage_terminal` condition is also met when the whole Daily is complete.

- **Participant behavior:** `participantView(manifest, {sceneId, buildStep})`.

- **Host step:** `nextPosition(manifest, position)` reveals the next build, otherwise moves to the next scene at build 0, and returns null at the end.

- **`PLAY1_MANIFEST`** (`play1_placeholder` v1):

  | Scene | Kind | Content |
  |---|---|---|
  | `welcome` | presentation | 3 builds |
  | `daily_standard` | gameplay | returns at `stage_terminal` of stage 0 |
  | `standard_feedback` | feedback | prompt `standard_stage_feel`: too easy, just right or too hard |
  | `play1_complete` | completion | placeholder screen |

## 8. Daily adapter contract

**`dailyObserver.ts`**

`observeDailyTransport(inner, observe)` wraps each of the five `DailyRunTransport` methods. Each wrapped method:
- forwards identical arguments, including the `AbortSignal`;
- resolves with the **same object**;
- propagates the same rejection;
- calls `observe(run)` for each non-null run, with observer exceptions swallowed.

Supporting functions:

| Function | Purpose |
|---|---|
| `projectDaily(run)` | Derives the Playtest projection: `runId`, `planDate`, `runStatus`, `currentStageIndex`, focus stage and its status, and every stage's status |
| `isStageTerminal` | The stage's status is `completed` or `skipped` |
| `isDailyTerminal` | `status === "completed"` |
| `returnConditionMet` | Checks the manifest's `returnWhen` against the projection |

**`participant/DailyGameplayGate.tsx`**
- It renders the **unmodified** `DailyRunPage` with the observed transport. The transport's identity is memoized, because `useDailyRun`'s effects depend on it.
- On the first snapshot that meets the return condition, it **unmounts** `DailyRunPage` and shows the manifest's `heldMessage`.
- Returning is re-derived after a refresh: the Daily remounts, and canonical `GET /today` shows the terminal stage, so the gate returns without launching anything.
- Playtest stores no Daily state; it keeps only the display cache in the enrollment projection.
- **DailyCompletion's `/quiz` link:** the gate unmounts in the same render pass that would show the completion screen, so the link never renders.
  - Tests prove it for a completed day on resume and for a live final-stage finish.
  - A control test shows the bare `DailyRunPage` *does* render `href="/quiz"`.

**Zero Daily files changed.** `git diff origin/main` is empty for:
- `src/pages/quiz-daily-challenge/**`
- `src/lib/daily-challenge/**`
- `src/lib/ranked-core/**`
- `src/pages/quiz-ranked/**`
- `src/lib/playtest/**`
- `src/components/playtest/**`
- `supabase/functions/**`

## 9. Files

**Owned by PLAY (new):**
- `docs/PLAYTEST_DIRECTOR_HANDOFF.md`
- `supabase/migrations/20260927120000_play1_director_foundation.sql`
- `src/features/playtest-director/`:
  - `manifest.ts`
  - `directorState.ts`
  - `dailyObserver.ts`
  - `api.ts`
  - `useDirectorState.ts`
  - `analytics.ts`
- `src/features/playtest-director/participant/{PlaytestParticipant,DailyGameplayGate}.tsx`
- `src/features/playtest-director/director/PlaytestDirectorConsole.tsx`
- `src/pages/playtest/{PlaytestParticipantPage,PlaytestDirectorPage}.tsx`
- Tests:
  - `src/test/security/play1DirectorSchema.test.ts`
  - `src/features/playtest-director/{manifest,dailyObserver}.test.ts`
  - `src/features/playtest-director/participant/PlaytestParticipant.test.tsx`
  - `src/features/playtest-director/director/PlaytestDirectorConsole.test.tsx`

**Shared files, append-only edits:**

| File | Change |
|---|---|
| `src/App.tsx` | 2 lazy imports; `/playtest/:slug` (ProtectedRoute); `/admin/playtest-director` (inside the AdminRoute shell) |
| `src/lib/analytics/contract.ts` | 6 names appended to `PRODUCT_EVENTS` |
| `src/pages/admin/areas/AdminRankedPage.tsx` | One paragraph in the Playtests panel linking to the Director |

**Explicitly not owned by PLAY, and untouched:**
- Daily (`src/pages/quiz-daily-challenge/**`, `src/lib/daily-challenge/**`, including `DailyCompletion`)
- Ranked engine, format and content
- GR generators
- History analytics
- Premium and Stripe (`create-checkout`, `stripe-webhook`, `profiles.pro_*`)
- Discord (`identity-link`, `user_identity_links`)
- The old RB guided playtest: `/quiz/playtest`, `src/lib/playtest/**`, `src/components/playtest/**`
- FB1 `public.feedback`
- The admin registry (`admin-registry.ts`). The `ranked-playtests` entry still says "Future gap"; update it when PLAY is released.

**Analytics:** the six new events are listed in §11.

## 10. Tests (PLAY1 run, 2026-09-27)

**PLAY-owned: 56 tests across 5 files, all passing.**

1. `play1DirectorSchema.test.ts`: **21**. It runs the real migration on PGlite under `SET ROLE authenticated/anon` and covers:
   - Cohorts: slug entropy, admin-only creation, testers cannot read cohorts, and no direct writes on any table.
   - Enrollment:
     - an invited user can create and then resume, idempotently;
     - an invalid slug is refused;
     - a cohort UUID used as the slug is refused;
     - an anonymous user or the anon role is refused;
     - a closed cohort refuses new testers but allows resume.
   - Isolation: a tester cannot read another's enrollment and cannot report progress for another.
   - Progress: the projection is monotonic.
   - Director state:
     - a tester reads only their own cohort's state;
     - a non-admin cannot advance;
     - an admin can advance;
     - a stale `expected_revision` is refused;
     - a repeated identical advance is a no-op;
     - the tables are in the Realtime publication.
   - Feedback:
     - one answer per prompt, and a repeat is a no-op;
     - a tester cannot submit for someone else and cannot read others' feedback;
     - the admin roster works, and testers are refused it.
   - The migration re-applies cleanly.
2. `dailyObserver.test.ts`: **11**.
   - Pass-through:
     - requests and signals are forwarded unchanged and in order;
     - the same response object is returned, unmutated;
     - a null run passes through;
     - errors propagate;
     - observer exceptions are contained;
     - the canonical fixture engine behaves identically wrapped and bare.
   - Return points:
     - projection;
     - a nonterminal snapshot does not return;
     - a completed or skipped stage 0 returns;
     - return points are manifest-selected;
     - Daily terminal is recognized.
3. `manifest.test.ts`: **7**.
   - The four scenes;
   - resolution;
   - the build/scene walk;
   - the derived view;
   - a future return point;
   - revision ordering against duplicates and reordering;
   - bigint row parsing.
4. `PlaytestParticipant.test.tsx`: **15**, against the real `DailyRunPage` and the canonical fixture transport.
   - Route and enrollment:
     - the route resolves a valid cohort;
     - an invalid invitation is refused;
     - a guest is asked to sign in.
   - Director state:
     - the initial authoritative load;
     - a live reveal;
     - a duplicate or late Realtime event does not double-advance;
     - a refresh at N/M reconstructs N/M, and unsubscribes cleanly;
     - the 15 s poll converges;
     - a re-subscribe re-reads the row.
   - Daily boundary:
     - Daily renders;
     - nonterminal snapshots keep it mounted;
     - stage 0 ending unmounts it before stage 1 launches;
     - after a refresh past the checkpoint, the return is re-derived without replay.
   - DailyCompletion:
     - control: the bare Daily shows `/quiz`;
     - the gate never renders the `/quiz` link;
     - the live final stage returns before completion.
   - Feedback:
     - submit;
     - a refresh keeps it answered.
5. `PlaytestDirectorConsole.test.tsx`: **2**.
   - The roster, progress and feedback render;
   - gameplay is released by revision;
   - a stale click adopts the current state without a second advance.

**Targeted regression:** 34 files and 559 tests pass, including the PLAY files. They cover:
- the Daily page, boundary, entry and run
- `DailyOnCanonicalArena` boundary
- `ProtectedRoute`, `AdminRoute` and `AdminMasterAdminRoute`
- all of `src/lib/analytics`
- all of `src/lib/admin`, including the registry and routes
- `AdminShell.areas`

**Other checks:**
- `tsc -p tsconfig.app.json`: 2 errors, both pre-existing on `origin/main` (`OnboardingProfile.tsx`, `identity/connections.ts`). PLAY adds none.
- `vite build`: passes.
- `eslint` on the PLAY files: clean.

## 11. Analytics

The six events are `playtest_joined`, `playtest_scene_viewed`, `playtest_gameplay_released`, `playtest_stage_checkpoint_reached`, `playtest_feedback_submitted` and `playtest_completed`.

- They go through `trackPlaytest()`, which wraps the canonical `track()`. `track()` already stamps the visitor, session and interaction.
- Metadata is bounded to:
  - `cohort_id`
  - `enrollment_id`
  - `manifest_id`
  - `manifest_version`
  - `scene_id`
  - optionally `build_step` and `resumed`
- There is no `playtest_events` table.
- No Daily or Ranked gameplay event is re-emitted.
- The enrollment also stores `visitor_id` and `session_id`, captured at join.

## 12. Current state, unresolved items, next task

**Completed:**
- PLAY1 schema, RLS and RPCs
- participant route and wrapper
- Realtime sync with poll fallback
- Daily observing adapter
- Director console
- analytics
- tests
- this handoff

**Manual certification: BLOCKED on migration application.**
- There is no local Supabase, no Docker, and no staging project in this setup.
- Migrations are applied by hand in the Lovable Cloud SQL editor, and production application was not authorized.
- The migration is ready to apply.

**To certify after it is applied:**
1. An admin opens `/admin/playtest-director`, creates a cohort and copies the invite.
2. Two signed-in tester browsers open `/playtest/<slug>`. Use accounts whose Daily is not yet completed for this UTC day.
3. Reveal builds 1 to 3 and confirm both testers update live.
4. Refresh a tester and confirm the same N/M.
5. Stale click: advance from a second admin tab showing an old revision, and confirm the notice and no double advance.
6. Release `daily_standard`. Testers play stage 0, and on completion the Daily unmounts and the held message shows.
7. Advance to `standard_feedback`, have a tester answer, and confirm the Director roster shows the status, Daily stage and answer.
8. Advance to `play1_complete`.

**Unresolved and known limits:**
- **UTC day:** a session crossing 00:00 UTC (17:00 PDT) resumes a *new* day's Daily on refresh. Schedule sessions within one UTC day.
- **Daily already played:** a tester who already played today resumes a finished stage 0 and returns immediately.
- **Stage result:** the wrapper unmounts on the sync snapshot, so testers do not see the Daily's own stage-result card for the checkpoint stage. If the owner wants it shown, a later manifest option could delay the return until the result is dismissed. Daily exposes no such hook today, so that would be a Daily-owner seam and not a PLAY edit.
- **Manifest validation:** scene and prompt keys are shape-validated in SQL, not validated against the code manifest. The host UI only proposes manifest positions.
- **Admin registry:** the `ranked-playtests` registry entry still reads "Future gap".
- **Deferred:** Discord, Presence, payment/Stripe hooks, the Premium already-owned rule, and RB guided-playtest retirement.

**Next task:**
1. Apply `20260927120000_play1_director_foundation.sql` to a non-production or authorized environment.
2. Run the manual certification above.
3. Review and merge `play1/director-vertical-slice`.
4. Then PLAY2 workers:
   - **A.** Presentation UI, sales and package slides, working only in `features/playtest-director/{participant,director,manifest}`.
   - **B.** Discord enrollment requirement plus an admin/manual exception, through a new migration and read-only `identity-link`.
   - **C.** Presence and observability: a private channel with `realtime.messages` policies.
   - **D.** `founding_playtester` entitlement and payment correlation. PT1 owner review is required in `create-checkout` and `stripe-webhook`. Pricing is $39.99 for the first year and $99.99/yr on renewal.
5. Separately, retire the RB guided playtest.
