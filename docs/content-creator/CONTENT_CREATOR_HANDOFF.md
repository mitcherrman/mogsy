# CC1 — Content Creator in production Admin: architecture audit

Status: **READ-ONLY AUDIT COMPLETE. Nothing implemented.**
Audited tree: `origin/main` @ `e931bc1a` (2026-10-22), in worktree
`.worktrees/content-creator-cc1-audit` on branch `docs/content-creator-cc1-audit`
(this file is the only change; uncommitted).

> The primary checkout (`docs/combat-v4-visual-prep`) is **761 commits behind
> `origin/main`** and was not used for any finding. It was not touched.

Legend: **[V]** verified in code on `origin/main` · **[D]** stated in a repo doc,
not independently re-verified · **[I]** inference / assumption.

---

## 1. Objective and existing system inventory

### Objective

The owner, signed in on `https://mogzy.lol`, opens an owner-only Admin page and
can: choose approved questions → pick a post mode (classic, single-question,
answer-reveal, multi-question challenge, daily package) → generate → preview
every slide → download single PNGs or a ZIP → revisit previous runs. No local dev
server and no command line.

### Headline finding

**Most of this already exists in production, in the browser.** CON1 shipped a
browser exporter that mounts the production render harness in a format-sized
iframe and rasterises it with SVG `foreignObject` — no Chromium, no server
(`docs/CON1_ADMIN_EXPORT.md`, "PUBLISHED AND VERIFIED" [D]; code [V]). It
already runs in `/admin/quiz-content` behind owner auth, with the presentation
and asset gates, and downloads one PNG or a CLI-layout ZIP.

What the browser path does **not** yet do — and what the local Content Studio
does — is: multi-question challenge, daily package, difficulty badges, in-page
slide preview, manifest/contact sheet, and run history. All of those are built
from **pure, browser-safe modules** that already exist. So the first production
version is an extension of the shipped browser exporter, not a new server.

### Inventory

| Layer | File(s) | What it is | Runs in prod today? |
|---|---|---|---|
| Render harness | `src/pages/dev/quiz-render/QuizRenderPage.tsx` (+ `ContentSlides.tsx`, `QuizCta.tsx`, `RecipeVisual.tsx`, `DifficultyBadge.tsx`) | The ONE composition. Reads questions only from `window[QUIZ_RENDER_WINDOW_KEY]` (`QuizRenderPage.tsx:138`), never fetches them. URL params: `q, state, format, answerIndex, scale, slide, difficulty, progress, repeat, mid, qids, sumStart, sumPage, sumPages` (`:1235–1250`) [V] | Yes, lazily (route `/dev/quiz-render` is public but inert; also dynamically imported by the exporter) |
| Playwright engine | `scripts/quiz-screenshots/generate.ts` (`runGeneration`, `runDailyPackage`), `capture.ts` (`launchBrowser`, `captureOne`), `server.ts` (`ensureServer` spawns `npx vite`), `source.ts` (`loadQuestions`) | Deterministic authority: capture + QA sweep (console/page errors, failed requests, overflow, cross-state layout gates), reports, manifest | No — local only. Playwright is a devDependency [V] |
| CLI | `scripts/quiz-screenshots/index.ts` | Thin wrapper over `runGeneration`; `--finalize-run` recovery | No |
| Local studio server | `scripts/content-studio/server.ts`, `runs.ts` | Loopback HTTP API on 127.0.0.1:8790; one in-memory job (`jobs` Map, `activeJobId`, 409 on second POST); filesystem run history; JSZip ZIP; rooted file serving | No — and must not be exposed (binds loopback, CORS loopback-only, uses `X-Admin-Key`) |
| Local studio UI | `src/pages/dev/content-studio/ContentStudioPage.tsx` (969 lines), `src/lib/content-studio/api.ts` | Receives Admin handoff, reorder, mode/challenge/daily composition, featured ★, generate, job log, `RunPreview`, run history, per-image + ZIP download | Route `/dev/content-studio` ships to prod **ungated** (`App.tsx:885`) but is inert: it talks only to a loopback base [V] |
| Browser exporter | `src/lib/quiz-screenshot/browserCapture.ts`, `runBrowserExport.ts`, `exportPlan.ts`, `deliverExport.ts` | Element → PNG via foreignObject; iframe per format; zoom envelope; gates; PNG/ZIP delivery | **Yes** |
| Admin surface | `src/pages/admin/AdminQuizWorkspace.tsx` → `AdminQuizReview.tsx` (2039 lines) → `src/components/admin/GenerateContentPanel.tsx` (976 lines) | Discovery, filters, readiness, selection; Generate Content panel with Export + Developer tools (copy command / open local workspace) | **Yes**, `/admin/quiz-content` |
| Handoff | `src/lib/content-handoff/schema.ts`, `location.ts` | Admin → Studio selection/config payload (`validateContentHandoff`, `studioJobBodyFromHandoff`) | Yes (link/copy) |
| Broadcast | `src/pages/admin/AdminQuizBroadcast.tsx`, `src/components/quiz-broadcast/ShortsPanel.tsx` | Live/video broadcast + Shorts playlist from **public** `quizApi.getPlaylist`. Not part of the screenshot pipeline; no reuse beyond the `quizApi` client [V] | Yes |
| Parity QA | `scripts/quiz-screenshots/verify-browser-export.ts`, `visual-qa-fixture.json` | Browser export vs `captureOne`, pixel diff, 17 cases + behaviour checks | Local QA tool |

Export formats [V] (`src/lib/quiz-screenshot/formats.ts`): social kind —
`mobile-social` 1080×1350, `vertical` 1080×1920, `square` 1080×1080,
`landscape` 1200×675; audit kind (device-viewport captures) — browser export
refuses these by design (`exportPlan.ts:75–80`).

Modes [V] (`studio-request.ts` `STUDIO_MODES`): `classic`, `single-question`
(2 slides), `answer-reveal` (3 slides), `multi-question` (opening + N questions
+ paginated answers + ending; N = 2–10), `daily-package` (three runs via
`expandDailyPackage`, `challenge.ts:221`).

---

## 2. Reusable files and interfaces

All of `src/lib/quiz-screenshot/*.ts` is browser-safe: **no module imports
`node:*`** (grep of non-test files returned none) [V].

| Reuse as-is | Interface |
|---|---|
| `challenge.ts` | `expandChallenge({questionCount, repeatVariant, midCtaVariant}) → ChallengeSlideSpec[]`; `expandDailyPackage(prefix, opts) → DailyPackagePost[]`; `CHALLENGE_MIN/MAX_QUESTIONS`, `REPEAT_COPY_VARIANTS`, `MID_CTA_VARIANTS` |
| `content-posts.ts` | `expandPost(post)`, `POST_TYPES`, `isPostType` |
| `paths.ts` | `runDirName`, `questionSlug`, `slideFileName`, `screenshotFileName` — the filename authority |
| `difficulty.ts` | `resolveQuestionDifficulty(metadata, override)`, `DIFFICULTY_TIERS` |
| `manifest.ts` | `buildRunManifest`, `manifestSourceEntry`, `parseRunManifest`, `RUN_MANIFEST_VERSION = 1` |
| `contact-sheet.ts` | `buildContactSheet` (pure HTML string, escapes input) |
| `studio-request.ts` | `validateStudioJob(body)`, `RUN_ID_RE`, `QUESTION_ID_RE`, `STUDIO_PLATFORMS` — reuse as the client-side config validator and, later, the server job validator |
| `readiness.ts`, `presentationGate.ts`, `assetGate.ts` | Readiness preflight and fail-closed gates (overrides stay CLI-only) |
| `adapt.ts` | `adaptScreenshotQuestion(s)` — review row → `RenderQuestion` |
| `browserCapture.ts` | `buildCaptureStyleBundle()`, `captureStageToPng(stage, bundle)` |
| `deliverExport.ts` | `downloadBlob`, `deliverExportedFiles(files, zipName)` |
| `content-handoff/schema.ts` | Admin selection → studio config, already validated, forbids credential/backend/override keys (`forbiddenKeysIn`) |
| `src/lib/quiz/api.ts` | `quizApi` admin review reads via `adminRequest` (Supabase Bearer only, `:318`) — `/api/quiz/admin/review/questions[/:id]`, `/universe`, `/universe/item?review_key=`, `/packs` |

| Extend (small, additive) | Change needed |
|---|---|
| `exportPlan.ts` `ExportCard` / `buildExportPlan` | Add `extraParams?: Record<string,string>` and `difficulty?: DifficultyTier`; add a `challenge` branch built from `expandChallenge` mirroring `generate.ts:193 challengeJobs` (anchor non-quiz slides on Q1, `qids/sumStart/sumPage/sumPages` for answers pages, `progress/repeat/mid` for question slides), output dir `challenge/` |
| `runBrowserExport.ts` `harnessUrl` (`:92`) | Forward `extraParams` and `difficulty` to the URL (the harness already reads them). Zoom envelope key must stay per question+format, matching `generate.ts` (challenge slides fit independently) |
| `ContentStudioPage.tsx` | Extract the presentational parts (mode picker, challenge/daily composer, reorder list, `RunPreview`, run list) behind a transport interface so the same UI can drive (a) the loopback API and (b) the in-browser engine. Do not fork it |

| Do NOT reuse in prod | Why |
|---|---|
| `scripts/content-studio/server.ts` | Loopback-only design, `X-Admin-Key` credential, process-memory jobs, filesystem runs |
| `scripts/quiz-screenshots/source.ts` | `X-Admin-Key` reads; production admin routes are account-bound since OWN1 — whether they still accept the key is **unknown** [D/I] |
| `html2canvas` (`useScreenshot`) | Measured 26–41% pixel divergence; not publishable [D] |

---

## 3. Proposed production architecture

### Recommendation: browser-native generation (Tier A), optional server worker later (Tier B)

```
owner browser @ mogzy.lol  ───────────────────────────────────────────────────
 AdminRoute (owner_auth_state RPC, MFA step-up)            [existing gate]
   └─ /admin/content-creator  (new page, AdminShell child)
        ├─ Question picker ── quizApi admin review reads ──► Railway backend
        │     (or intake from /admin/quiz-content handoff)    Authorization: Bearer <Supabase JWT>
        │                                                     owner allowlist enforced server-side
        ├─ Composer: mode · order · ★featured · difficulty · formats · challenge copy variants
        │     validated with validateStudioJob / buildExportPlan (client)
        ├─ Generate ── runBrowserExport (in-tab job)
        │     iframe per format → QuizRenderPage (injected questions) → gates → foreignObject PNG
        │     assets: Railway /assets/* (ACAO:*) ; app /assets/* same-origin
        ├─ Preview: object URLs of produced Blobs, ordered + labelled by slide spec
        ├─ Download: per PNG · ZIP (CLI run layout + manifest.json + index.html contact sheet)
        └─ History: IndexedDB (this device), capped, owner can clear
```

No new server, no new secret, no migration, no Railway change. The only
network calls are ones Admin already makes in production.

**Data flow per job.**
1. Selection → hydrate each id / review key through `quizApi` (owner JWT) →
   `adaptScreenshotQuestions` → readiness preflight (blocking rows block the
   job, never silently dropped — CON1 policy).
2. Config → `buildExportPlan` (extended) → ordered `ExportCard[]`; daily package
   = `expandDailyPackage` → three plans sharing a prefix + `<prefix>-package.json`.
3. `runBrowserExport({plan, questions, onProgress})` → `ExportCardOutcome[]`.
   A job is a single in-tab async task with a cancel flag; one active job per
   tab (mirrors the server's 409 rule).
4. Build `manifest.json` with `buildRunManifest` (recording
   `generator: "browser-export"` vs Playwright, so provenance is honest) and
   contact sheet with `buildContactSheet`.
5. Persist run record + blobs to IndexedDB; render previews; deliver.

**Job state model** (reuse the server's vocabulary): `queued | running |
succeeded | succeeded-with-warnings | failed | cancelled`, with per-card
outcomes (`captured | skipped | failed` + reason) and a progress log.

### Tier B (later, only if needed): server-side Playwright worker

Needed only for: the full capture-time QA sweep, audit formats, cross-device /
durable history, or unattended batch generation.

```
Admin page ─► Edge Function content-jobs (requireOwner 'aal2', validateStudioJob, rate limit)
              └─ insert content_jobs row (status=queued)          [Supabase, migration]
Worker (separate Railway service, NOT `web`) ─ claims row (FOR UPDATE SKIP LOCKED / lease)
              ├─ runGeneration / runDailyPackage (same engine, unchanged)
              ├─ question reads: owner-equivalent service credential to Railway admin API
              └─ uploads PNG/ZIP/manifest ─► private bucket content-exports/<job>/...
Admin page ◄─ polls job row (RLS: owner only) ◄─ signed URLs (short TTL) for preview/download
```

Constraint from `ensureServer`: the worker must serve the render harness itself
(a `vite build` + static server inside the worker image, or point `baseUrl` at
the production origin's `/dev/quiz-render`, which is public and inert). Daily
package currently assumes a local dev server; this is a real porting task.

---

## 4. Hosting and storage requirements

### Verified facts [V unless marked]

- Frontend is Lovable-hosted static Vite build; no Dockerfile/Procfile/railway.json/vercel/netlify/`_headers` in this repo.
- `VITE_COMBAT_API_URL` in `.env` = the Railway `web` service; it is the only external API base.
- Admin backend calls use the **Supabase access token** only (`src/lib/admin-auth/adminCredentials.ts`, `quiz/api.ts:310–320`); no static admin key exists in the browser in production.
- `AdminRoute` → `useOwnerAuth()` → RPC `owner_auth_state` (fails closed) with MFA step-up; Railway pages additionally use `AdminAuthGate` → `GET /api/admin/session`.
- Admin nav is described in `src/lib/admin/admin-registry.ts` (`ADMIN_NAV_AREAS`, `ADMIN_TOOLS`, test-checked against `App.tsx`); entry `content-post-studio` (area `studio`, section `video-social`) currently points at `/dev/content-studio` with "no route gate".
- No CSP header or meta in the app; nothing restricts `connect-src`/`img-src` today.
- Supabase: no jobs/runs/exports tables, no content bucket, no `pg_cron`. Buckets: `profile-photos` (public), `animation-assets`, `champion-images` (private), `feedback-evidence` (private, 5 MB, image MIME list).
- Edge functions all `verify_jwt = false` and self-authenticate; `_shared/owner.ts requireOwner(req, level)` exists (levels `trusted | aal2 | fresh_aal2`).
- Only rate limiter in edge functions: in-memory per-isolate Map in `admin-get-emails` (10/min/user) — not durable.
- Playwright is a devDependency; nothing deployed runs Chromium. No GitHub workflow runs `quiz:screenshots`; workflows use no `secrets.*`.
- Question bank lives on Railway, not Supabase.

### From docs, not re-verified [D]

- CON1 browser export is live in production and was bundle-verified; owner's signed-in production spot-check was still outstanding at the time (`CON1_ADMIN_EXPORT.md` "What still needs an owner-authenticated check").
- Railway `/assets/*` sends `Access-Control-Allow-Origin: *` (required for foreignObject inlining of backend images).
- Railway `web`: single replica, SQLite on a volume; replicas / `--workers > 1` unsafe (`CAPACITY_LAUNCH_HANDOFF.md`, untracked file in the stale checkout). `web` is ≥99.9% of Railway spend and memory has risen (`COST1_HANDOFF.md`, untracked).
- OWN1 owner edge functions' deployment pending the `OWNER_USER_ID` secret (`docs/OWN1_OWNER_CONTROL_PLANE.md`).

### Assumptions [I]

- Supabase Edge Functions (Deno isolates) cannot run Chromium — treated as a hard constraint, per the brief.
- Adding Chromium to the `web` service would raise its memory footprint and risk the single-replica SQLite authority; a Tier B worker must be a **separate** service.
- foreignObject fidelity has only been measured in Chromium (the parity harness drives Playwright Chromium). Firefox/Safari, and mobile browsers, are **unverified**. Tier A should be declared "desktop Chrome/Edge supported" until measured.
- Browser memory: a 10-question challenge × 4 formats ≈ 13 slides × 4 = 52 PNGs at ~1.5 MB (CON1 measured 6.1 MB for 4 cards) ≈ 80 MB of blobs; a daily package across 4 formats ≈ 100 MB. Feasible on desktop; IndexedDB quotas usually allow it but can evict.

### Tier requirements

| | Tier A (browser) | Tier B (worker) |
|---|---|---|
| Hosting | none new | new Railway service with Chromium (owner action) |
| Storage | IndexedDB, this device | private Supabase bucket `content-exports` (or R2) |
| Jobs | in-tab | `content_jobs` table + lease/claim |
| Secrets | none | worker → Railway admin read credential; worker → Supabase service role |
| Migrations | none | table + bucket + RLS (owner applies via Lovable) |
| Railway access by Claude | **not needed** | needed by the owner, not by Claude |

---

## 5. Implementation phases

Each phase lands as its own branch + PR; owner publishes via Lovable.

**CC2 — Engine parity in the browser (pure + runner).** Depends on: nothing.
- Extend `ExportCard` with `extraParams` + `difficulty`; `buildExportPlan` gains `mode: "classic"|"single-question"|"answer-reveal"|"multi-question"` and challenge options; add `buildDailyPackagePlans` over `expandDailyPackage`.
- `harnessUrl` forwards the new params; zoom envelope semantics match `generate.ts`.
- `buildBrowserRunManifest` adapter over `buildRunManifest`; contact sheet via `buildContactSheet`; ZIP includes both.
- Accept: plan output for every mode equals (file paths, order, params) what `challengeJobs`/`classicAndPostJobs` produce for the same input — asserted by a test that runs both; parity harness extended with ≥1 challenge case (opening, Qn, answers-1/2 pagination, ending) and a daily package, all dimensions exact, aligned Δ within CON1's measured band; existing CON1 tests unchanged.

**CC3 — Owner Admin page.** Depends on CC2.
- New route `/admin/content-creator` under the `/admin` `AdminShell` parent (inherits `AdminRoute`), wrapped in `AdminAuthGate` like `/admin/quiz-content`; lazy via `route-prefetch.ts`; registry entry in `admin-registry.ts` (repoint `content-post-studio`, keep the loopback workspace as a Developer tool).
- Shared Studio UI extracted from `ContentStudioPage` behind a `StudioTransport` interface (`loopback` | `browser`); intake from the existing handoff (in-app navigation from `GenerateContentPanel` instead of the loopback link) and a minimal picker over `quizApi` review list.
- Accept: non-owner → redirect; owner on unknown device → step-up; all five modes generate, preview in order, download PNG and ZIP; blocked question blocks the job with its reason; no request to 127.0.0.1; no new env var; `/admin/quiz-content` behaviour unchanged.

**CC4 — History and recovery.** Depends on CC3.
- IndexedDB store: `runs` (manifest, outcomes, created_at, size) + `files` (blobs). Cap (e.g. 20 runs / 500 MB, oldest evicted, owner-visible); "clear history"; resume-safe: a run interrupted by tab close is marked `failed: interrupted`; "retry failed cards" re-runs only failed/skipped-by-error cards into the same run.
- Accept: reload preserves runs; eviction works; storage-denied (private mode) degrades to "no history" with a banner, generation still works.

**CC5 (optional) — Durable cloud history without Chromium.** Depends on CC4 + owner applying a migration.
- Private bucket `content-exports` (owner-only RLS via `is_owner()`), table `content_runs` (manifest JSON, file list, created_by, expires_at); browser uploads the produced PNGs/ZIP; signed URLs for cross-device preview; scheduled cleanup (TTL e.g. 30 days) via an owner-gated edge function invoked manually or by cron.
- Accept: RLS denies anon/other users (tested); objects never public; cleanup verified.

**CC6 (optional) — Tier B Playwright worker.** Depends on owner provisioning a Railway service; Claude cannot do this.
- Accept: identical PNGs to CLI for the parity fixture; job claim is exactly-once under two workers; job timeout + lease expiry recover crashed jobs; worker never shares the `web` process.

---

## 6. Security and operational risks

| Risk | Severity | Mitigation |
|---|---|---|
| Exposing `scripts/content-studio/server.ts` publicly | High | Never. Tier A has no server. |
| Generation becoming public | High | Route under `AdminRoute` + `AdminAuthGate`; question reads already owner-enforced on Railway. Generation itself runs in the owner's tab, so it cannot be invoked by others. |
| `/dev/content-studio` and `/dev/quiz-render` ship ungated (`App.tsx:884–885`) | Low (inert: no data, loopback-only API) | CC3 should gate `/dev/content-studio` behind `AdminRoute` or `import.meta.env.DEV`; leave `/dev/quiz-render` public only if Tier B uses it, otherwise owner-gate it too. |
| Secrets in the browser | — | Tier A uses only the owner's own Supabase session. Handoff schema already rejects credential keys. |
| Gate overrides leaking into UI | Medium | Keep `allowIncompletePresentation`/`allowMissingAssets` false; no control. Test it. |
| Fidelity on non-Chromium browsers | Medium | Detect and warn; measure Firefox/Safari before claiming support. |
| Browser memory / long jobs | Medium | Stream blobs to IndexedDB per card; cap N×formats; cancel button; one job per tab. |
| Asset CORS regression on Railway | Medium | Gate already fails a card whose image did not load; surface clearly. Add a preflight check in the page. |
| Abuse/rate of backend reads | Low | Owner-only; batch hydration with `MAX_BATCH_LIMIT`; client throttle. |
| Tier B: worker credential scope | High (Tier B only) | Dedicated read-only credential on Railway; never the owner's JWT; never logged. |
| Tier B: `web` instability if co-hosted | High (Tier B only) | Separate service, mandatory. |
| Untracked docs in stale checkout (CAPACITY/COST) | Info | Facts cited [D]; they are not on `main`. |
| Live data mutation | — | All reads; nothing writes questions, Daily Challenge or the quiz bank. CC5 writes only to new, dedicated objects. |

---

## 7. Tests required

- **Unit (vitest):** extended `exportPlan` for every mode incl. challenge pagination (>6 questions → `answers-1/2`), daily prefix limits, duplicate rejection; equivalence test vs `challengeJobs`/`classicAndPostJobs` (export the job builders or move them into `src/lib` first so both share one); manifest adapter round-trips through `parseRunManifest`; ZIP contents read back (manifest + contact sheet + PNG paths).
- **Runner:** `harnessUrl` carries `progress/repeat/mid/qids/sum*/difficulty`; zoom envelope per question+format.
- **Component:** Admin page gating (non-owner redirect, step-up), blocked-row behaviour, CTA labels derived from the plan, no localhost text on the normal path, cancel, one-job-at-a-time.
- **History:** IndexedDB with `fake-indexeddb`; eviction; storage unavailable.
- **Parity (real browser):** `verify-browser-export.ts` + new challenge/daily cases; must keep 17/17 dimensions, ≥16/17 identical zoom. Per `AGENTS.md`, this runs **on GitHub Actions** (new `workflow_dispatch` job: bundled headless Chromium, one worker, timeout, PNG/diff artifacts uploaded) — never local Edge/Chrome; a local run needs explicit per-run owner approval and bundled headless Chromium only.
- **Registry:** `admin-registry.routes.test.ts` passes with the new route.
- **Baseline:** record the pre-existing failing set before changing anything (CON1 recorded 11: `StructuralReview.test.tsx` ×10, `AdminUsers.phase1.test.tsx` ×1 — re-measure; it may have moved in 761 commits).
- **Production evidence (owner, signed in):** one export per mode on mogzy.lol in desktop Chrome; files opened and dimensions checked.

---

## 8. Current state, completed audit work, exact next task

**Done in CC1:** read the studio server, runs, CLI, generation service,
capture, source, render server, browser exporter, export plan/delivery,
challenge/daily expansion, harness param surface, Admin Quiz Review panel,
broadcast/shorts, admin auth (owner RPC, AdminRoute, AdminAuthGate,
`requireOwner`), admin registry, routes, Supabase functions/buckets/tables,
workflows, env, CSP; and CON1/OWN1 docs. No code changed, no migrations, no
production calls, no Railway access, nothing committed or pushed.

**Blockers:**
- None for Tier A (CC2–CC4).
- CC5 needs the owner to apply a migration via Lovable.
- CC6 needs the owner to provision a separate Railway service and credential — Claude cannot.
- Unverified: whether `/api/quiz/admin/review/*` still accepts `X-Admin-Key` in production (affects the local CLI only, not Tier A).
- The owner's signed-in production check of the CON1 export is not recorded as done — do it before CC3 builds on it.

**Can a working first version ship without Railway access from Claude? Yes** —
Tier A uses only the existing production Admin auth and backend reads.

**Exact next task:** CC2 — browser-engine parity for multi-question and daily
package (see prompt in the final report).
