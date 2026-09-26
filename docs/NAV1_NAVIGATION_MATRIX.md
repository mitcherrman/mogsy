# NAV1 current-state navigation matrix

Audit date: 2026-09-26  
Code audited: `main@4b3be0cbe2767d3107f4462082755066b26b398b` plus the NAV1 seed document commit `64e0c2dc9c595eed4eced302f343a1256e44e85f`.

## Reading this matrix

History is described as `PUSH`, `REPLACE`, `LOCAL` (no URL/history mutation), or `RELOAD`. “Browser Back” means the browser/system history action, not the visible arrow. Direct entry includes a bookmark, a new tab and an external referrer. Unless noted, a React Router `Link` or `navigate(path)` pushes and refresh reconstructs only URL-addressed state.

Severity: P0 data loss/security/unavoidable destructive behavior; P1 common broken or hazardous navigation; P2 surprising or provenance-losing navigation; P3 label/test/legacy cleanup. No P0 was found.

## Product surfaces

| Surface / source state | Legitimate entries | Visible action and semantic type | Current implementation / history | Browser Back / Forward; direct link / refresh | Expected contract | Problem / severity / collision | Implementation class and tests |
|---|---|---|---|---|---|---|---|
| Global HUD, every `Layout` route | Any product route | Hat, “Home — Mogzy Academy”; `HOME` | `Link` to `LEAGUE_HOME_ROUTE` (`/lol`), PUSH | Back returns to the route left; Forward returns Home. Direct/refresh stable | Always `/lol`; never contextual Back | Correct. P3: repeated Home presses may stack `/lol`, but duplicate-home policy is optional. LOW | Preserve. Link/history e2e smoke |
| Settings `/settings` | Profile gear, identity menu, direct URL, auth return | Arrow “Go back”; `TEMPORAL_BACK` | **NAV1-B:** safe temporal Back; POP when router `idx > 0`, otherwise `/lol` REPLACE | Internal entry returns exact origin; direct/new-tab/external initial entry deterministically lands `/lol`; Forward remains normal after POP | Temporal origin with product-Home fallback | **Resolved NAV1-B**. LOW | Vitest + Chromium internal/direct certification |
| Password reset `/reset-password` after success | Email recovery URL | Automatic return; `AUTH_DETOUR` | **NAV1-B:** `safeReturnPath(returnTo, LEAGUE_HOME_ROUTE)`, then REPLACE | Explicit safe return preserved; absent/unsafe return lands `/lol`; completed reset is not left behind | Safe validated explicit return; deterministic registered fallback | **Resolved NAV1-B**. LOW | Static contract + auth safe-return baseline |
| Own profile `/profile` | HUD portrait, Ranked/Leaguecraft stats, direct/protected auth return | Arrow “Go back”; `TEMPORAL_BACK` | **NAV1-B:** `useSafeTemporalBack('/lol')` | Router-owned predecessor POPs exactly, including query/hash; direct/new-tab/external initial entry REPLACEs to `/lol`; Forward restores Profile after POP | Temporal Back with fixed `/lol` fallback | **Resolved NAV1-B**. LOW | Vitest BrowserRouter + Chromium internal/direct/Forward |
| Public profile `/user/:profileId` (loaded and not-found states) | Comments, friends, notifications, admin, favorite cards, direct/auth | Arrow/button “Go back”; `TEMPORAL_BACK` | **NAV1-B:** both controls use `useSafeTemporalBack('/lol')` | Internal origin POPs; direct/not-found fallback is `/lol` | Temporal Back + `/lol` fallback | **Resolved NAV1-B**. LOW/MEDIUM | Call-site tests + Chromium internal/direct |
| Secret room `/secret-room` | Theme-overlay easter egg, direct URL | Arrow “Go back”; `TEMPORAL_BACK` | **NAV1-B:** `useSafeTemporalBack('/lol')` | Theme-overlay entry POPs; direct/external initial entry REPLACEs `/lol` | Temporal Back + `/lol` fallback | **Resolved NAV1-B**. LOW | Shared behavior + call-site test |
| Leaguecraft hub `/quiz`, default | Home/cards, result exits, auth return, direct | Global Home; workspace and mode CTAs | URL route; normal entries PUSH; gate recovery `navigate('/lol',{replace:true})` | Back returns origin. Refresh restores hub, not transient selections | Preserve; recovery replacement is correct | Correct except gate redirect should remain REPLACE. HIGH (`Quiz.tsx`) | Regression tests only |
| Leaguecraft workspace `/quiz#history`, `#review`, `#trends` | Tabs, recent-study footer, result/deep links | Named tabs; meaningful reversible view | `navigate(workspaceHash(mode))` PUSH; identical hash suppressed; invalid/no hash uses local default | Back/Forward traverse panes; deep link and refresh restore pane. Explicit hash scrolls once; plain `/quiz` does not auto-scroll | Reference pattern: PUSH meaningful panes, suppress duplicate, URL is truth | Known good. HIGH (History/Practice) | Preserve; existing `LeaguecraftWorkspace` history test plus refresh/focus/scroll e2e |
| Practice set/category load, active question, answer reveal `/quiz` | Hub set/category rail, builder/custom set | No dedicated leave control; header “League Hub” fixed `/lol`; active phases are local | `sets → loading-questions → active`; questions/reveal LOCAL | Browser Back leaves `/quiz` to prior route from active or reveal. Forward remounts `/quiz` at `sets`, losing run. Refresh also loses run. Header jumps `/lol` | One meaningful session entry boundary only; do not add per-question/reveal entries. Browser Back during unfinished run is `EXIT_ACTIVE_FLOW`, requiring confirm/leave policy; in-product control must say “Exit practice” or intentionally return Leaguecraft | **P1** silent loss/surprising exit; fixed header label says League Hub and is structurally honest but bypasses practice context. HIGH | Session URL/token or one history marker + active-flow guard; e2e unanswered/reveal/refresh |
| Practice result `/quiz` | Completion of local practice | Play again; practise misses; review; “Choose another set”/“Back to Leaguecraft” | All except review are LOCAL; review uses `window.location.assign('/quiz#review')` RELOAD | Browser Back leaves `/quiz`, not result→sets. Play again cannot be reversed. Review reload loses result and Back may reload/remount result URL as hub, not result | Result→sets is local/host return; Play Again begins a new meaningful session; Review should SPA PUSH or intentional terminal REPLACE based on stale-result policy | P2 result/history mismatch; P2 unnecessary reload. HIGH | Encode session-level state, replace stale terminal entry where appropriate; no per-question entries |
| Practice error `/quiz` | Set list failure/question fetch failure | Retry/return | LOCAL `error`, retry resets `sets` | Back leaves route; refresh retries initial load | Local retry is correct; error is not a history destination | Correct | Unit-only |
| Ranked lobby `/quiz/ranked` without match | Leaguecraft role PLAY after queue match, direct, auth return | `RankedRouteHeader` “Back to Quiz”; `STRUCTURAL_PARENT` | `Link '/quiz'`, PUSH | Browser Back returns actual origin; visible link always Leaguecraft. Direct link is viable; auth returns with REPLACE | Fixed parent is acceptable, but label should be “Leaguecraft”, not generic Back | P3 labeling (“Back to Quiz” is parent, not temporal). MEDIUM | Rename only; route tests |
| Ranked auth gate `/quiz/ranked` | Anonymous direct/Leaguecraft | Create/sign in; `AUTH_DETOUR` | `authHref('/quiz/ranked')`; completion REPLACE | Back after auth does not reopen completed auth; destination preserved | Preserve validated return | Correct | Existing auth tests + e2e |
| Ranked recovery/no-match | Stale match state, Daily-hosted child | Automatic `REDIRECT_RECOVERY` | Standalone recovery/no-match redirects use REPLACE; hosted Daily uses REPLACE to `/quiz/daily-challenge` | Back skips invalid Ranked route | Preserve | Correct | Recovery history tests |
| Standalone Ranked active/reveal `/quiz/ranked` with `location.state.matchId` | Queue handoff/reconnect | Header “Back to Quiz” plus explicit Forfeit; `EXIT_ACTIVE_FLOW` vs `STRUCTURAL_PARENT` | Header is a normal Link PUSH; Forfeit posts authoritative command after confirmation; no blocker/popstate/beforeunload | Browser/Header Back silently leave route; server treats disappearance as disconnect with reconnect window, not forfeit. Forward may remount with `location.state`, recovery timing dependent. Refresh loses `location.state` and relies on recovery | Back/parent action must not mean forfeit. Intercept SPA/browser Back while active, explain “Leave match” (reconnect window) separately from explicit “Forfeit”; keep unload/network as disconnect | **P1** active state abandoned without explicit semantics. MEDIUM/HIGH Ranked ownership | Active-flow blocker/confirm contract, server-aware copy; real-history/mobile tests |
| Explicit Ranked forfeit | Active standalone match | “Forfeit Match” then Cancel/Forfeit; `EXIT_ACTIVE_FLOW` | Confirmation LOCAL; confirm API command; result arrives from server | No history mutation until later terminal action | Preserve: only explicit confirmed command forfeits | Known good | Existing API/control tests |
| Daily-hosted Ranked child | Daily `stage-play` | Daily chrome; child suppresses own exit/result and calls host; `HOST_RETURN` | Same route `/quiz/daily-challenge`, LOCAL parent flow | Back leaves entire Daily; never rewinds stage. Child handback continues locally | Host owns all navigation/results; never expose child Forfeit or Ranked lobby exits | Known-good ownership; active Daily exit policy missing at parent. HIGH Daily/Ranked | Parent guard only; host-boundary regression |
| Ranked terminal result | Match settlement | Play Again, Review Match, Back to Leaguecraft, discovery Review; `TERMINAL_FORWARD` | Four `window.location.assign`: `/quiz?play=1`, `/quiz#history`, `/quiz`, `/quiz#review`; RELOAD/PUSH | Full remount. Back returns stale terminal Ranked entry; Forward reloads target. Hosted result instead calls `onSessionComplete` locally | Internal transitions should use SPA navigation. Decide whether terminal Ranked entry is REPLACE (recommended) so Back cannot resurrect stale result; Play Again should enter lobby/queue via supported URL contract | **P1** stale terminal resurrection plus four unnecessary reloads. MEDIUM/HIGH | Terminal navigation policy + React Router; Playwright Back/Forward for every action |
| Daily entry before Begin `/quiz/daily-challenge` | Leaguecraft Daily CTA, direct/resume/auth return, legacy `/quiz/daily` redirect | Header “Back to Quiz”/unavailable “Back to Leaguecraft”; `STRUCTURAL_PARENT` | Link `/quiz`, PUSH; legacy alias REPLACE | Browser Back actual origin; direct stable; refresh reloads/resumes server run | Before Begin fixed Leaguecraft parent is acceptable; destination-named label | Correct, minor inconsistent “Quiz” naming P3 | Label consistency tests |
| Daily intro, stage intro/play/reveal/result/between stages/Survival/Review | Begin or resumed server run | Chrome “Back to Quiz”; stage Continue; `EXIT_ACTIVE_FLOW`, `HOST_RETURN` | Entire state machine LOCAL on one URL; server state drives recovery; no blocker | Browser or visible link exits whole run; Back never rewinds stages; Forward/remount resumes from server if allowed. Refresh recovers via server | Do not create per-stage history. During active run, Back/link should be explicit “Exit Daily Challenge” with confirmation and documented resumability; Continue remains local | **P1** active exit mislabeled as Back and unguarded. HIGH Daily | Parent active-flow guard; stage-by-stage real-history tests |
| Daily completion | Terminal server run | “Back to Leaguecraft”; optional save-account gate; `TERMINAL_FORWARD` / `AUTH_DETOUR` | Link `/quiz` PUSH; save `returnTo='/quiz/daily-challenge'`; auth/upgrade completion REPLACE | Back from Leaguecraft returns completed Daily route; auth returns to completed recap (server-restorable) | Decide whether completed Daily recap is a useful Back destination. Recommended terminal exit REPLACE; account save return to recap is correct until acknowledged | P2 stale terminal Back; auth behavior good. HIGH (Daily/history) | Owner decision + terminal e2e |
| Welcome `/welcome` chapters | Root entry for new visitor, explicit replay | Internal Back, Skip/Enter, Sign In | Chapters LOCAL; Back calls sequence; final exit `/lol` REPLACE; sign-in detour PUSH with safe `/lol` return | Browser Back leaves `/welcome`; internal Back re-reads chapter; final exit cannot Back into onboarding | Preserve distinction; no entry per chapter | Known good | Existing tests |
| Root entry `/` / MogzyEntryV2 | Direct site entry | Automatic exit | Destination chosen then `navigate(...,{replace:true})` | Back leaves site/previous page, never replays splash | Preserve | Known good | Existing tests |
| Auth `/auth`, callback `/auth/callback` | ProtectedRoute, HUD, Ranked, Daily save, profile/settings/premium | Sign-in/up and callback actions; `AUTH_DETOUR` | `authHref` validates path+search+hash; successful completion/callback REPLACE | Completed auth absent behind destination; direct auth falls back `/quiz`; unsafe external return rejected | Preserve and keep separate from ordinary Back provenance | Known good. One caveat: hand-written senders must preserve full current search/hash | Existing unit coverage; sender inventory e2e |
| Protected deep links | `/profile`, Stat Check room, docs hash, etc. | Automatic auth redirect; `AUTH_DETOUR` | `<Navigate to={authHref(path+search+hash)} replace>` | Blocked route replaced by auth; auth replaced by destination | Correct | Known good | Existing tests |
| Standalone history `/lol/history` | Profile stats, house ad, bookmark/direct | Arrow labelled “Back to LoL hub”; `STRUCTURAL_PARENT` | Link `/lol`, PUSH | Browser Back returns true origin (often profile/ad page); visible arrow always `/lol`; refresh stable | Keep live until History IA settles. If retained, name destination; if canonicalized, redirect REPLACE only after owner decision | P2 provenance mismatch/duplicate IA, not a broken link. **BLOCKED** by History work | IA decision; cross-entry tests |
| Missed bank `/lol/missed-questions` | `/lol/history`, direct/bookmark | “Back to quiz history”; `STRUCTURAL_PARENT` | Link `/lol/history`, PUSH | Browser Back returns actual origin; visible control fixed history. Direct stable | Structural parent is coherent while route lives; eventual `/quiz#review` dependency belongs to History IA | P3 today; BLOCKED | Preserve pending IA |
| Premium `/lol/premium` | `/lol` house/panel, Profile, Combat Lab, Team Sim failure, Practice Builder, History, Review, Trends, legacy redirects, direct, checkout return/auth | Arrow “Back to LoL hub”; `STRUCTURAL_PARENT` presented as Back; “Keep playing free” `/quiz` | Fixed Link `/lol`, PUSH; legacy aliases REPLACE preserving query/hash; checkout is external full navigation and returns `?success`/`?canceled`; auth returns Premium | Browser Back returns entry surface; arrow discards provenance to `/lol`. Refresh/query stable | Provenance-sensitive contextual return with validated same-origin path; fallback `/lol`. Checkout/auth `returnTo` remains Premium | **P2** broad provenance loss. LOW/MEDIUM due many senders | Add safe `from` contract to all CTAs; entry matrix tests; keep external checkout reload |
| Champion detail `/lol/docs/champions/:slug` | Champion index, Combat Lab/docs cross-links, direct | “Browse all champions” / breadcrumbs; `STRUCTURAL_PARENT` | Fixed Links, PUSH | Browser Back honors cross-link; in-page parent goes index | Correct: deterministic taxonomy parent, destination named | Known good | Preserve |
| Items `/items/:slug` | Docs/build/component cross-links, direct | Links to related item, Combat Lab, Practice | Structural links PUSH; no generic Back | Browser Back supplies temporal return | Correct | Known good | Smoke |
| Docs pro year/champion/roster detail | Pro Data indexes, Pro Play cross-links, direct | Breadcrumbs/index links; `STRUCTURAL_PARENT` | Links PUSH; query filters largely REPLACE while explicit selection changes may PUSH | Browser Back preserves cross-link; fixed breadcrumbs traverse IA | Correct where destination named. Roster profile fixed index + roster home are explicit | Known good; MEDIUM PSE work | Preserve, query-state tests |
| Pro Play hub `/lol/pro-play` and quiz | Hub/docs links, direct | Quiz “Back to Pro Play”; `STRUCTURAL_PARENT` | Fixed Link, PUSH | Browser Back actual origin; control deterministic parent | Correct and honestly labelled | Known good | Preserve |
| Pro Play Graphs `/lol/pro-play/graphs` | Pro Play hub/cross-link/direct | Graph/focus/controls | Meaningful graph/focus writes use PUSH (`replace: !push`); transient controls/default normalization REPLACE | Back/Forward traverses graph/focus, not each tweak; refresh/deep link restore search state | Reference pattern | Known good; MEDIUM current Pro work | Preserve exact push/replace tests |
| Pro Play Matchup `/lol/pro-play/matchup` | Graph/search/player/team/champion cross-links/direct | URL-addressed subject/opponent/scope | Search params are source of truth; meaningful selections PUSH | Back/Forward/deep link/refresh coherent | Preserve | Known good | URL contract tests |
| Pro Play live/archive | Live → archive → game dossier, direct | Archive link; selected-game close/back behavior | Archive query is preserved; game open carries `location.state.archive`; close uses explicit archive return rather than `-1` | Direct game has deterministic archive fallback; browser history remains temporal | Good model for explicit provenance + fallback | Known good | Preserve existing direct-entry tests |
| Meta Reflex `/league-swipe`, stats, game | Hub → stats/game; profile CTA; direct | Fixed hub/stats controls; `STRUCTURAL_PARENT` | Links/navigate PUSH; local game progress | Browser Back temporal; named controls deterministic | Fixed parent is appropriate. Active local game exit policy is lower risk but should use explicit “Exit game” if a control is added | P3 label/policy only | Smoke |
| Combat Lab `/combat-lab`, diagnostics, battle index/detail | Home/docs/items/profile/premium routes, direct | Diagnostics parent, battle detail index; `STRUCTURAL_PARENT`; transient simulator state | Fixed Links; simulation form/result mostly LOCAL; Team Sim has `beforeunload` while running | Back can discard local unsaved/running state except Team Sim unload warning; refresh loses local setup | Parent links correct. Inventory running Team Sim as active flow; SPA navigation may bypass `beforeunload` | P2 active Team Sim SPA-leave gap. MEDIUM (ENVVIS/Journey) | Shared active-flow blocker evaluation; not coupled to Ranked forfeit |
| Stat Check mode/room | Leaguecraft/direct/invite | Room `onExit` to `/quiz/stat-check`; `EXIT_ACTIVE_FLOW`/parent | Fixed navigate PUSH | Browser Back true origin, visible exit mode-select. Server room lifecycle may continue | Destination label should say “Leave room” when active; fallback deterministic | P2, needs lifecycle confirmation. MEDIUM PLAYTEST | Server-state audit + room history tests |
| Mastery journeys list/player | Leaguecraft/direct/auth | Player links back to `/quiz/mastery`; `STRUCTURAL_PARENT` | Fixed Links PUSH; ProtectedRoute auth REPLACE | Direct/auth stable; Browser Back actual origin | Correct structural parent; active player local progression should not be rewound per question | P3 active-exit naming. HIGH Journey | Preserve pending Journey ownership |
| Blog detail `/blog/:slug` | Blog index, cross-link/direct | “Back to blog”; `STRUCTURAL_PARENT` | Fixed Link PUSH | Browser Back true origin; in-app index | Correct, named | Known good | Smoke |
| Admin child/detail tools | Admin shell/index tables/direct/auth | “Admin”, “Back to …”; structural/cancel | Fixed Links/navigate; legacy admin aliases REPLACE; tab/filter search mixed PUSH/REPLACE | Generally deterministic admin IA; direct links viable | Structural parent is appropriate; retain alias REPLACE | P3: audit labels only; LOW unless current Admin stream overlaps | Targeted route tests |
| NotFound `*` | Invalid/stale route including `/home` | Named League hub/Quiz/Docs/Combat Lab choices | Links PUSH | Back returns invalid source | Correct recovery surface, but must not be a deliberate destination | Settings/reset make this P1 upstream | Route tests |

## Transient Close and Cancel inventory

These controls do not belong in browser history unless the transient is independently deep-linkable:

- Profile edit “Close editor” and “Cancel”: `CLOSE_TRANSIENT`/`CANCEL_FLOW`; reset local form and remain `/profile`. Correct.
- Ranked Forfeit confirmation Cancel: `CLOSE_TRANSIENT`; no route/server mutation. Correct.
- HUD notification/account menus, theme overlay, report/dialog/drawer controls: `CLOSE_TRANSIENT`; local open state. Correct.
- Ranked queue Cancel: `CANCEL_FLOW`; server queue cancellation, remains lobby. Correct; a pairing race can hand off to the matched state.
- Auth/account-upgrade “sign in instead” and dismiss actions: local handoff/dismiss; successful upgrade uses validated return and REPLACE.
- Pro/Stripe checkout is the important exception: it is an external-document detour, so full-document `window.location.href = checkoutUrl` is intentional.

## Raw temporal history inventory

Before NAV1-B, production code had four actual raw `navigate(-1)` calls. All
four call sites now use `useSafeTemporalBack('/lol')`; the helper contains the
single bounded `navigate(-1)` after verifying router `idx > 0`.

| File | Count | State | Finding |
|---|---:|---|---|
| `src/pages/Profile.tsx` | 1 | normal profile | Resolved: bounded POP, `/lol` fallback |
| `src/pages/UserProfile.tsx` | 2 | loaded and not-found | Resolved: bounded POP, `/lol` fallback |
| `src/pages/SecretRoom.tsx` | 1 | easter-egg page | Resolved: bounded POP, `/lol` fallback |

There are no production `history.back()` or `history.go()` calls and no production `popstate` listener or React Router blocker.

## `window.location` navigation writes

| File / count | Destination | Classification | Verdict |
|---|---|---|---|
| `src/pages/quiz-ranked/QuizRankedMatch.tsx` / 4 | play again, history, lobby, review | Internal terminal forward | P1/P2: replace with router navigation and explicit terminal history policy |
| `src/pages/Quiz.tsx` / 1 | `/quiz#review` | Internal result forward | P2: SPA PUSH/REPLACE according to result-retention policy |
| `src/components/playtest/PlaytestMatchHost.tsx` / 1 | `/quiz` default exit | Internal terminal/exit | P2: legacy reload; PLAYTEST owner should convert with host-supplied navigation |
| `src/components/settings/AccountConnections.tsx` / 1 | provider authorization URL | External auth detour | Intentional full navigation; callback params are scrubbed with `replaceState` |
| `src/lib/pro/checkout.ts` / 2 | Stripe checkout URL | External checkout detour | Intentional full navigation |
| `src/lib/chunk-recovery.ts` / 1 `replace` | same URL with recovery marker | Chunk-load recovery | Intentional `REDIRECT_RECOVERY`; REPLACE avoids a reload loop |
| `src/pages/legal/Contact.tsx` / 1 href | `mailto:` | External OS action | Intentional, not product history |

`window.location.reload()` in the Team Sim error boundary is an explicit recovery action and is not internal navigation.

## URL-addressed state inventory

- Good PUSH granularity: Leaguecraft workspace panes; Glossary term hashes; Pro Play graph/focus and matchup entities; explicit roster/filter selections; patch-report selected patch where selection is a meaningful view.
- Good REPLACE granularity: Pro Play control tweaks and normalization, debounced search text, admin filter normalization, live-feed filters, OAuth callback-param scrubbing, legacy/canonical redirects, gate/recovery redirects.
- Correct LOCAL granularity: welcome chapters, answer selection/reveal, individual Practice questions, Ranked/Daily stages, modal/drawer state, confirmation state.
- Problematic LOCAL boundary: entering/leaving an entire Practice session and its terminal result; active Daily/Ranked/Stat Check/Team Sim exits need policy even though their individual rounds/stages remain local.

## Provenance-sensitive destinations and safe fallbacks

| Destination | Origins to preserve | Safe fallback |
|---|---|---|
| `/profile` | HUD, Leaguecraft/Ranked, post-auth | `/lol` |
| `/user/:id` | comments, friends, notifications, admin, favorites | `/lol` |
| `/settings` | profile, identity menu, direct, post-auth | `/profile` for explicit profile origin; otherwise `/lol` |
| `/secret-room` | theme overlay | `/lol` |
| `/lol/premium` | Home, Profile, Combat Lab/Team Sim, Builder, History, Review, Trends, ads | validated explicit origin; `/lol` |
| standalone History/Review routes | Profile, ad, bookmark, legacy cross-link | pending IA; today `/lol` and `/lol/history` |
| Pro Play archive selected game | archive query/list | existing preserved archive URL; archive root |
| active gameplay exits | queue/hub/direct/resume | not generic provenance: explicit leave policy then host/lobby fallback |

Do not store arbitrary URLs or use `document.referrer`. Carry a validated same-origin relative `from` value in router state for SPA-only provenance; use a validated query value only where it must survive refresh/auth/document navigation. Auth `returnTo` remains a separate interruption contract.

## Defects

### P0

None found.

### P1

1. ~~Settings “Go back” pushes nonexistent `/home`.~~ Resolved NAV1-B.
2. ~~Password-reset fallback replaces to nonexistent `/home` when `returnTo` is absent/unsafe.~~ Resolved NAV1-B with `/lol` fallback.
3. ~~Profile and UserProfile rely exclusively on unbounded `navigate(-1)` (three controls).~~ Resolved NAV1-B.
4. Active standalone Ranked can be left by browser/header Back with no explicit leave semantics; the server correctly treats this as disconnect, not forfeit.
5. Active Daily can be left by a control labelled Back and by browser Back without an Exit Daily contract.
6. Practice session/result is entirely local: Back silently leaves and Forward/refresh returns to the hub, losing the meaningful run state.
7. Ranked terminal actions reload and leave a stale completed match directly behind their destination.

### P2

- Secret Room raw history back.
- Premium fixed `/lol` arrow loses at least eight meaningful origins.
- Practice result Review and Playtest exit force document reloads.
- Standalone History duplicates canonical workspace IA and its fixed parent differs from browser Back.
- Daily completion exit may leave stale completion behind (owner decision).
- Team Sim `beforeunload` does not guard SPA links; Stat Check active-room exit wording/lifecycle needs confirmation.
- `RecentMatchups.tsx` navigates to `/profile/${opponent_id}`, while the registered public route is `/user/:profileId`; confirm component reachability, then treat as a broken-route P1 if live.
- `NavBanner.tsx` navigates to `/leagues/collections`, which is not registered in `App.tsx`; confirm whether the component is reachable before scheduling removal/fix.

### P3

- Fixed structural links labelled generic “Back to Quiz” should say “Leaguecraft” where that is what they mean.
- Several admin/blog/detail arrows are structurally correct; destination-named aria labels should remain.

## Known-good behavior not to change

1. The HUD hat is Home (`/lol`), not Back.
2. Auth safe-return validation and successful auth/callback REPLACE.
3. ProtectedRoute preserving pathname, search and hash.
4. Welcome internal chapter Back versus browser Back, and final REPLACE exit.
5. Leaguecraft workspace hash PUSH, duplicate suppression and explicit-hash scroll.
6. Pro Play Graphs/Matchup meaningful PUSH versus transient REPLACE.
7. Daily owning hosted Ranked navigation and result handback.
8. Explicit confirmed Ranked Forfeit as the only deliberate forfeit signal.
9. Structural Docs/Pro Play/blog/index links when the destination is named.
10. External provider/Stripe document navigation and chunk-recovery replacement.

## Owner decisions still required

1. Password-reset fallback resolved in NAV1-B as `/lol`: a successful reset
   leaves the auth interruption via REPLACE and lands on product Home; an
   invalid/expired reset still offers the structural `/auth` action.
2. Leaving an active Ranked match: should confirmation say the player may reconnect for 45 seconds, and should the destination be Ranked lobby or Leaguecraft?
3. Leaving an active Daily: is the run resumable without penalty, and what exact warning is truthful for each phase?
4. Should completed Ranked/Daily terminal pages be reachable by Back after the user chooses a terminal-forward action? Recommendation: no; use REPLACE on acknowledged exit.
5. Final IA for `/lol/history` and `/lol/missed-questions` after the active History workstream lands.

