# PULSE-2B — Admin Pulse Workspace handoff

Branch `pulse/p2b-admin-workspace`, base `origin/main` a0f426d4. Draft PR mitcherrman/mogsy#155, coordinated through #151. Nothing is merged, deployed, mounted or applied to any database.

**v2 (2026-10-24), after the command-center review on #155:**
- the partner content contract is aligned with PULSE-2C (#153);
- the provisional owner assurance policy is implemented and enforced server-side;
- the admin route is assigned to **Studio**, but not mounted.

## 1. What it is

An owner-only workspace that manages Academy Pulse content, cadence and partner records as data instead of frontend source. It has four tabs, plus an always-visible emergency control.

| Area | What the owner can do |
|---|---|
| **Content** (editorial) | Announcements, events, quick-study questions and mini-game features. Draft → publish now / schedule → unpublish → archive. Priority, featured, expiry, time on screen. A live preview of the real scene. Each row says whether it is **Playing** and, if not, why. |
| **Cadence & categories** | Per category: on/off, frequency (slots per cycle) and expiry. The slot list, the promotion cap and the spacing. The resulting cycle is computed by the shared `buildPulseCycle`. |
| **Partners** | Sponsor campaigns and creator spotlights, edited **in PULSE-2C's record shape**. Lifecycle on 2C's statuses. The global sponsor destination allowlist. Read-only release gates. A preview of each record. |
| **Preview** | The production `AcademyPulse` device on the public projection, at any "as of" time and the four Home Hub slot sizes, with a list of what is held back and why. |
| **Emergency disable** | Scope *partners* (sponsor + creator) or *managed* (everything here, with fallback to the shipped static editorial set). Disabling is immediate. Restoring asks for a fresh code. It is separate from `VITE_ACADEMY_PULSE=off`. |

## 2. One content contract, aligned with PULSE-2C

There are two kinds of owner content. Each has **one** public shape.

**Editorial** (news / event / question / mini-game):
- The scene payload is the shared `PulseItem` (`pulse-types.ts`, unchanged), inside an editorial envelope: state, `publishAt`, `expiresAt`, priority, featured, revision, note.
- Activity, leaderboard, insight and challenge stay **provider-only** (PULSE-2A), because they carry real player numbers. Premium copy comes only from `lib/premium/matrix.ts`.

**Partners** (sponsor / creator):
- Stored and emitted as **PULSE-2C's `SponsorCampaignRecord` / `CreatorRecord`**.
- `src/lib/admin/pulse/partnerContract.ts` mirrors #153's `partner-contract.ts` (head bde8e29e) **verbatim**. Both mirrored blocks were checked byte-identical against that blob.
- `partnerContract.sync.test.ts` compares them automatically as soon as #153's file is in the tree; until then it reports *skipped*.
- At integration, the mirror becomes `export type { … } from "@/features/academy-pulse/content/partners/partner-contract"`.

**v1 → v2 mapping** (no competing public fields remain):

| v1 (PR #155 first draft) | v2 | Why |
|---|---|---|
| Editorial items of kind `sponsor` / `creator` | Removed. Partner content lives only in partner records. | One schema per thing |
| `PulseCampaign` (partnerName, title, flight, contractRef) | `SponsorCampaignRecord` fields; `contractRef` becomes the admin-only `note` | 2C owns the record |
| `disclosure: sponsored \| paid-partnership \| affiliate \| unpaid-spotlight` + `disclosureText` | Sponsor: 2C's `disclosure { label: "Sponsored", advertiser = sponsorName }`. Creator: admin-only `compensation: unpaid \| paid \| affiliate`, **never public** | 2C's scene can render only "Sponsored"; a paid-creator disclosure needs the shared-type PR |
| `approval: pending \| approved \| rejected \| ended` | 2C `status: draft \| pending-review \| approved \| paused \| ended \| rejected` + `approval { approvedBy, approvedAt }` | 2C's statuses |
| Public `{ item, disclosure }` sibling envelope | Public `partners: { creators: CreatorRecord[], sponsors: SponsorCampaignRecord[] }`, fed to 2C's `adaptPartnerContent` | 2C's adapter is the single presentation validator |
| Contract `pulse-admin/1`, `pulse-public/1` | `pulse-admin/2`, `pulse-public/2` | Breaking; nothing consumed v1 |

What the database adds on top of 2C's rules:
- **Workspace-only columns** (`compensation`, `note`, `decisionNote`, `revision`). They never appear in the public read.
- **Owner-editable keys only.** A save accepts only 2C's owner-editable keys. Status, approval and provenance are server-owned. `live`, `viewerCount` and `challenge` / `score` are **refused**.
- **No owner ids in public.** `approvedBy` and `recordedBy` are emitted as `"owner"`; 2C requires a non-empty string, and the owner's uuid never leaves the database.
- **Global sponsor host allowlist.** The destination host must be on this list *and* in the campaign's own `approvedHosts`. The list is empty by default. Removing a host takes its sponsors off at once.
- **Release gates** (`private.pulse_release_gates`, migration-only, no RPC):
  - `sponsor_disclosure_rendered` and `paid_creator_disclosure_rendered`, both `false`.
  - While a gate is closed, approved sponsors and paid creators **stay in the database**.
  - This implements "rendered disclosure through a separately approved shared-type PR" before the first public sponsor.

**Public read** (`pulse_public_catalogue()`, `pulse-public/2`):

```
{ contractVersion, generatedAt, fallbackToStatic,
  cadence: { slots, maxPromotionsPerCycle, minPromotionGap },  // empty slots → DEFAULT_PULSE_CADENCE
  items: PulseItem[],                                          // editorial, rotation order
  partners: { creators: CreatorRecord[], sponsors: SponsorCampaignRecord[] } }
```

TypeScript type: `PulsePublicCatalogue` in `contract.ts`.

## 3. Owner assurance policy (provisional, command center 2026-10-24)

| Action | Level | Enforced in SQL by |
|---|---|---|
| Emergency disable, or widening partners → managed | trusted | `pulse_admin_set_kill` |
| **Restore after a disable**, or **narrowing managed → partners** | **fresh** | `pulse_admin_set_kill` (`_reexposes`) |
| Editorial / event save and publish | trusted | `pulse_admin_save_item` / `transition_item` |
| Categories, cadence | trusted | `pulse_admin_save_category` / `save_schedule` |
| Partner create, draft edit, submit, reject, pause, end, revise | trusted | `pulse_admin_save_partner` / `transition_partner` |
| **Approve / resume a sponsor** | **fresh** | `pulse_admin_transition_partner` |
| **Approve / resume a paid or affiliate creator** | **fresh** | `pulse_admin_transition_partner` (`pulse_paid`) |
| Approve / resume an unpaid creator | trusted | — (not paid promotion) |
| **Edit an approved or paused sponsor / paid creator**, or switch an approved creator to paid. The edit also sends it back to `pending-review`. | **fresh** | `pulse_admin_save_partner` |
| **Add a sponsor destination host** | **fresh** | `pulse_admin_set_sponsor_host` |
| Remove a sponsor host | trusted | `pulse_admin_set_sponsor_host` |
| Open a release gate | migration only | no RPC exists |

- **trusted** is OWN1 `assert_owner('trusted')`: owner at aal2, or a live trusted-device attestation for this session.
- **fresh** is `assert_owner('fresh_aal2')`: owner at aal2 with an MFA in the last 10 minutes.
- The client side is `src/lib/admin/pulse/policy.ts`. The server repository asks for fresh MFA **before** the call (OWN1.1 `runOwnerAction`), so a fresh action is never sent at trusted level and bounced.
- The UI marks every fresh action with "· fresh code".

**Hardening versus v1.** These actions previously ran at a lower level:
- **restore** was trusted in v1;
- **editing an approved sponsor** was trusted (it did fall back to pending);
- **adding hosts**: there was no allowlist.

Sponsor approval was already fresh in v1 and is unchanged.

## 4. Verification (exact evidence)

**L3: staged SQL in real Postgres.** PGlite, no Docker; OWN1's `is_owner` / `assert_owner` / `log_owner_action` are read verbatim from `supabase/own1-staged`. File `src/lib/admin/pulse/pulseAdminMigration.db.test.ts`, **25/25 pass**. The policy is tested **row by row**:
- Each action runs first as TRUSTED (owner at aal2, MFA 1 h old), and the database must answer `step_up_required` exactly when `policy.ts` says fresh. It then retries as FRESH (MFA 30 s old).
- The DB-required level is asserted equal to the `policy.ts` prediction for every row in §3.
- Access:
  - anon and players are refused on all 5 tables and every admin RPC;
  - `private.pulse_release_gates` is unreadable and unwritable from anon, player and owner;
  - **no one, the owner included, can INSERT, UPDATE or DELETE any table directly**;
  - an unattested aal1 owner must step up.
- Partner contract:
  - forged `status`, `approval`, Twitch `live`, `viewerCount` and challenge `score` are refused;
  - unsafe destinations are refused: `http`, an off-list host, credentials, a port, an IP;
  - so are bad artwork and a disclosure other than "Sponsored".
- A refused fresh attempt changes nothing and writes no audit row.
- Public read:
  - approved sponsors and paid creators stay in the database while their gate is closed;
  - once the gates are opened (simulated as a superuser migration), records come out in 2C's exact key set, with `approvedBy: "owner"` and no uuid, contract reference, compensation or revision;
  - a sponsor outside its flight, or whose host was removed from the allowlist, is not emitted;
  - kill *partners* empties partner records but keeps editorial; kill *managed* empties everything and sets `fallbackToStatic`.
- Every write leaves an audit row, including `kill_restore` and `sponsor_host_add`.
- Rollback removes exactly what the migration added.

**Mutation check.** I removed the restore and paid-approval `fresh_aal2` assertions from the SQL. 10 of 25 cases failed (the policy rows and their dependants). The SQL was then restored.

**L2:**

| Suite | File | Result |
|---|---|---|
| Policy table, editorial validation, partner rules (2C parsing parity: URLs, images, instants, YouTube and Twitch), release gates, projection fed to the real `buildPulseCycle` | `rules.test.ts` | 23 pass |
| Prototype repository logs the level each action would need; the Supabase repository calls `runOwnerAction` at the `policy.ts` level for **all 15 write shapes**; cancelled verification sends nothing; error mapping; refuses a v1 snapshot | `repositories.test.ts` | 9 pass |
| Mirror present; byte-equality runs once #153 lands | `partnerContract.sync.test.ts` | 1 pass, 1 skipped |
| Owner gate: non-owner redirect, step-up, loading, unavailable | `AdminPulsePage.test.tsx` | 5 pass |
| Workspace UI (jsdom), including: the Partners allowlist → fresh approve → release-gate flow; LIVE is not a form field; a bad destination blocks Save; restore marked fresh; the assurance log | `AdminPulseWorkspace.test.tsx` | 8 pass |

Totals: **71 pass + 1 skipped** locally across `src/lib/admin/pulse` and `src/components/admin/pulse`. With the existing `src/features/academy-pulse` suites: 126 pass + 1 skipped.

**Static checks:**
- `tsc -p tsconfig.app.json`: no diagnostics in any new or changed file. The two pre-existing errors on main are unchanged.
- eslint: 0 errors; 3 fast-refresh warnings (a repo-wide pattern).

**Browser:**
- `e2e/admin-pulse/workspace.spec.ts` runs through `.github/workflows/admin-pulse.yml`: GitHub runner, bundled headless Chromium, 1 worker. Artifact: `admin-pulse-evidence`.
- **Not run on this PC** (AGENTS.md).
- **v2 head 1668d137: 8/8 pass** ([run 40092293245](https://github.com/mitcherrman/mogsy/actions/runs/40092293245)). The same job ran vitest (127 pass + 1 skipped, 11 files), the staged-migration location guard and the production build, all green on the GitHub runner.
- The run before it (4429920d) failed 1/8 on a stale spec assertion that still checked the removed editorial sponsor row. The product was not at fault, and the assertion was fixed in 1668d137.
- The v1 head d297a473 had passed 8/8 ([run 40077237138](https://github.com/mitcherrman/mogsy/actions/runs/40077237138)).

## 5. Security notes

1. **UI hiding is not the control.** Every rule above is enforced in SQL. The tables have no write grants or write policies, and the client-side `policy.ts` only decides when to prompt.
2. **The emergency disable stays at trusted** (incident containment). The previous residual risk is closed: a hijacked trusted session could switch content off, but **can no longer switch it back on** (restore is fresh).
3. **Partner presentation stays with 2C's adapter.** The database repeats only the security-relevant checks: allowed keys, https on an approved and allowlisted host, the image source, text limits, the window, and the disclosure label and advertiser.
   - The admin preview uses an approximation of the adapter, always labelled Sample and linking nowhere. It is replaced by `adaptPartnerContent` at integration.
   - A YouTube URL form that 2C accepts but my SQL regex does not is refused at approval: stricter, never looser.
4. **Before the first public sponsor:**
   - the host must be on the allowlist (fresh MFA);
   - the shared-type PR must render the disclosure, and a reviewed migration must open `sponsor_disclosure_rendered`;
   - the owner and legal must sign off the sponsor policy (#140 §6.8).
5. **No owner identifier is public:** `approvedBy` and `recordedBy` are emitted as `"owner"`.
6. **Payload safety.** Owner JSON is returned verbatim, with `id` and `provenance` forced. Scenes render text as React text. Payloads are capped at 16 KB.

## 6. Integration steps for the command center (none done here)

1. **Route (Studio):** add `/admin/pulse` → `src/components/admin/pulse/AdminPulsePage.tsx` (lazy) inside the AdminShell routes in `src/App.tsx`, plus an `admin-registry.ts` tool entry in the **Studio** area. `AdminPulsePage` already wraps itself in `AdminRoute`. **Not mounted** until integration and release certification.
2. **#153 first, then this PR:**
   - replace `partnerContract.ts`'s mirrored blocks with a type re-export from 2C's file; the sync test then runs, and tsc proves identity;
   - swap `partnerPreviewItem` for `adaptPartnerContent`.
3. **Migration (L3 gate):**
   - Review `supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql`.
   - Confirm OWN1 is present in production: `assert_owner` with `fresh_aal2`, `is_owner`, `log_owner_action`, and `admin_audit_log.aal` / `session_id`.
   - Copy the file into `supabase/migrations/<timestamp>_pulse_admin_workspace.sql` in a dedicated PR.
   - Apply in a quiet window and re-run the §4 assertions against the live schema.
   - Only then set `VITE_PULSE_ADMIN_STORAGE=server`.
4. **PULSE-2A provider:**
   - Read `pulse_public_catalogue()`.
   - Merge `items` with the static editorial set, or serve the static set alone when `fallbackToStatic` is set.
   - Pass `partners` to 2C's `adaptPartnerContent`.
   - Use `cadence.slots` when it is non-empty.
5. **Shared-type PR (2A/2B/2C):** render sponsor disclosure (and a paid-creator disclosure field in `CreatorRecord`). Ship it with a migration that opens the matching release gate.

## 7. Files

New only. No shared file is modified (`AcademyPulse.tsx`, `pulse-types.ts`, `pulse-cadence.ts`, `pulse-provider.ts`, `App.tsx`, `supabase/migrations/**`, and 2C's `content/partners/**`).

- `src/lib/admin/pulse/`:
  - `contract`, `partnerContract` (mirror), `policy`, `partnerRules`, `lifecycle`, `validation`, `projection`
  - `repository`, `memoryRepository`, `supabaseRepository`, `serverClient`
  - `prototypeSeed`, `templates`, `usePulseWorkspace`
  - tests: `rules`, `repositories`, `partnerContract.sync`, `pulseAdminMigration.db`
- `src/components/admin/pulse/`:
  - `AdminPulsePage`, `AdminPulseWorkspace`
  - `PulseContentPanel`, `PulseItemEditor`, `PulsePayloadFields`
  - `PulseCadencePanel`, `PulsePartnersPanel` (replaces `PulseCampaignsPanel`), `PulsePreviewPanel`, `PulsePresentation`
  - `PulseEmergencyControl`, `PulseStatusBadge`, `fields`
  - tests: page and workspace
- `supabase/pulse-p2b-staged/migrations/01_pulse_admin_workspace.sql`, `rollback/01_pulse_admin_workspace_rollback.sql`
- `e2e/admin-pulse/` (`harness.html`, `harness.tsx`, `workspace.spec.ts`), `playwright.admin-pulse.config.ts`, `.github/workflows/admin-pulse.yml`
- This document

## 8. Open questions for the owner

1. Should an **event** with a paid tie-in, such as a sponsored tournament, be modelled as a sponsor record rather than editorial? Under the current policy, editorial and event publication are trusted.
2. Where should owner-uploaded sponsor art be hosted? Today it must be a same-origin path or `i.ytimg.com` (2C's default image hosts).
3. **2C's open questions** (#153 handoff §7): creator consent, disclosure wording, the number of concurrent campaigns (2C's adapter allows 1), and the 92-day flight cap.
