# SC_RENAME1 Handoff — Retired Stat Check namespace evacuation (AUDIT ONLY)

Status: audit complete. No code, DB, routes, tests or docs were changed. Only this file was created.
Audited: main checkout (`mogsy`, HEAD 30b75cbe). `.worktrees/*` are other branches and were not audited or counted.

## 1. Objective
Free the "Stat Check" namespace from the OLD card-duel game so Meta Reflex (`meta_reflex` internal) can later take the user-facing name "Stat Check". Preserve the old game. This task = audit + plan only.

## 2. What the OLD Stat Check is
A League champion stat-card tabletop duel (see `STAT_CHECK_CLAUDE_HANDOFF.md`, `STAT_CHECK_HUMAN_PLAYTEST.md`):
- Shared champion draw pile, 6-card hands, 3 category lanes per round, play 3 / preserve 3, HP-based damage (board wins, sweep, decisive category), items, damage-reveal animations.
- Modes: local bot game, private online rooms (2 seats, invite code), friend invites, locked "Online Queue" placeholder.
- Client engine: `src/pages/dev/stat-check/statCheckEngine.ts`. Online play goes through a **separate backend** (`VITE_COMBAT_API_URL`, `/api/stat-check/*`, FastAPI-style `detail.code`). Backend source is NOT in this repo (no .py hits) — its contract is external.

## 3. Is it still live / executing?
- **Routes still mounted** (`src/App.tsx:644-648`): `/dev/stat-check`, `/quiz/stat-check`, `/quiz/stat-check/bot`, `/quiz/stat-check/private`, `/quiz/stat-check/room/:inviteCode`. Lazy-loaded, reachable by URL. Admin registry lists them.
- **Hub entrance withheld**: `HUB_MODULES.statCheck = false` (`Quiz.tsx:142`); removed from `/lol` hub. So "retired" = hidden from nav, not unmounted.
- **Still executing globally**: `useStatCheckInvites` is called from `MogzyIdentityMenu.tsx` (HUD) and polls `GET /api/stat-check/invites` for signed-in users (docs record a known `403 /api/stat-check/invites` in prod). `FriendActionMenu` "Invite to Stat Check" is enabled by `canInviteToStatCheck` (FloatingFriendsButton, UserProfile). Layout/Footer/feedback categorisation special-case its paths.
- Meta Reflex does NOT import any old Stat Check code. Overlap is only in comments/tests/hub flags (Quiz.tsx, Quiz.metaReflex.test, Quiz.hub.test, LolHub, feedback contract).

## 4. Occurrence inventory (~116 files w/ matches in main; ~4,600 lines incl. tests)

### A. Definitely OLD Stat Check
| Area | Paths |
|---|---|
| Game dir (33+ files, incl. `online/`, `diagnostics/`, 8 golden transcript JSONs) | `src/pages/dev/stat-check/**` — `StatCheckPage.tsx` (~4k lines), `statCheckEngine.ts`, `StatCheckItems/Tooltip.tsx`, `damage*`, `animation*`, `matchSummary`, `handCardStats`, `items`, `fixtureDeck`, `fanLayout`, `statCategoryIcons`, `online/{StatCheckRoomPage,useStatCheckRoom,useStatCheckMatch,onlineMatchModel}` |
| Public shell | `src/pages/stat-check/{StatCheckModeSelectPage,StatCheckBotPage}.tsx` (+tests). BotPage imports `../dev/stat-check/StatCheckPage` |
| Online client/contracts | `src/lib/stat-check-online/{client,contracts}.ts` (+ contracts/inviteContracts tests) |
| Hook | `src/hooks/useStatCheckInvites.ts` (+test) |
| Assets | `src/assets/stat-check/{board,stats}/*` (9 PNGs, imported by 4 files) |
| Routing/tests | `src/App.tsx:185-191,644-648`, `src/App.statCheckRoutes.test.ts` |
| UI hooks | `FriendActionMenu.tsx` (+invite test), `FloatingFriendsButton.tsx`, `UserProfile.tsx` (`canInviteToStatCheck`), `hud/MogzyIdentityMenu.tsx` (+ ~9 test files), `Layout.tsx` (`isStatCheckSurface`, `/dev/stat-check`, `/quiz/stat-check`), `Footer.tsx`, `useSocialSync.ts`, `community-badge.ts`, `social-result.ts` (`SC_INVITE_BLOCKED`), `rankedInvite.ts` (comments) |
| Config | `tailwind.config.ts` (comments on 4 keyframes; keyframe/animation names to verify), `Quiz.tsx` (`statCheck` flag, `hub-stat-check-*` testids, `/quiz/stat-check` link) |
| Admin | `src/lib/admin/admin-registry.ts` (ids `stat-check`, `dev-stat-check`, section `stat-check`, titles, legacyRoutes) |
| Feedback | `src/lib/feedback/contract.ts:137,162` (category `"Stat Check"`, route map `/quiz/stat-check`) + tests, diagnostics/report-context (comments + tests using `/quiz/stat-check/room`) |
| Root docs | `STAT_CHECK_CLAUDE_HANDOFF.md`, `STAT_CHECK_HUMAN_PLAYTEST.md` |
| Internal ids | `sc-*` data-testids (`sc-room-*`, `sc-online-*`), CSS vars `--sc-*`, keyframes `sc-drift/core-pulse/flow/verdict`, seeds `sc-golden:*`, sessionStorage key `stat-check-animation-speed`, `.gitignore` `roster.local.json` comment |

### B. Unrelated / generic phrase
Comments only: `PatchDataStatusNotice.tsx:9` (lists modes computed by patch data), `QuestionTimeline.test.tsx:35` (test-flakiness comment), `hub-guide.ts:17`, `AcademyTome.tsx:18` (art comment), `LolHub.tsx` comments. No true generic "stat check" usages found in product copy.

### C. Ambiguous — investigate in Phase 1 first
1. **Feedback category `"Stat Check"`** (`feedback/contract.ts`) — stored as a value in DB `feedback` tables (migrations `20260812120000_fb1…:445`, `20260904120000_feedback_time_trial_category.sql:28` hold the allowed-category JSON). Existing rows use this string. Decision needed: keep value (history) vs. migrate. **Recommend keep the stored value untouched**; only if a display label is needed later, map in UI.
2. **tailwind keyframe/animation names** — confirm whether names contain `stat-check`/`sc-`; only comments matched `stat check`, names appear as `sc-*` inline in StatCheckPage.
3. **Backend contract strings** (see §5) — owned by an external repo; cannot be renamed from here.
4. `HUB_MODULES.statCheck` flag and `hub-stat-check-*` testids used by Meta Reflex-adjacent tests (`Quiz.metaReflex.test`, `Quiz.hub.test`) — these assert the OLD entrance is withheld; must be repointed, not deleted.
5. `Layout.tsx` `isStatCheckSurface` — future Meta Reflex surfaces must not inherit full-bleed/drawer-suppression by accident.

### D. Historical — leave unchanged
- `supabase/migrations/20260803120000_adm2…` (comments: bot seating, Phase B), `20260812120000_fb1…`, `20260823130000_com1…` (comment on `SC_INVITE_BLOCKED`), `20260904120000_feedback_time_trial_category.sql`. **No stat_check tables/columns/RPCs exist in `supabase/` or `drizzle/`** — DB schema does not own the old game; only the feedback category string and comments mention it.
- Docs under `docs/` (COM1_*, AUTH1_AUDIT, ADMIN_MIGRATION_LEDGER, MOGZY_HUB_REDESIGN_HANDOFF, POINT1…, TUT1…, PRO_PLAY…, ADMIN_QUIZ_REVIEW_UX): historical records; may add a one-line pointer in ledger only.
- `STAT_CHECK_*.md` root docs: keep content; optionally move/rename later (they describe the old game and are historically accurate).

## 5. What would break if identifiers were renamed
| Identifier | Consumer | Breaks if renamed |
|---|---|---|
| `/api/stat-check/*` (22 endpoints) | external backend | all online rooms/invites → **do not rename client-side** |
| `stat_check.room.v1`, `stat_check.match_public.v1`, `.match_private.v1`, `.resume.v1` | fail-closed contract readers vs backend payloads | client rejects all responses |
| `SC_*` error codes (`SC_NOT_A_PARTICIPANT`, `SC_ROOM_FULL`, `SC_ROOM_NOT_FOUND`, `SC_INVITE_BLOCKED`) | client `isFatal`, room page, community `social-result` mapping, COM1 SQL comments | error handling/copy |
| `VITE_COMBAT_API_URL` | shared with Combat Lab | unrelated to name; leave |
| Route URLs `/quiz/stat-check*`, `/dev/stat-check` | deep links, invite deep links, auth-destination, feedback route map, admin `legacyRoutes`, sitemap-free | broken bookmarks/invites. **Phase 1 should NOT move the URLs of the live invite path without redirects** (see §7) |
| Feedback category `"Stat Check"` | DB rows + allowed-category constraint | historical rows fail validation |
| sessionStorage `stat-check-animation-speed` | user pref only | harmless reset |
| `data-testid` `sc-*`, `hub-stat-check-*`, `invite-to-stat-check` | vitest/e2e | tests only |
| Admin registry ids `stat-check`, `dev-stat-check` | admin nav, ledger, possibly saved links | admin routing |

## 6. Proposed NEW canonical internal name
**`champion_card_duel`** — display "Champion Card Duel" (retired-mode label "Card Duel (Retired)" in admin).
- snake `champion_card_duel`, kebab `champion-card-duel`, Pascal `ChampionCardDuel`, camel `championCardDuel`, test/prefix `ccd-` (not `sc-`).
- Rationale: descriptive (League champion stat cards, duel format), contains neither "stat" nor "check" nor "SC", cannot collide with Meta Reflex or a future "Stat Check". (Alternative if you prefer shorter: `tabletop_duel`.)

## 7. Proposed Phase 1 scope (frontend-only, behavior-preserving)
Rename internally; keep every externally-owned contract string.

**Rename:**
1. Dirs: `src/pages/dev/stat-check` → `src/pages/dev/champion-card-duel`; `src/pages/stat-check` → `src/pages/champion-card-duel`; `src/lib/stat-check-online` → `src/lib/champion-card-duel-online`; `src/assets/stat-check` → `src/assets/champion-card-duel` (use `git mv`, update 4 asset imports).
2. Files/symbols: `StatCheck*` → `ChampionCardDuel*`, `statCheckEngine` → `championCardDuelEngine`, `useStatCheck*`, `statCheckOnlineApi`, `StatCheckApiError`, `STAT_CHECK_API_BASE`, `canInviteToStatCheck`, `isStatCheckSurface`, `HUB_MODULES.statCheck`, admin ids/titles/section (`champion-card-duel`, `dev-champion-card-duel`; title e.g. "Champion Card Duel (retired)"), `sc-*` testids/CSS vars/keyframes/seeds → `ccd-*`, sessionStorage key (accept old key as fallback or just reset).
3. User-visible copy inside the old game and invite UI ("Invite to Stat Check", "invited you to Stat Check", "Switch Stat Check rooms?", toast, mode-select page) → "Champion Card Duel", so the phrase "Stat Check" is no longer emitted by old code. Update the test expectations.
4. Comments in files that describe the old game.

**Keep untouched (compat/history):**
- `/api/stat-check/*` paths, `stat_check.*.v1` schema versions, `SC_*` codes — centralise in ONE constants block in `client.ts`/`contracts.ts` with a comment "wire contract owned by backend; do not rename without backend change".
- Route URLs: **recommended for Phase 1 = keep `/quiz/stat-check*` and `/dev/stat-check` paths** (existing invite deep links and Meta Reflex's future ownership). Phase 2 then moves them to `/quiz/champion-card-duel*` with `<Navigate>` redirects preserving `:inviteCode`. (Needs your call: doing it in Phase 1 is possible but doubles the risk.)
- Feedback category string `"Stat Check"` in DB/allowed list (Phase 1 only relabels UI mapping if needed; Meta Reflex later claims the label — plan a category migration in a separate task).
- All `supabase/migrations/*`, `docs/*` history, `STAT_CHECK_*.md` (optionally add "retired; now Champion Card Duel" banner).
- Transcript JSON fixture content (`sc-golden:*` seeds are part of golden hashes — verify before renaming; if transcripts embed the seed, keep).

## 8. Verification for Phase 1
Searches (must return only allowed leftovers):
```
rg -i "stat[ _-]?check|statcheck" src e2e public scripts tailwind.config.ts index.html --glob '!*.md'
rg -n "\bsc-|--sc-|SC_" src            # only backend SC_* codes allowed
rg -n "stat-check" src                 # only route URLs + /api/stat-check + stat_check.*.v1 if kept
```
Allowed leftovers list must be exactly: wire-contract constants, kept route paths (if kept), feedback category string, `src/lib/feedback` comments referencing history.
Also: `git mv` history preserved (`git log --follow`), no dangling imports.
Tests/gates:
- `npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm run build` (dist chunk names for lazy routes).
- Vitest: renamed old-game suites (StatCheckPage, engine, online, contracts, invites, ModeSelect, BotPage, App routes), plus `MogzyIdentityMenu.*`, `FriendActionMenu.invite`, `Layout.*`, `LolHub`, `Quiz.hub`, `Quiz.metaReflex`, `feedback/contract`, `admin-registry` tests, golden diagnostics transcripts (`simulation.test`, `transcript.test`).
- Manual/browser: `/quiz/stat-check` (or new path) mode select → bot game plays a round; `/quiz/stat-check/room/XXXX` still parses invite code; HUD invite poll still hits `/api/stat-check/invites` (network tab); Layout full-bleed + drawer suppression on old surfaces; Meta Reflex/`/quiz` hub unchanged.
- Confirm Meta Reflex tree and `ranked-public` untouched (`git diff --stat` shows no changes there beyond comments).

## 9. Risks
- Backend contract is external: any accidental rename of `/api/stat-check`, schema versions or `SC_*` breaks online play silently (fail-closed readers).
- Invite deep links in circulation point at `/quiz/stat-check/room/:code`.
- HUD poll runs for all signed-in users → import-path errors would break the identity menu globally, not just the old game. Prefer running MogzyIdentityMenu tests first.
- `StatCheckPage.tsx` is ~4k lines with CSS var/keyframe names shared across inline `<style>`; do rename mechanically, no refactors.
- Feedback category is persisted data; Meta Reflex later reusing "Stat Check" as a category will conflate old rows unless migrated.
- Working tree has unrelated uncommitted edits (`statsApi.ts`, `CombatLab*`, `ProPlayPlayerProfile`) and many worktrees; run Phase 1 in a clean worktree from main.

## 10. Current state
Audit only. Nothing modified except this file. Untracked pre-existing items were left alone.

## 11. Proposed next task — SC-RENAME2 (Phase 1 implementation)
Clean worktree from main → mechanical `git mv` + symbol/testid/copy rename to `champion_card_duel` per §7 with wire contracts and URLs intact → §8 gates → separate follow-up SC-RENAME3 for URL move + redirects and SC-RENAME4 for feedback category / Meta Reflex display rename.
Decisions needed from you: (1) name `champion_card_duel` OK? (2) Phase 1 keeps URLs (recommended) or moves with redirects? (3) keep feedback category string as-is until SC-RENAME4?

---

# PHASE 1 IMPLEMENTATION REPORT (SC-RENAME1) — DONE

Worktree: `.worktrees/sc-rename1` (branch `sc-rename1-phase1`, from main `30b75cbe`). The main checkout's unrelated edits (`statsApi.ts`, `CombatLab*`, `ProPlayPlayerProfile`) were not touched. Commit: see `git log sc-rename1-phase1` (single commit "SC-RENAME1 phase 1").

## Exact changes
- **`git mv` (history preserved):** `src/pages/dev/stat-check` -> `.../champion-card-duel`; `src/pages/stat-check` -> `src/pages/champion-card-duel`; `src/lib/stat-check-online` -> `src/lib/champion-card-duel-online`; `src/assets/stat-check` -> `src/assets/champion-card-duel` (stone-surface / socket-frame PNGs renamed `champion-card-duel-*.png`); orphan `src/academy/welcome/statcheck-frame.png` -> `champion-card-duel-frame.png` (unreferenced); every `StatCheck*/statCheck*` file (pages, engine, hooks, tests; `App.statCheckRoutes.test.ts` -> `App.championCardDuelRoutes.test.ts`).
- **Symbols:** `StatCheck*` -> `ChampionCardDuel*`, `statCheck*` -> `championCardDuel*`, `STAT_CHECK_*` -> `CHAMPION_CARD_DUEL_*` (incl. `CHAMPION_CARD_DUEL_API_BASE`, `..._WRITE_TRANSCRIPTS` env var), hook `useChampionCardDuelInvites`, `championCardDuelOnlineApi`, `ChampionCardDuelApiError`, `canInviteToChampionCardDuel`, `isChampionCardDuelSurface` (Layout), `HUB_MODULES.championCardDuel`.
- **Admin registry:** ids `champion-card-duel` / `dev-champion-card-duel`, section, labels/titles ("Champion Card Duel", "Champion Card Duel Prototype"). `path`/`oldLocation`/`legacyRoutes` keep the legacy URLs.
- **Test ids / CSS:** `stat-check-*` and old-mode `sc-*` -> `ccd-*`; `hub-stat-check-*` -> `hub-champion-card-duel-*`; `invite-to-stat-check` -> `invite-to-champion-card-duel`; `--sc-*` vars and `sc-drift/core-pulse/flow/verdict` keyframes (page + `tailwind.config.ts`) -> `--ccd-*`/`ccd-*`; sessionStorage key `stat-check-animation-speed` -> `ccd-animation-speed` (session-scoped preference, resets once per tab); transcript `formatVersion` `stat-check-transcript.v1` -> `ccd-transcript.v1` (code + 8 JSON fixtures).
- **User-facing copy** ("Stat Check" -> "Champion Card Duel"): Quiz hub entry, friend menu ("Invite to Champion Card Duel", toasts), identity-menu invite notification and room-switch dialog, mode-select page, admin labels, comments.
- **Comments added** marking retained compat strings: `client.ts` (wire paths / `SC_*`), `contracts.ts` (schema versions), `feedback/contract.ts` (category), seed literals (engine, page, `transcript.test.ts`).
- `.gitignore` comment; a banner note atop `STAT_CHECK_CLAUDE_HANDOFF.md` and `STAT_CHECK_HUMAN_PLAYTEST.md` (bodies unchanged, they remain historical records).
- Behavior deliberately NOT changed: routes still mounted, HUD invite poll still runs, friend invite entry points still shown, hub flag still `false`.

## Compatibility strings intentionally retained
| String | Why | Class |
|---|---|---|
| `/api/stat-check/*` (22 endpoints in `client.ts`) | external backend paths | 1 wire |
| `stat_check.room/match_public/match_private/resume.v1` (+ `.v0/.v2` negative-test values) | backend schema_version; fail-closed readers | 1 wire |
| `SC_*` error codes | backend codes consumed by client/community code | 1 wire |
| `supabase/migrations/*`, `docs/*.md` mentions | history | 2 historical |
| feedback category `"Stat Check"` + `["/quiz/stat-check","Stat Check"]` route row (+ tests) | persisted in DB rows / feedback_config | 3 persisted |
| `/quiz/stat-check`, `/quiz/stat-check/{bot,private,room/:inviteCode}`, `/dev/stat-check` (App routes, Layout/Footer path checks, admin registry paths, Quiz hub link, room page share URL/navigation, tests) | legacy URLs kept for now; invite deep links | 4 legacy route |
| `AcademyWelcomePage.test.tsx` `"stat check"` | regression guard listing labels of pills removed from the welcome page | 5 generic |
| `--sc-fit` in `index.css` / quiz-broadcast | "scenario-card fit" variable, unrelated to this mode | 5 unrelated |
| Seed literals `stat-check-v1` (engine default), `stat-check-tabletop-v2` (page + test), `sc-golden:*` (transcript tests + 8 JSON) | feed the deterministic shuffle; renaming changes every default match and forces regenerating golden transcripts. Behavior equivalence wins. Not identities. | frozen determinism seed (disclosed 6th class) |

## Verification results
- `tsc -p tsconfig.app.json --noEmit`: 25 errors, **identical to unmodified HEAD** (all pre-existing, none introduced).
- `eslint` on all changed ts/tsx: 27 problems (22 errors, 5 warnings), **identical to HEAD**.
- `vite build`: succeeds. Full `npm run build` prerender steps not run; full `vitest run` not run (it runs out of memory here and includes pre-existing DB-migration failures).
- Vitest, targeted (old-mode dirs, hud, Layout, admin, auth, community, feedback, LolHub, Quiz*, welcome, rankedInvite, every changed test): all Champion Card Duel suites pass (engine, page, online, contracts, invites, mode select, bot page, routes, friend menu, identity menu, Layout). Remaining failures are **pre-existing and identical to unmodified HEAD** (same files run on HEAD): 7 in feedback `contract.test` (DB-mirror x5), `singleReportPath`, `Quiz.hub` h1; plus 159 in `quiz-ranked/*`, `Quiz.rankedRole`, `welcome/tomeGeometry`. First-run timeouts from machine load pass with `--testTimeout=90000`.
- Caught and fixed during verification: engine default seed `"stat-check-v1"` had been rewritten (would change behavior); route regexes in the routes test; dynamic test-id templates (`ccd-${side}-hp`); `lib/ccd-online` import paths.
- Wire/route check: multiset of `/api/stat-check/*`, `stat_check.*`, `SC_*`, `/quiz/stat-check*` and `/dev/stat-check` route uses is identical between HEAD and the commit (deltas: 6 import-path uses of `dev/stat-check` moved to the new directory; +2 explanatory comments).
- Direct routes: `App.championCardDuelRoutes.test` asserts all 5 legacy routes still map to the renamed components; Layout/Footer tests confirm surfaces still match those paths. Not manually browser-tested.
- Invite backend contract: `client.ts` request paths and `contracts.ts` schema strings byte-identical apart from comments.
- Meta Reflex: no Meta Reflex source touched. Only comment/test-id edits in `Quiz.metaReflex.test.tsx`, `Quiz.hub.test.tsx` (old entrance test id), and a comment plus import guard in `ranked-public/rankedInvite*`. Meta Reflex is still not displayed as Stat Check.

## Residual search (post-change; tracked files excluding docs/supabase/root md)
`git grep -iE "stat[ _-]?check|statcheck"` leaves only: wire paths/schema strings, legacy route strings, feedback category (+ comments/tests), frozen seeds, the welcome-page regression-guard label. `sc-` leaves only `--sc-fit` (unrelated) and `sc-golden` (frozen seed). `SC_*` untouched. **No occurrence remains where "Stat Check" is the current identity of Champion Card Duel.**

## Unresolved ambiguity
- Seed literals contain "stat-check"/"sc-": kept for behavior equivalence; regenerating goldens under new seeds is optional future work.
- Historical docs under `docs/` still say "Stat Check" by design.
- The feedback category `"Stat Check"` still labels Champion Card Duel feedback; a later Stat Check / Meta Reflex rename must not silently inherit old rows.

## Readiness for SC-RENAME2
**Ready.** Namespace evacuation is complete except the deliberate compat strings above. SC-RENAME2 candidates: move URLs to `/quiz/champion-card-duel*` with redirects preserving `:inviteCode`; feedback category migration; then the Meta Reflex display rename.
