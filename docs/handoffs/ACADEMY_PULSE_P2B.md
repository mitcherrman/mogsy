# PULSE-2B — Admin Pulse Workspace handoff

Branch `pulse/p2b-admin-workspace`, base `origin/main` a0f426d4. Coordinated through mitcherrman/mogsy#151. Draft PR only: nothing is merged, deployed or applied to any database.

## 1. What it is

An owner-only workspace where Academy Pulse content, cadence and partner campaigns are managed as data instead of frontend source. It has four tabs plus an always-visible emergency control:

| Area | What the owner can do |
|---|---|
| **Content** | Create announcements, events, quick-study questions, mini-game features, sponsor placements, and creator videos or streams. Edit, preview live as they type (the real scene), and save. Lifecycle: draft → publish now / schedule → unpublish → archive / back to draft. Set priority, featured, expiry and time on screen. Each row says whether it is **Playing** on the Home Hub and, if not, why. |
| **Cadence & categories** | Per category: on/off, frequency (slots per cycle), expiry. The cadence slot list (reorder, add, remove), promotion cap and promotion spacing. A **resulting cycle** computed by the shared `buildPulseCycle`, so the guard rails (no repeats, no same-kind neighbours, promotion cap and gap across the wrap) are the real ones. |
| **Campaigns** | Sponsor and creator campaigns: partner, title, disclosure type and wording, flight window, internal contract reference. Approve, reject or end, with a recorded note. Editing the partner or the disclosure of an approved campaign sends it back to pending. |
| **Preview** | The **production `AcademyPulse` device**, not a copy, fed with the workspace's public projection at any moment ("As of") and at the four Home Hub slot sizes (desktop, short-laptop ticker, tall, phone). It also lists what is held back and why. |
| **Emergency editorial disable** | Scope *partners* (sponsor + creator) or *managed* (everything authored here, so Pulse falls back to the shipped static editorial set). A reason is required. It is separate from `VITE_ACADEMY_PULSE=off`, which removes the whole device from `/lol` at build time. |

## 2. Content model (contract `pulse-admin/1`)

The full contract is in `src/lib/admin/pulse/contract.ts`. The **scene payload is the shared `PulseItem`, unchanged**. The workspace adds an envelope around it:

- `PulseContentRecord`: `label`, `payload`, `state` (draft | published | unpublished | archived), `publishAt`, `expiresAt`, `priority`, `featured`, `campaignId`, `revision`, timestamps, and an internal `note`.
- **Effective status** is derived on the clock, never stored: draft, scheduled, live, expired, unpublished, archived.
- **Authorable kinds**: news (announcement/event), question, minigame, sponsor and creator. Activity, leaderboard, insight and challenge carry real player numbers, so they are **provider-only** (PULSE-2A). Premium copy comes only from `lib/premium/matrix.ts`. The owner steers those categories with category and cadence settings, never by typing scores.
- `PulseCategorySetting`: `enabled`, `maxPerCycle` (frequency), `expiresAt`.
- `PulseScheduleSettings`: `slots`, `maxPromotionsPerCycle` (0–4) and `minPromotionGap` (1–12), the same fields `PulseCadence` already has, plus `kill`.
- `PulseCampaign`: `type`, `partnerName`, `disclosure` (sponsored | paid-partnership | affiliate | unpaid-spotlight), `disclosureText`, `approval`, the flight window and `contractRef`.

**Rules** (`validation.ts`, repeated server-side):

- Editorial links must be same-site paths (`/quiz`; `//host` and `javascript:` are refused).
- Partner links and artwork must be `https`.
- Twitch **LIVE can never be set by hand**.
- Sponsor and creator content needs a campaign. Going live needs that campaign **approved**, inside its flight, and the scene **renderable** (the scheduler's own `isRenderable`).
- Sponsors are always disclosed as *Sponsored*. Any paid relationship needs disclosure wording.

**Public projection** (`projection.ts`): eligible items, in rotation order (featured, then priority, then newest), plus the effective cadence. Eligibility is checked in this order: kill switch, live status, category, campaign, publish checks. The output is exactly `PulseCatalogue` + `PulseCadence`, so the existing scheduler decides order.

## 3. Persistence and authorization

**Repository seam** (`repository.ts`): `PulseAdminRepository` has two implementations.

| Implementation | When | Notes |
|---|---|---|
| `createMemoryPulseRepository` | Default (`VITE_PULSE_ADMIN_STORAGE` unset) | In-tab prototype that enforces the same rules (revisions, lifecycle, approval). The UI shows **"Prototype · not saved to the server"**. It writes nothing anywhere. |
| `createSupabasePulseRepository` | `VITE_PULSE_ADMIN_STORAGE=server`, **only after the migration is applied** | Calls the `pulse_admin_*` RPCs. Every write goes through OWN1.1 `runOwnerAction`: `trusted` for editorial work and the kill switch, **`fresh`** for campaign decisions. Never idempotent-resent. |

**Staged migration**: `supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql`. It is deliberately **outside `supabase/migrations`**, so a Lovable sync cannot apply it. Rollback is in `rollback/`.

- **Additive only.** It adds four tables (`pulse_content_items`, `pulse_campaigns`, `pulse_category_settings`, `pulse_schedule_settings`) and new functions. It changes nothing that already exists.
- **Tables:** RLS is on and there are **no write policies**. Table privileges are revoked from anon and authenticated; the owner gets SELECT via `is_owner()` for support. CHECK constraints repeat the core rules: disclosure fits the campaign type, paid campaigns are worded, every partner item has a campaign, kind and category pair correctly, and the cadence stays in bounds.
- **Owner RPCs** are `SECURITY DEFINER`, use `search_path = ''`, and start with `public.assert_owner(level)`:
  - each write checks the expected revision (a stale one raises `pulse_conflict`);
  - payloads are validated (`pulse_invalid`, with the issues as JSON in DETAIL);
  - each write is recorded with `log_owner_action('pulse.*')`.
- **Public read:** `pulse_public_catalogue()` is the **only** anon-callable function. Server-side it applies the kill switch, status and schedule, category on/expiry/frequency, campaign approval and flight, and payload re-validation. It returns `{ contractVersion: "pulse-public/1", fallbackToStatic, cadence, items: [{ item, disclosure }] }`. Labels, notes, contract references, drafts and excluded content never leave the database.

## 4. Verification

| Level | What | Result |
|---|---|---|
| Unit | `rules.test.ts`: lifecycle, validation, projection; projection fed to the real `buildPulseCycle` (promotion caps hold) | 17 pass |
| Unit | `repositories.test.ts`: prototype rules; Supabase repo calls `runOwnerAction` at the declared level for every write, a cancelled verification sends nothing, error mapping | 10 pass |
| **DB (real Postgres, PGlite)** | `pulseAdminMigration.db.test.ts` runs the **staged SQL** under OWN1's `is_owner` / `assert_owner` / `log_owner_action`, **read verbatim** from `supabase/own1-staged` | 18 pass |
| UI (jsdom) | `AdminPulsePage.test.tsx`: owner gate | 5 pass |
| UI (jsdom) | `AdminPulseWorkspace.test.tsx`: author → publish → plays; category off; cadence cap; campaign approval → sponsor publish; emergency disable / restore; preview mounts the production device | 7 pass |
| Typecheck | `tsc -p tsconfig.app.json` | No diagnostics in the new files. The two pre-existing errors on main, in `OnboardingProfile.tsx` and `connections.ts`, are unchanged. |
| Lint | eslint on the new files | 0 errors; 3 fast-refresh warnings (a repo-wide pattern) |
| Browser | `e2e/admin-pulse/workspace.spec.ts` via `.github/workflows/admin-pulse.yml` (GitHub runner, bundled headless Chromium, 1 worker; artifact `admin-pulse-evidence`) | **8/8 pass** on d297a473, [run 40077237138](https://github.com/mitcherrman/mogsy/actions/runs/40077237138). The same job's vitest (112), migration-location guard and `vite build` also pass. **Not run on this PC** (AGENTS.md). |

The earlier CI runs found three real issues, now fixed:
- The harness lacked the `QueryClientProvider` that `App.tsx` gives every route, and the Pulse device reads champion art through react-query.
- The tab strip and the campaign buttons overflowed at 360/390 px.
- The preview frame clipped Pulse's nameplate. The preview now keeps the exact slot size and scrolls on narrow screens.

The PGlite suite proves these server-side behaviours:

- anon can read no table and call no admin RPC; the public read works;
- a player, even at aal2, gets `owner_required` and sees 0 rows;
- **nobody, the owner included, can INSERT, UPDATE or DELETE the tables directly**;
- an unattested aal1 owner gets `step_up_required`;
- a stale MFA can't approve a campaign (`fresh_aal2`);
- `javascript:` and `//host` links and a hand-set Twitch LIVE are refused;
- stale revisions are conflicts;
- live content can't be archived, and edits that would break it are refused;
- category off, frequency 0 and cadence bounds apply;
- a sponsor stays off until approved; ending the campaign removes it at once;
- the public read carries the disclosure and never the contract reference or note;
- kill *managed* → empty + `fallbackToStatic`; kill *partners* → partner content only;
- every write has an audit row;
- rollback removes exactly what was added.

How the tests were run locally: vitest through an esbuild-JSX scratch config with a wasm-rollup require hook. The shared `@swc/core` and the native rollup binary are blocked on this machine; see memory. CI runs the plain `npm test`.

## 5. Security notes

1. **UI hiding is not the control.** The page sits behind `AdminRoute`, but every write is refused by `assert_owner()` in the RPCs, and the tables have no write grants or policies.
2. **The emergency disable is `trusted`, not `fresh`.** It is deliberate: an incident must not wait on an MFA prompt. The trade-off is that a hijacked trusted-device session could switch editorial content *off* (not on). Approvals, the only path to partner content going live, need fresh MFA.
3. **Payloads are owner-authored JSON**, returned verbatim (with `id` and `provenance` forced). The scene components render text as React text (no `dangerouslySetInnerHTML`). Links are restricted by pattern at both layers, and `pg_column_size(payload) ≤ 16 KB`.
4. **Partner URLs:** only https is enforced. A domain allowlist is PULSE-2C's (#151) and should be added to `private.pulse_https` (or a sibling) before the first real campaign.
5. **Disclosure in the public read:** it is returned as a sibling of the item (`{ item, disclosure }`), because the shared `SponsorItem` / `CreatorItem` types have no disclosure field. Showing the wording in the expanded view needs a small shared-type contract PR (see §6).
6. `pulse_admin_snapshot` is `STABLE` and calls `assert_owner`. No anon path reads the tables.

## 6. Integration steps for the command center (not done here)

1. **Route:** add `/admin/pulse` → `src/components/admin/pulse/AdminPulsePage.tsx` (lazy) inside the AdminShell routes in `src/App.tsx`, plus an `admin-registry.ts` entry (Operations or Studio area). `AdminPulsePage` already wraps itself in `AdminRoute`.
2. **Migration (L3 gate):**
   - Review `supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql`.
   - Confirm OWN1 (`assert_owner`, `is_owner`, `log_owner_action`, `admin_audit_log.aal/session_id`) is present in production.
   - Copy the file into `supabase/migrations/<timestamp>_pulse_admin_workspace.sql` in a dedicated PR.
   - Apply in a quiet window and run the §4 assertions against the live schema.
   - Then set `VITE_PULSE_ADMIN_STORAGE=server`.
   - Regenerate Supabase types if wanted (the repo currently calls these RPCs `as never`).
3. **PULSE-2A provider:**
   - Read `pulse_public_catalogue()`.
   - Merge its items with the static editorial set, or replace that set entirely when `fallbackToStatic` is set. Map `{ item }` to `PulseItem`, and use `cadence.slots` when non-empty, else `DEFAULT_PULSE_CADENCE`.
   - Premium stays in `publicPulseProvider` (not authorable).
   - The seeded categories for player activity, leaderboard, personal insight and community challenge start **off**; 2A turns them on when it has an authoritative source.
4. **Shared-type PR (2A/2B/2C):**
   - Add `disclosure?: { kind; text; partner }` to `SponsorItem` / `CreatorItem` so the scenes and the expanded view can show the reviewed wording.
   - PULSE-2C adapters should emit `PulseCampaignInput`-shaped campaigns and payloads that pass `validateItemForSave`.
5. CI: the new `admin-pulse` workflow is path-filtered to these files.

## 7. Files

New only. No shared file is modified (`AcademyPulse.tsx`, `pulse-types.ts`, `pulse-cadence.ts`, `pulse-provider.ts`, `App.tsx` and `supabase/migrations/**` are untouched).

- `src/lib/admin/pulse/`:
  - `contract`, `lifecycle`, `validation`, `projection`
  - `repository`, `memoryRepository`, `supabaseRepository`, `serverClient`
  - `prototypeSeed`, `templates`, `usePulseWorkspace`
  - tests: `rules`, `repositories`, `pulseAdminMigration.db`
- `src/components/admin/pulse/`:
  - `AdminPulsePage`, `AdminPulseWorkspace`
  - `PulseContentPanel`, `PulseItemEditor`, `PulsePayloadFields`
  - `PulseCadencePanel`, `PulseCampaignsPanel`, `PulsePreviewPanel`, `PulsePresentation`
  - `PulseEmergencyControl`, `PulseStatusBadge`, `fields`
  - tests: page and workspace
- `supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql`, `rollback/01_pulse_admin_workspace_rollback.sql`
- `e2e/admin-pulse/` (`harness.html`, `harness.tsx`, `workspace.spec.ts`), `playwright.admin-pulse.config.ts`, `.github/workflows/admin-pulse.yml`
- This document

## 8. Open questions for the owner

1. Is the emergency disable at `trusted` (no MFA) right, or should switching it **off** (restoring content) need fresh MFA?
2. Should publishing an **event** or a **sponsor** placement also need fresh MFA, or is campaign approval enough?
3. Where does Pulse belong in the Admin rail: Operations or Studio?
4. Sponsor policy (#140 §6.8): disclosure wording, caps beyond the cadence, and brand-safety review are still owner and legal decisions before the first real campaign.
