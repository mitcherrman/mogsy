# Admin capability-preservation ledger

Generated from `src/lib/admin/admin-registry.ts`. Do not edit by hand — run `npx tsx scripts/generate-admin-ledger.ts`.

Every capability inventoried by the Mogzy Admin Atlas carries exactly one disposition. `Lost` is zero.

## Counts

```text
Total capabilities inventoried: 99
Kept:                          36
Moved:                         27
Merged:                        2
Redirected:                    1
Archived:                      8
Developer-only:                10
Deferred but still accessible: 15
Lost:                          0
```

## Ledger

### Overview

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Admin Overview | /admin (legacy 17-tab dashboard shell) | Overview › dashboard — `/admin` | MERGE | `/admin` | Yes — AdminRoute (admin, master_admin) — unchanged. | The legacy dashboard's tabs are redistributed to People, Operations and Arena. The dashboard itself stays reachable at /admin/legacy-dashboard. |
| All Tools | /admin/directory | Overview › all-tools — `/admin/all-tools` | REDIRECT | `/admin/directory` | Yes — AdminRoute + AdminAuthGate — unchanged from /admin/directory. | Sourced from this registry rather than a second hand-written list. Unlike /admin/directory it no longer hides development entries in production builds — it labels them instead. |
| Legacy Admin Directory | /admin/directory | Overview › all-tools — `/admin/legacy-directory` | DEFERRED | n/a | Yes — AdminRoute + AdminAuthGate — unchanged. | DEFERRED — STILL ACCESSIBLE. Kept so this migration deletes nothing. It still hides development entries in production builds, which is exactly the blind spot All Tools fixes. |
| Legacy Admin Dashboard | /admin | Overview › all-tools — `/admin/legacy-dashboard` | DEFERRED | `/admin` | Yes — AdminRoute (admin, master_admin) plus its own user_roles read — unchanged. | DEFERRED — STILL ACCESSIBLE. Every tab it hosts now has a canonical home; this page remains so no capability can be lost to a mis-migration. Retire only with owner approval. |

### People

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Users | /admin → Users tab (page 1) | People › users — `/admin/people?section=users` | MOVE | n/a | Yes — AdminRoute (admin, master_admin); role editing and anonymous purge stay master-gated exactly as before; edge functions and RLS unchanged. | Same AdminUsers component and same isMasterAdmin prop. No second Users interface exists. |
| Profile Browser | /admin → "Directory" tab (AdminProfileDirectory) | People › users — `/admin/people?section=users` | MERGE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Merged under Users as a secondary view rather than a peer tab. Ends the "Directory" naming collision with the tool index. |
| Invite Links | /admin → Invites tab (page 2); also /moderator → Invites | People › roles-access — `/admin/people?section=roles-access` | MOVE | n/a | Yes — AdminRoute (admin, master_admin); invite_links RLS is admin-only — unchanged. | Still also present in /moderator, which is preserved as-is (see the /moderator entry). |
| Custom Links | /admin → Invites → nested AdminCustomLinks | People › roles-access — `/admin/people?section=roles-access` | MOVE | n/a | Yes — Unchanged — the component keeps its own queries and RLS. |  |
| Comment Moderation | /admin → Comments tab (page 2); also /moderator → Comments | People › moderation — `/admin/people?section=moderation` | MOVE | n/a | Yes — AdminRoute (admin, master_admin); comment RLS unchanged. |  |
| User Reports | /admin → Reports tab (page 3) | People › moderation — `/admin/people?section=moderation` | MOVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Surfaced from Overview's attention queue; this remains its canonical home. |
| Moderator Roster & Delete Requests | /admin → Mod Config tab (page 3) | People › moderation — `/admin/people?section=moderation` | MOVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. |  |
| Feedback | /admin → Feedback tab (page 3) | People › feedback — `/admin/people?section=feedback` | MOVE | n/a | Yes — AdminRoute (admin, master_admin); reads through the admin_list_feedback RPC — unchanged. | Per-user feedback also remains inside Users, which is where Admin Users Phase 1 put it. |
| Admin Inbox | /admin → hidden 'notifications' tab, reachable only through the bell icon | People › notifications — `/admin/people?section=notifications` | MOVE | n/a | Yes — AdminRoute (admin, master_admin); admin_notifications RLS unchanged. | Was reachable only via the bell — it now has a normal navigation entry. |
| Push Campaigns | /admin → Push tab (page 2) | People › notifications — `/admin/people?section=notifications` | MOVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Placed beside the admin inbox and explicitly labelled outbound, ending the "Notifications" name collision. |
| Moderator Panel | /moderator | People › moderation — `/moderator` | KEEP | `/moderator` | Yes — AdminRoute (moderator, admin, master_admin) plus its own user_roles read — unchanged. No RLS, role or capability change. | Kept, not dissolved. Narrowing it to the RLS-authorized subset is a visible behaviour change for real moderators and is an owner decision, not a navigation decision. It adopts the shared Admin shell chrome only. |
| Grant Diamonds | /shop — inline user_roles read | People › users — `/shop` | KEEP | n/a | Yes — Inline user_roles read — unchanged. | Kept in place as a contextual affordance. Whether it moves into Users is an owner decision (IA §O.7); it is recorded here so it is no longer invisible. |

### Leaguecraft

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Quiz Content Workspace | /admin/quiz-content | Leaguecraft › questions — `/admin/quiz-content` | KEEP | `/admin/quiz-builder`, `/admin/quiz-review`, `/admin/workspace` | Yes — AdminRoute + AdminAuthGate; backend require_admin — unchanged. | Deliberately NOT split. Builder and Review were consolidated on purpose and the consolidation works; the Ranked Duel tab is additionally cross-linked from Ranked › Question Bank. |
| Quiz Builder | /admin/quiz-content?tab=builder (alias /admin/quiz-builder) | Leaguecraft › questions — `/admin/quiz-content?tab=builder` | KEEP | `/admin/quiz-builder` | Yes — Inherits the workspace gate — unchanged. |  |
| Quiz Review | /admin/quiz-content?tab=review (alias /admin/quiz-review) | Leaguecraft › questions — `/admin/quiz-content?tab=review` | KEEP | `/admin/quiz-review` | Yes — Inherits the workspace gate — unchanged. |  |
| Quiz Reports & Overrides | /quiz/admin | Leaguecraft › reports — `/quiz/admin` | KEEP | `/quiz/admin` | Yes — AdminRoute; backend require_admin for reports — unchanged. | Path kept rather than renamed: it is linked from /quiz/diagnostics and bookmarked. Its onboarding-gate config is additionally cross-linked from Operations › Configuration, which is the only place all three onboarding stores are visible together. |
| Mastery Artifact Reviewer | /admin/mastery/:artifactDigest — direct URL only, no navigation source anywhere | Leaguecraft › mastery — `/admin/mastery` | MOVE | `/admin/mastery/:artifactDigest` | Yes — AdminRoute; backend require_admin — unchanged. | Gains a navigation entry for the first time: a digest lookup form at /admin/mastery that navigates to the existing parameterized route. |
| Mastery Coverage Report | Backend endpoint with no frontend consumer | Leaguecraft › mastery — documented, no UI | DEFERRED | n/a | Yes — require_admin (Railway allowlist bearer or KNOWLEDGE_ADMIN_KEY) — unchanged. | DEFERRED — STILL ACCESSIBLE via the API. Documented here so it stops being invisible. |
| Quiz Diagnostics | /quiz/diagnostics — ungated public URL, listed only in dev builds | Leaguecraft › diagnostics — `/quiz/diagnostics` | KEEP | `/quiz/diagnostics` | Yes — UNCHANGED — the route keeps its current gate. Adding one is an access change and an owner decision (Atlas §N). | Now listed in production builds instead of vanishing, so an operator can find it. Its authorization is untouched. |

### Ranked

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Ranked Overview | GET /api/ranked/launch-readiness — reachable only with curl | Ranked › overview — `/admin/ranked?section=overview` | MOVE | n/a | Yes — AdminRoute + AdminAuthGate; backend require_admin — unchanged. | First operator surface Ranked has ever had. Read-only. |
| Rating Status | GET /api/ranked/rating-status — no UI | Ranked › settings — `/admin/ranked?section=settings` | MOVE | n/a | Yes — backend require_admin — unchanged. |  |
| Ranked Feature Flags | Railway environment variables — visible nowhere in the product | Ranked › settings — `/admin/ranked?section=settings` | MOVE | n/a | Yes — Read-only projection of require_admin data. Railway values are never written from Admin. | Deliberately read-only: making these editable would create a fourth configuration authority. |
| Ranked Question Bank | /admin/quiz-content?tab=ranked-duel — a tab inside the quiz workspace | Ranked › question-bank — `/admin/quiz-content?tab=ranked-duel` | KEEP | n/a | Yes — AdminRoute + AdminAuthGate; backend require_admin — unchanged. | Cross-linked from Ranked rather than re-mounted: the workspace is its working home and splitting it would undo a deliberate consolidation. |
| Staff Duel Creator | /dev/ranked-duel → 'Live staff duel' — an ungated public URL | Ranked › matches — `/dev/ranked-duel` | KEEP | `/dev/ranked-duel` | Yes — UNCHANGED — the route carries no gate today and this reorganization adds none. Gating it is an access change and an owner decision (Atlas §N). | Given a discoverable home under Ranked › Matches with its danger stated. Relocating the route itself would change who can reach it, which is explicitly out of scope. |
| Test Match Creation | Backend endpoint with no frontend consumer | Ranked › matches — documented, no UI | DEFERRED | n/a | Yes — require_admin — unchanged. | DEFERRED — STILL ACCESSIBLE. Documented with its exact contract rather than given a one-click button; a new production-write form is beyond a navigation reorganization. |
| Ranked Bot Matches | No admin surface — RANKED_BOT_ENABLED visible only via launch-readiness | Ranked › matches — `/admin/ranked?section=matches` | MOVE | n/a | Yes — Read-only. POST /api/ranked/bot-matches remains player-authenticated; Ranked Bot user access is untouched. |  |
| Match Inspector | Does not exist | Ranked › matches — documented, no UI | DEFERRED | n/a | Yes — n/a — no endpoint exists. | FUTURE GAP, stated honestly rather than faked. Shared with Playtests session inspection. |
| Queue Inspection | Does not exist | Ranked › overview — documented, no UI | DEFERRED | n/a | Yes — n/a — no endpoint exists. | FUTURE GAP. Launch-readiness reports queue ENABLEMENT, never queue CONTENTS. |
| Playtests | Does not exist — the primitives are scattered across five places | Ranked › playtests — `/admin/ranked?section=playtests` | MOVE | n/a | Yes — AdminRoute + AdminAuthGate — no new capability, no new restriction. | Navigation home only. No allowlist, no cohort mechanism and no restriction on normal Ranked PvP or Ranked Bot is introduced. |
| Lifecycle Worker State | Railway env + the pause file — visible nowhere | Ranked › settings — `/admin/ranked?section=settings` | MOVE | n/a | Yes — Read-only projection of require_admin data — unchanged. |  |

### Simulation

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Combat Sim Battles | /admin/combat-battles | Simulation › battles — `/admin/combat-battles` | KEEP | `/admin/combat-battles` | Yes — AdminRoute; backend require_admin — unchanged. |  |
| Team Simulator | /dev/combat-lab/team-sim — always registered, never linked | Simulation › team-sim — `/dev/combat-lab/team-sim` | MOVE | `/dev/combat-lab/team-sim` | Yes — UNCHANGED — no route gate; the BACKEND requires a verified account. Feature-preview access is unchanged. | Gains its first navigation entry. Same lazy module as the flag-gated public route. |
| Team Sim Configuration Health | Backend endpoint with no frontend consumer | Simulation › team-sim — documented, no UI | DEFERRED | n/a | Yes — require_admin — unchanged. | DEFERRED — STILL ACCESSIBLE via the API. |
| Combat Lab Diagnostics | /combat-lab/diagnostics — ungated public URL, listed only in dev builds | Simulation › combat-lab — `/combat-lab/diagnostics` | KEEP | `/combat-lab/diagnostics` | Yes — UNCHANGED — the route keeps its current gate. Adding one is an access change and an owner decision (Atlas §N). | Now listed in production builds instead of vanishing. |
| Champion Image Upload | /combat-lab → ChampionProfile (inline user_roles read) | Simulation › combat-lab — `/combat-lab` | KEEP | n/a | Yes — Inline user_roles read plus storage RLS — unchanged. | Kept in place as a contextual affordance. Moving it out of the champion profile would make it harder to use, not easier; it is recorded here so it is no longer invisible to an inventory. |
| Stat Check | /quiz/stat-check | Simulation › stat-check — `/quiz/stat-check` | KEEP | `/quiz/stat-check` | Yes — Unchanged — a product surface, listed here for operator reach. |  |

### Game Data

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Champion Knowledge Base | /admin/knowledge | Game Data › knowledge — `/admin/knowledge` | KEEP | `/admin/knowledge` | Yes — AdminRoute roles=['master_admin'] + AdminAuthGate; backend require_admin — unchanged. The React route is master-only and the Python endpoints are admin-flat, exactly as before. |  |
| Knowledge Queue | /admin/knowledge/queue | Game Data › knowledge — `/admin/knowledge/queue` | KEEP | n/a | Yes — Inherits the Knowledge shell gate — unchanged. |  |
| Knowledge Health | /admin/knowledge/health | Game Data › knowledge — `/admin/knowledge/health` | KEEP | n/a | Yes — Inherits the Knowledge shell gate — unchanged. |  |
| Patch Rundown & Intelligence | /admin/knowledge/rundown | Game Data › knowledge — `/admin/knowledge/rundown` | KEEP | n/a | Yes — Inherits the Knowledge shell gate — unchanged. |  |
| Apply History & Undo | /admin/knowledge/history — reachable only from inside the Knowledge shell | Game Data › knowledge — `/admin/knowledge/history` | KEEP | n/a | Yes — Inherits the Knowledge shell gate — unchanged. | Now listed in All Tools; it was absent from the old directory. |
| Combat Integrity Report | Backend endpoint with no frontend consumer | Game Data › knowledge — documented, no UI | DEFERRED | n/a | Yes — require_admin — unchanged. | DEFERRED — STILL ACCESSIBLE via the API. |
| Pro Roster Candidate Review | /api/admin/roster-candidates/* — seven endpoints, zero frontend consumers | Game Data › pro-data — documented, no UI | DEFERRED | n/a | Yes — require_admin — unchanged. | DEFERRED — STILL ACCESSIBLE. Documented with its endpoint list; the workflow is real and may be script-driven. Building its UI is its own task. |
| Pro Roster (published) | /lol/docs/pro/rosters | Game Data › pro-data — `/lol/docs/pro/rosters` | KEEP | n/a | Yes — Public — unchanged. Listed so an operator can verify what the pipeline published. |  |
| Esports Live Feed | /esports/live — a product page, absent from the admin directory | Game Data › esports — `/esports/live` | KEEP | `/esports/live` | Yes — UNCHANGED — a public product page. Listing it changes no access. |  |
| Esports Link Health | Backend endpoint with no frontend consumer | Game Data › esports — documented, no UI | DEFERRED | n/a | Yes — require_admin — unchanged. | DEFERRED — STILL ACCESSIBLE via the API; surfaced from Operations › Health & Jobs. |
| Esports Daily Job | Scheduler-only internal triggers, hidden from OpenAPI | Game Data › esports — documented, no UI | DEFERRED | n/a | Yes — Bearer LIVE_ESPORTS_DAILY_TOKEN — a separate scheduler authority. Unreachable from the browser; unchanged. | DEFERRED — STILL ACCESSIBLE to the scheduler. Documented, deliberately not given a browser trigger. |
| Mechanics Explorer | /lol/mechanics | Game Data › mechanics — `/lol/mechanics` | KEEP | n/a | Yes — Public — unchanged. |  |
| Patch Reports (published) | /lol/patch-reports | Game Data › mechanics — `/lol/patch-reports` | KEEP | n/a | Yes — Public — unchanged. |  |

### Studio

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Blog CMS | /admin/blog | Studio › blog — `/admin/blog` | KEEP | `/admin/blog` | Yes — AdminRoute — unchanged. |  |
| Blog Post Editor | /admin/blog/:id | Studio › blog — `/admin/blog` | KEEP | `/admin/blog/:id` | Yes — AdminRoute — unchanged. | Reached from the list and from the in-context edit link on a published post, which stays. |
| Quiz Broadcast Studio | /admin/quiz-broadcast | Studio › broadcast — `/admin/quiz-broadcast` | KEEP | `/admin/quiz-broadcast` | Yes — AdminRoute — unchanged. |  |
| Broadcast Capture View | /admin/quiz-broadcast/view | Studio › broadcast — `/admin/quiz-broadcast/view` | KEEP | `/admin/quiz-broadcast/view` | Yes — AdminRoute — unchanged. | Deliberately mounted OUTSIDE the Admin shell: adding navigation chrome would break window capture. |
| Broadcast Live View | /broadcast/live-view | Studio › broadcast — `/broadcast/live-view` | KEEP | n/a | Yes — Intentionally public broadcast output — unchanged. |  |
| Quiz Video Export | /admin/quiz-video-export | Studio › video-social — `/admin/quiz-video-export` | KEEP | `/admin/quiz-video-export` | Yes — AdminRoute — unchanged. |  |
| Quiz Render Harness | /dev/quiz-render — listed only in dev builds | Studio › video-social — `/dev/quiz-render` | MOVE | `/dev/quiz-render` | Yes — UNCHANGED — no route gate; inert without injected data. | Produces published assets, so it is administration rather than a prototype. Now listed in production. |
| Content Post Studio | /dev/content-studio — listed only in dev builds | Studio › video-social — `/dev/content-studio` | MOVE | `/dev/content-studio` | Yes — UNCHANGED — no route gate; inert without the local server. |  |
| Stat Graphic Explorer | /dev/graph1 — unlisted everywhere | Studio › graphics — `/dev/graph1` | MOVE | `/dev/graph1` | Yes — UNCHANGED — no route gate; reads the public /api/graph1/* endpoints. | Produces published assets. Gains its first navigation entry. |
| Blog Post Edit Link | /blog/:slug — inline user_roles read | Studio › blog — `/blog` | KEEP | n/a | Yes — Inline user_roles read — unchanged. | A legitimate contextual deep link into the CMS. Kept. |
| Popout Style Toggle | /lol/* — has_role RPC | Studio › graphics — `/lol` | KEEP | n/a | Yes — has_role RPC — unchanged. | A display preference rather than an administrative capability. Kept in place, recorded here. |

### Operations

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Platform Policies | /admin/platform-policies | Operations › configuration — `/admin/platform-policies` | KEEP | `/admin/platform-policies` | Yes — AdminRoute + AdminAuthGate; app_settings RLS enforces the writes — unchanged. | combat_sim_tokens_required_for_non_pro is the one app_settings key the Python backend also reads — the single bridge between the two configuration authorities. |
| App Settings | /admin → Settings tab (page 5, master-only) | Operations › configuration — `/admin/operations?section=configuration` | MOVE | n/a | Yes — Master-only in the UI exactly as before. app_settings RLS admits any admin — that pre-existing mismatch is preserved, not fixed here. |  |
| Onboarding Config | /admin → Onboard tab (page 4, master-only) | Operations › configuration — `/admin/operations?section=configuration` | MOVE | n/a | Yes — Master-only in the UI exactly as before. | One of three onboarding stores. Configuration lists all three side by side with their authority labelled; none is migrated and none is declared authoritative — that is an owner decision. |
| Tutorial Tips | /admin → Tutorials tab (page 3) | Operations › configuration — `/admin/operations?section=configuration` | MOVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Tutorial TIP CONTENT only. The Ranked tutorial and onboarding flows are out of scope and untouched. |
| Banners | /admin → Banners tab (page 2) | Operations › configuration — `/admin/operations?section=configuration` | MOVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Placed in Operations rather than Arena: banners configure the live site, not the retired voting product. |
| Backend Flags (Railway) | Railway environment variables — visible nowhere in the product | Operations › configuration — `/admin/operations?section=configuration` | MOVE | n/a | Yes — Read-only. Railway values are never written from Admin — doing so would create a fourth configuration authority. |  |
| Site Diagnostics | /admin/diagnostics | Operations › health — `/admin/diagnostics` | KEEP | `/admin/diagnostics` | Yes — AdminRoute — unchanged. | Its hardcoded 33-route probe list is stale and predates ten current admin routes. Left as-is: rewriting it is its own task, and All Tools now covers route discovery. |
| Database Status | Backend endpoint with no frontend consumer | Operations › health — `/admin/operations?section=health` | MOVE | n/a | Yes — backend require_admin — unchanged. Read-only. | Surfaced read-only. The restore endpoint on the same router is NOT armed here. |
| Scheduled Jobs | Three /api/internal triggers plus Supabase edge cron — nothing reported whether either ran | Operations › health — documented, no UI | DEFERRED | n/a | Yes — Separate bearer tokens (PATCH_OPS_WATCHER_TOKEN, LIVE_ESPORTS_DAILY_TOKEN). They 503 when unset and 401 otherwise — unreachable from the browser. Unchanged. | DEFERRED — STILL ACCESSIBLE to the scheduler. Documented rather than given a browser trigger. |
| Patch Operations | Backend-only; no frontend has ever existed | Operations › patch-ops — documented, no UI | DEFERRED | n/a | Yes — Backend CLI plus the watcher token. The two-directional production gate refuses before the database opens. Unchanged. | DEFERRED — STILL ACCESSIBLE. Documented so the capability is visible; its published output is linked from Game Data › Mechanics. |
| Analytics Graphs | /admin/data — linked only from the master-only header strip on /admin | Operations › data-ops — `/admin/data` | KEEP | `/admin/data` | Yes — AdminRoute (admin, master_admin) — unchanged. The page always admitted any admin; only the LINK to it was master-only. |  |
| Admin CSV Export | /admin header strip (master-only button) | Operations › data-ops — `/admin/operations?section=data-ops` | MOVE | n/a | Yes — Master-only exactly as before — the same isMasterAdmin gate on the same action. |  |
| Internal Docs | /admin/about | Operations › docs — `/admin/about` | KEEP | `/admin/about` | Yes — AdminRoute — unchanged. | Its §14 route inventory is stale and omits ten current admin pages. Left as-is; All Tools is now the derived inventory of record. |
| Database Restore | Backend endpoint with no UI, no directory entry and no documentation anywhere | Operations › danger-zone — documented, no UI | DEFERRED | n/a | Yes — require_admin. Existing interlocks preserved and unchanged: refuses to clobber a database holding quiz_questions unless ?force=true; optional X-Content-SHA256 aborts before writing on digest mismatch; destination confined to RESTORE_ALLOWED_DEST_DIRS; RESTORE_MAX_UPLOAD_BYTES size ceiling; uploaded file validated before replacement; existing DB backed up first; replacement is atomic. | DEFERRED — STILL ACCESSIBLE via the API. Given a documented home rather than a button: a one-click restore is a different risk profile than a curl command, and no safe UI exists for it. |
| Purge Anonymous Users | /admin → Users → master-only button | Operations › danger-zone — `/admin/people?section=users` | KEEP | n/a | Yes — Master-only button exactly as before; the purge-anonymous-users edge function performs its own role check. Unchanged. | Left inside the Users panel where it lives today rather than duplicated as a second trigger. Danger Zone documents and links it. |

### Developer (Engineering)

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Ranked Arena Inspector | /dev/ranked-arena-inspector | Developer › inspectors — `/dev/ranked-arena-inspector` | DEVELOPER-ONLY | `/dev/ranked-arena-inspector` | Yes — Refuses outside DEV builds — unchanged. | Cross-linked from Ranked; a test asserts it imports no engine or service module. |
| Broadcast Developer Tools | Nested inside /admin/quiz-broadcast with no separate route or label | Developer › harnesses — `/admin/quiz-broadcast` | DEVELOPER-ONLY | n/a | Yes — Inherits the Broadcast Studio gate — unchanged. | Classified as developer tooling and labelled as such. Left mounted where it is: extracting it would be a refactor of the studio, not a navigation change. |
| Ranked Duel Prototype (fixture) | /dev/ranked-duel — fixture mode | Developer › prototypes — `/dev/ranked-duel` | DEVELOPER-ONLY | `/dev/ranked-duel` | Yes — UNCHANGED — no route gate. | Fixture mode is a prototype; the same route's Live mode is production administration and is listed under Ranked › Matches. |
| Ranked Tutorial Prototype | /dev/ranked-tutorial — unlisted | Developer › prototypes — `/dev/ranked-tutorial` | DEVELOPER-ONLY | `/dev/ranked-tutorial` | Yes — UNCHANGED — no route gate, no auth, no API, no persistence. | Classification only. /quiz/tutorial and /onboarding/ranked-tutorial are out of scope and untouched. |
| Stat Check Prototype | /dev/stat-check — unlisted | Developer › prototypes — `/dev/stat-check` | DEVELOPER-ONLY | `/dev/stat-check` | Yes — UNCHANGED — no route gate. | Ambiguous case (Atlas §M): its online rooms touch real state. Classified dev; flagged for owner review. |
| Daily Score Attack Prototype | /dev/daily-score-attack — unlisted | Developer › prototypes — `/dev/daily-score-attack` | DEVELOPER-ONLY | `/dev/daily-score-attack` | Yes — UNCHANGED — no route gate. | Ambiguous case (Atlas §M). Classified dev; flagged for owner review. |
| Mastery Progression Prototypes | /dev/mastery/… ×10 — unlisted | Developer › prototypes — `/dev/mastery/ahri-vs-syndra` | DEVELOPER-ONLY | n/a | Yes — ProtectedRoute — any signed-in user. UNCHANGED. | All ten remain registered and reachable; the index links each one. |
| Legacy Entry Preview | /dev/legacy-entry — unlisted | Developer › prototypes — `/dev/legacy-entry` | DEVELOPER-ONLY | `/dev/legacy-entry` | Yes — UNCHANGED — no route gate. |  |
| Entry Screen Concept | /dev/mogzy-entry-v2 — unlisted | Developer › prototypes — `/dev/mogzy-entry-v2` | DEVELOPER-ONLY | `/dev/mogzy-entry-v2` | Yes — UNCHANGED — no route gate. |  |
| Mechanics XP Inspector | /dev/mechanics/xp — unlisted | Developer › inspectors — `/dev/mechanics/xp` | DEVELOPER-ONLY | `/dev/mechanics/xp` | Yes — Refuses outside DEV builds — unchanged. |  |

### Arena (Archived)

| Capability | Old location | New canonical location | Disposition | Legacy route preserved? | Authorization unchanged? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Collections | /admin → Collections tab (page 1); also /moderator → Collections | Arena › collections — `/admin/arena?section=collections` | ARCHIVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. Also still in /moderator, unchanged. |  |
| League Bots | /admin → Bots tab (page 1); also /moderator → Bots | Arena › collections — `/admin/arena?section=collections` | ARCHIVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. | Renamed "League Bots" to end the name collision with Ranked Bot, which is a different concept entirely. |
| Promoted Leagues | /admin → Promoted tab (page 1) | Arena › collections — `/admin/arena?section=collections` | ARCHIVE | n/a | Yes — AdminRoute (admin, master_admin) — unchanged. |  |
| Themes | /admin → Themes tab (page 4, master-only) | Arena › presentation — `/admin/arena?section=presentation` | ARCHIVE | n/a | Yes — Master-only in the UI exactly as before. |  |
| Arena Ranks | /admin → Ranks tab (page 4, master-only) | Arena › presentation — `/admin/arena?section=presentation` | ARCHIVE | n/a | Yes — Master-only in the UI exactly as before. | Renamed "Arena Ranks" to end the name collision with Ranked tier configuration. |
| Play Layout | /admin/play — linked only from the master-only header strip | Arena › operations — `/admin/play` | ARCHIVE | `/admin/play` | Yes — AdminRoute (admin, master_admin) — unchanged. Its internal moderator branch remains unreachable, exactly as before. |  |
| Gaming Config | /admin/gaming — linked only from the master-only header strip | Arena › operations — `/admin/gaming` | ARCHIVE | `/admin/gaming` | Yes — AdminRoute (admin, master_admin) — unchanged. | Its Aura Check tab is the same component /moderator mounts, and its Multiplayer tab configures a feature whose user routes now redirect. Both preserved. |
| Demo Studio | /admin/demo | Arena › operations — `/admin/demo` | ARCHIVE | `/admin/demo` | Yes — AdminRoute (admin, master_admin) — unchanged. Its moderator and demo_access branches remain unreachable, exactly as before. |  |
| Preset Items Editor (orphaned) | components/admin/AdminPresetItems.tsx — zero imports anywhere in src/ | Arena › collections — documented, no UI | DEFERRED | n/a | Yes — n/a — not mounted anywhere. | DEFERRED — deliberately NOT mounted. It is unreachable today, so mounting it would ADD a capability rather than preserve one. The file is untouched; recorded here so it is no longer invisible. Owner decision. |
| Swipe Staff Ad Override | /swipe-game, /swipe/preset/:id — inline user_roles read | Arena › operations — `/swipe-game` | KEEP | n/a | Yes — Inline user_roles read (admin / master_admin / moderator) — unchanged. | Kept in place; documented so it is visible to an inventory. |

## Route migration table

| Old route | Disposition | Resolves to |
| --- | --- | --- |
| `/admin` | MERGE | /admin |
| `/admin/directory` | REDIRECT | /admin/all-tools |
| `/admin` | DEFERRED | /admin/legacy-dashboard |
| `/moderator` | KEEP | /moderator |
| `/admin/quiz-builder` | KEEP | /admin/quiz-content |
| `/admin/quiz-review` | KEEP | /admin/quiz-content |
| `/admin/workspace` | KEEP | /admin/quiz-content |
| `/admin/quiz-builder` | KEEP | /admin/quiz-content?tab=builder |
| `/admin/quiz-review` | KEEP | /admin/quiz-content?tab=review |
| `/quiz/admin` | KEEP | /quiz/admin |
| `/admin/mastery/:artifactDigest` | MOVE | /admin/mastery |
| `/quiz/diagnostics` | KEEP | /quiz/diagnostics |
| `/dev/ranked-duel` | KEEP | /dev/ranked-duel |
| `/dev/ranked-arena-inspector` | DEVELOPER-ONLY | /dev/ranked-arena-inspector |
| `/admin/combat-battles` | KEEP | /admin/combat-battles |
| `/dev/combat-lab/team-sim` | MOVE | /dev/combat-lab/team-sim |
| `/combat-lab/diagnostics` | KEEP | /combat-lab/diagnostics |
| `/quiz/stat-check` | KEEP | /quiz/stat-check |
| `/admin/knowledge` | KEEP | /admin/knowledge |
| `/esports/live` | KEEP | /esports/live |
| `/admin/blog` | KEEP | /admin/blog |
| `/admin/blog/:id` | KEEP | /admin/blog |
| `/admin/quiz-broadcast` | KEEP | /admin/quiz-broadcast |
| `/admin/quiz-broadcast/view` | KEEP | /admin/quiz-broadcast/view |
| `/admin/quiz-video-export` | KEEP | /admin/quiz-video-export |
| `/dev/quiz-render` | MOVE | /dev/quiz-render |
| `/dev/content-studio` | MOVE | /dev/content-studio |
| `/dev/graph1` | MOVE | /dev/graph1 |
| `/admin/platform-policies` | KEEP | /admin/platform-policies |
| `/admin/diagnostics` | KEEP | /admin/diagnostics |
| `/admin/data` | KEEP | /admin/data |
| `/admin/about` | KEEP | /admin/about |
| `/dev/ranked-duel` | DEVELOPER-ONLY | /dev/ranked-duel |
| `/dev/ranked-tutorial` | DEVELOPER-ONLY | /dev/ranked-tutorial |
| `/dev/stat-check` | DEVELOPER-ONLY | /dev/stat-check |
| `/dev/daily-score-attack` | DEVELOPER-ONLY | /dev/daily-score-attack |
| `/dev/legacy-entry` | DEVELOPER-ONLY | /dev/legacy-entry |
| `/dev/mogzy-entry-v2` | DEVELOPER-ONLY | /dev/mogzy-entry-v2 |
| `/dev/mechanics/xp` | DEVELOPER-ONLY | /dev/mechanics/xp |
| `/admin/play` | ARCHIVE | /admin/play |
| `/admin/gaming` | ARCHIVE | /admin/gaming |
| `/admin/demo` | ARCHIVE | /admin/demo |
