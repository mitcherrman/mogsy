# Patch Hub PH4-C: "Open {Champion} in Combat Lab"

Frontend only. No backend, Supabase, Combat Lab, quiz, Studio or Graph1 changes. No new dependency, no new state or query schema.

## 1. Baseline

| | |
|---|---|
| Base SHA (`origin/main`, verified after `git fetch`, no drift) | `cce36fcec0df0209133e55dcd187d5d3f03c5261` (PH4-B) |
| Branch | `patchhub/ph4c-combat-lab-handoff` |
| Final SHA | `git rev-parse patchhub/ph4c-combat-lab-handoff` (the commit that adds this file; a SHA cannot name itself) |
| Worktree | `C:\Users\mlmit\mogzy-wt\ph4c` (outside OneDrive; `node_modules` junction) |
| Audit input | `docs/PATCH_HUB_PH4_ACTIONS_AUDIT.md` on `patchhub/ph4-actions-audit` (84f996b3), §4 and §11 |

## 2. Files changed

New
- `src/lib/patch-hub-combat-lab/handoff.ts`: `combatLabHandoffFor(card)`, `combatLabHandoffLabel(name)`
- `src/components/patch-hub-combat-lab/CombatLabHandoffLink.tsx`: the link (react-router `Link`)
- Tests: `src/lib/patch-hub-combat-lab/handoff.test.ts` (17), `src/pages/lol/PatchReports.ph4c.test.tsx` (11)

Edited
- `src/pages/lol/PatchReports.tsx`: `entityActions` slot (6 lines + 2 imports)
- `src/components/patch-reports/PatchReportEntityHeader.tsx`: renders the `entityActions` wrapper only when the slot returns something, and wraps it under the identity row on a phone (`flex-wrap`, wrapper `w-full sm:w-auto`)

Not touched: `lib/combat-lab/**`, `pages/CombatLab.tsx`, `lib/patch-impact/**`, `lib/patch-catchup/**`, `components/patch-impact/**`, `components/patch-catchup/**`, `lib/patch-hub-share/**`.

## 3. Eligibility contract (`combatLabHandoffFor`)

All must hold, otherwise `null` and nothing renders:

1. `isChampionsSectionChampionCard(card)` (`entity_type === "champion"` **and** `section_title === "Champions"`; the same Summoner's Rift gate Patch Impact uses). Excludes items, runes, systems, Arena/Mayhem/mode cards.
2. `card.mogzy_entity_ref` is a non-empty catalog identity. `entity_name` is never used to guess one: a champion Mogzy does not map (real: **Locke**, 26.14/26.15, `mogzy_entity_ref: null`) gets no action.
3. The canonical builder returns a URL containing `?attacker=` (a ref with no usable slug, an over-long ref, a ref of `???` fails here).

No aliases were added. Catch-Up gets no new action (see §7).

| Example | Result |
|---|---|
| Vi 26.19, Draven 26.19, Bel'Veth 26.15 | action |
| Vi Passive Shield line | no per-line action; the one entity-level action |
| Sundered Sky (item, 26.16/26.17) | none |
| Runes (Fleet Footwork, Hail of Blades, 26.16) | none |
| System / mechanical (Heimerdinger, Jarvan IV "Classic"; "Classic — General") | none |
| Unmapped champion (Locke) | none, fail closed |

## 4. Exact Combat Lab URL contract

Built only by `buildCombatLabMatchupUrl({ attacker: card.mogzy_entity_ref })` (`lib/combat-lab/matchup-link.ts`, the contract Pro Play already uses; `championSlug` → `^[a-z0-9]+(?:-[a-z0-9]+)*$`, max 40). Site-relative route `/combat-lab`, one parameter, `attacker`.

| Champion | URL |
|---|---|
| Vi | `/combat-lab?attacker=vi` |
| Draven | `/combat-lab?attacker=draven` |
| Bel'Veth | `/combat-lab?attacker=belveth` |

No patch, version, level, projection, items, runes or defender. Enforced by tests: every corpus href has exactly the key set `["attacker"]` and matches no `patch|version|level|item|rune|since|26.x`; a source-contract test scans `handoff.ts` and `CombatLabHandoffLink.tsx` (comments stripped) for `URLSearchParams`, `searchParams`, `?x=`/`&x=`, `.set(`, `patchVersion`, `patch_version`, `reportVersion`, `level`, and for `fetch`/`useQuery`/`useMutation`/`XMLHttpRequest`/`sendBeacon`, and requires the literal canonical-builder call. Adding a patch/version parameter has to change that test.

## 5. Wording contract

Visible and accessible name: **"Open {entity_name} in Combat Lab"** ("Open Vi in Combat Lab"). A test asserts the label contains none of: test, simulat, compar, impact, before, after, patch, change. Icon: a flask (`aria-hidden`).

## 6. Placement decision

The existing PH1 `entityActions` slot, registered once in `PatchReports.tsx`; the slot returns `null` for ineligible cards. It renders at the right of the entity header (desktop), and on its own row under the identity block on a phone, where a 180–216px control cannot share a 375px header with the title. One action per entity: never in a change line, group heading or Impact/Explore. It sits apart from PH4-A's entity copy-link (an icon beside the title) and does not touch Explore, so there is no clutter beside the copy/share controls.

The header edit was needed for two reasons: an empty `entityActions` wrapper would add a 12px flex gap (and, on a phone, a blank row) for every ineligible card, and a full-width label would crush the title at 375px. A test asserts no wrapper for ineligible entities.

## 7. Catch-Up

No change. Catch-Up entries already link back to the report entity ("View in Patch X"), which carries the action; Sundered Sky and other items never get one. Catch-Up does not use `PatchReportEntityHeader`, so it is unaffected.

## 8. Retained-state limitation (verified)

Combat Lab applies only `attacker` (`CombatLab.tsx` linked-attacker effect: `setConfig(c => ({...c, champion}))`) and keeps everything else in `combat-lab:last-config` (and `target-setup`, `summoners`, …). Verified in a browser: with a stored config `{champion: "Ashe", level: 11, items: ["Infinity Edge"]}`, clicking "Open Vi in Combat Lab" produced `{champion: "Vi", level: 11, items: ["Infinity Edge"], …}`. So the reader lands on **Vi with their previous level, items, runes and target**. PH4-C does not clear or change that, and the link makes no clean-room claim: it says it opens the champion, nothing more. A fresh browser (no stored config) lands on Vi/Draven with Combat Lab's defaults.

Also: Combat Lab runs Summoner's Rift kits with **current** Mogzy data, with no patch awareness. The link does not say the champion "as of Patch 26.19" and the label deliberately does not mention the patch. The slug is validated against Combat Lab's own manifest only after it loads; a catalogued champion Combat Lab does not carry leaves the selection unchanged (existing behaviour; no error state). None was seen in 26.14–26.19 browser checks (all 68 mapped champions linked; only Draven/Vi/Bel'Veth were opened).

## 9. Tests

| Run | Result |
|---|---|
| PH4-C new files | 28 pass (17 + 11) |
| Regression set: PH4-C + `lib/patch-reports`, `components/patch-reports`, `components/patch-impact` (PH4-B graph incl.), `lib/patch-impact`, `patch-impact-loader`, `lib/patch-hub-share`, `usePatchHubShare`, `hooks/usePatch*`, `pages/lol/PatchReports*` (PH4-A report/catch-up), `lib/patch-catchup`, `components/patch-catchup`, `components/patch-hub-share`, `components/lol/broadcast`, `matchup-link.test`, `CombatLab.deeplink.test` | 46 files / 872 tests: **871 pass, 1 fail** in 2 of 4 runs (see below); 872/872 in the other 2 |
| Baseline `origin/main`, same set minus PH4-C | 44 files / 844 tests pass; 42 files / 822 pass ×2 |
| ESLint on changed TS/TSX | 0 errors, 0 warnings |
| `tsc -p tsconfig.app.json --noEmit` | see §11 |

**Load-sensitive flake.** `PatchReports.catchup.test.tsx › a new hash on the same cached report follows the new target` timed out (default `waitFor`, 1.4s under load) in 2 of 4 multi-file runs of this branch, with `--maxWorkers=2` and `4`; it passed in every isolated run on this branch (file and single-test, 6 runs) and on `origin/main` (3/3), at the same ~200ms. Base passed 3/3 multi-file runs, so a small extra load from the 28 new tests plus the 17 added `Link` elements on the 26.19 page is a possible contributor, but I could not show a causal change. The test is the PH3 catch-up deep-link test and asserts nothing about PH4-C. Not fixed here (out of scope); if you want, bump that `waitFor` timeout in a follow-up.

Mutation checks: removing the Champions-section gate fails 5 tests; appending `&patch=26.19` to the href fails 12.

Coverage map to the brief's list: 1, 2 (page); 3, 4, 5, 6 (page + helper, builder equality); 7, 8, 9, 10 (helper; item/rune/system/Arena/unmapped also on the real page via a synthetic report); 11 (Vi's lines: 0 actions per change, one per card, page count equals eligible entities); 12 (entity copy-link present and copying the canonical URL beside the action); 13 (Vi and Draven Explore copy-link copy the exact change URL); 14 (Vi and Draven Explore still draw the PH4-B graph); 15 (click → one `?attacker=vi` navigation, zero new fetches, every request a GET); 16 (key-set and regex checks plus source contract).

## 10. Browser certification

Real route, Vite dev server on this worktree (port 5346), production API read-only, headless Edge via Playwright (script kept in the session scratchpad, not committed). Desktop 1280×900 and mobile 375×812 (touch, `isMobile`). The built-in browser pane was not visible (`innerWidth` 0), so it was used only to confirm hrefs; all layout numbers are from headless Edge. Header screenshots were inspected visually.

| Check | Desktop | Mobile |
|---|---|---|
| Vi 26.19 action | "Open Vi in Combat Lab", 180×40, `/combat-lab?attacker=vi`, 1 per card | same; own row under the identity block |
| Draven 26.19 | 209×40, `/combat-lab?attacker=draven` | same |
| Bel'Veth 26.15 | 216×40, `/combat-lab?attacker=belveth` | same |
| Locke 26.14/26.15 (unmapped) | no action | no action |
| Sundered Sky 26.16/26.17, runes, systems | no action | no action |
| Census 26.14–26.19 | 70 champion cards, 68 with action (the 2 without are Locke, no ref), 0 of 267 non-champion cards | identical |
| Vi change lines (incl. Passive Shield) | 2 lines, 0 per-line actions | same |
| Click Vi → URL | `/combat-lab?attacker=vi`, no hash/patch | same |
| Combat Lab receives Vi | `last-config.champion` Ashe → **Vi**; level 11 and items **retained** (§8) | same |
| Combat Lab receives Draven, fresh storage | champion Draven | champion Draven |
| Back | `?patch=26.19#…champion-vi`, Vi header top = 96px (same as before click) | same |
| PH4-A entity copy-link (Vi) | copies `…?patch=26.19#s-patch-champions__e-champion-vi` | native share with the same URL |
| PH4-A Explore "Copy link to this change" (Vi AD) | exact change URL | native share, exact URL |
| PH4-B graph (Vi, Draven) | 36 points each, crossover present on Vi | same |
| Horizontal overflow | 0 (also with graph open and after Back) | 0 |
| Duplicate IDs | 0 | 0 |
| Console/page errors, Patch Hub | none | none |
| Non-GET requests from Patch Hub (all steps) | none | none |
| Touch target | 40px high | 40px high |

**Production side effect to disclose.** My first run did not block Supabase. Loading Combat Lab (not the Patch Hub link) ran the app's normal anonymous-identity bootstrap against production Supabase: per run, one anonymous `POST /auth/v1/signup`, one `PATCH /rest/v1/profiles?user_id=…` for that new user, and two `rpc` reads, i.e. **2 anonymous Supabase users (one desktop, one mobile) were created in production**, plus Combat Lab's own `build-preview` POSTs (stateless computation). It also produced one 403 console error from Supabase. Every later run blocked `supabase.co` and showed zero 4xx/5xx and zero writes. Not a PH4-C defect (the same happens for any first Combat Lab visit), but those two anonymous users and their profile rows exist; I did not touch them. The user ids are in this session's scratch output if you want to remove them.

Not covered: Safari/iOS, real clipboard permission prompts, scroll-restoration timing on Back beyond the headless result above, and Combat Lab with a champion it does not carry.

## 11. TypeScript differential

`tsc -p tsconfig.app.json --noEmit` on this branch and on a clean detached `origin/main` (`cce36fce`): **6 errors on both, `diff` of the full outputs is empty** (OnboardingProfile.tsx(180), identity/connections.ts(263), 4× quiz/practiceLeaveContract.test.ts). No new error.

## 12. Known limitations

- Retained Combat Lab state (§8); no clean-room or "fresh setup" parameter, and none is added.
- No patch, level, items or runes cross the seam; Combat Lab uses current data. That is the intended V1.
- A mapped champion Combat Lab's manifest lacks falls back to the user's existing selection, silently (existing Combat Lab behaviour).
- The action is hidden for any champion without a `mogzy_entity_ref`, even if its name would slug correctly. Deliberate; no aliasing.
- Mobile places the action on its own row, adding 40px + gap to each champion header on a phone (header 96 → 145px at 375px).
- One load-sensitive pre-existing test flake in the combined run (§9).

## 13. Merge instructions

No conflicts expected: `PatchReports.tsx` and `PatchReportEntityHeader.tsx` were last touched by PH4-A on main (`cce36fce`). From the primary checkout:

```bash
git fetch origin && git rev-parse origin/main   # expect cce36fce…, else re-verify
git merge --no-ff patchhub/ph4c-combat-lab-handoff
npx vitest run src/lib/patch-hub-combat-lab src/pages/lol/PatchReports --maxWorkers=2
```

Rollback: revert the merge; no data or schema involved. Do not run the whole suite in one process.

## 14. Should PH4 stop here?

Yes. PH4-A (share), PH4-B (graph) and PH4-C (champion handoff) complete the "graph it, share it, try the champion" loop the audit set out, with no backend work. The remaining audit candidates all need new subsystems or would mislead: champion+level (touches Combat Lab's URL contract), item preload, before/after patch comparison (needs versioned data), quiz, Studio. Do those only on their own briefs. A PH4-D integration pass is optional: this slice touches the same two files PH4-A already integrated, and the combined regression set above already covers A, B and C together.

## Final integration gate (2026-10-06)

### 1. PH3 cached-hash test: root cause

`PatchReports.catchup.test.tsx › a new hash on the same cached report follows the new target`.

**Verdict: the test has a wrong timing assumption (category 4), which PH4-C exposed by adding a little render cost (category 2). It is not a behavioral regression.**

Instrumented (temporary `performance.now()` + `scrolled` dump at each `waitFor`), isolated single-test runs:

| Checkout | Runs | Result | Failing step |
|---|---|---|---|
| origin/main `cce36fce` | 10 + 3 | 13/13 pass | none |
| PH4-C `19aab636` | 3 + 6 | 7/9 pass; **2 failed in isolation** | W3 (same hash again), never W1/W2 |

So it is not load-dependent. It is a race inside one test. Initial landing took ~200–260ms on both checkouts. PH4-C renders 79 `<a>` / 6,240 nodes vs 62 / 6,138 on base.

Mechanism: since PH4-A, each landing calls `scrollIntoView` once immediately and **re-applies once on the next animation frame** (`PatchReports.tsx` landing effect; the frame is cancelled if a newer landing starts first). The test asserted exact call arrays/counts (`[a]`, `[a,b]`, then `toHaveLength(3)`), so it only passed when no re-apply frame fired between `waitFor` resolving and the next `navigate`. Failing runs recorded `W2 scrolled=[a,b,b]` and then `W3 scrolled=[a,b,b,b,b]` (5 ≠ 3, forever). Every recorded scroll hit the **correct** element. PH4-C's slightly heavier re-render widens the gap enough for jsdom's ~16ms frame to land; base just usually wins the race. Nothing in PH4-C touches landing, the hash effect, the query cache, requests or timers.

### 2. Fix (test only)

`src/pages/lol/PatchReports.catchup.test.tsx`: the test now asserts **per navigation** that a new scroll happened (`scrolled.length > mark`) and that every scroll since the mark targets that navigation's anchor. After each landing it flushes one animation frame so a pending re-apply can't be counted as the next landing. The no-new-request assertion is unchanged. No product code changed and no timeout was raised.

### 3. Mutation proof (product mutated temporarily, then restored)

| Mutation in `PatchReports.tsx` | Result |
|---|---|
| Landing token ignores `location.key` (same hash re-navigation no longer scrolls) | fails 3/3 (`expected 4 to be greater than 4` at the 3rd landing; the frame flush prevents a false pass) |
| Landing effect deps reduced to `[catchUp, detail]` (cached report never re-lands on a hash change) | fails 2/2 |
| Landing scrolls a different element than the hash target | fails 2/2 |

### 4. Repeated runs after the fix (PH4-C worktree)

- Failing test isolated: **10/10** pass (also 10/10 before the frame flush was added).
- `src/pages/lol/PatchReports*` (PH3/PH4-A/PH4-C page tests): 6 files, **78/78**.
- PH4-C tests: 2 files, **28/28**.
- Focused PH1–PH4 regression set (same 46 files as above): **6 runs, 872/872 each** (`--maxWorkers=2` ×3, `4` ×3).
- ESLint on the changed test: clean.

### 5. Production anonymous users (read-only findings)

Identified exactly from the captured network log of the first certification run (session transcript; Playwright request capture). They were created at about 2026-10-06 18:54Z (11:54 PDT) against project `kewgjwrzpzpeltwidvuc`:

| Viewport | auth user id | Writes observed |
|---|---|---|
| Desktop | `b84f3057-271b-46a9-bfa5-4c434a60eb25` | `POST /auth/v1/signup`, `PATCH /rest/v1/profiles?user_id=eq.b84f3057-…` |
| Mobile | `6c79bcbc-ea19-4ef5-b061-370060cdd427` | `POST /auth/v1/signup`, `PATCH /rest/v1/profiles?user_id=eq.6c79bcbc-…` |

Other requests: `rpc/owner_auth_state` and `rpc/my_pro_entitlement` (reads) and Combat Lab `build-preview` (stateless). Nothing else was written. One request returned 403, which one wasn't recorded. Identification is by exact UUID, not by name, time window or the `PATCH` display name, so there is no ambiguity with real users.

**Not verified:** I could not query production. This machine has no Supabase CLI and no DB credentials, and I didn't use any. The current state of these rows (still existing, any extra data) is unconfirmed. The owner should run this read-only check in the SQL editor first:

```sql
select id, is_anonymous, email, created_at, last_sign_in_at from auth.users
 where id in ('b84f3057-271b-46a9-bfa5-4c434a60eb25','6c79bcbc-ea19-4ef5-b061-370060cdd427');
select * from public.profiles
 where user_id in ('b84f3057-271b-46a9-bfa5-4c434a60eb25','6c79bcbc-ea19-4ef5-b061-370060cdd427');
-- any other rows keyed to them:
select c.table_schema, c.table_name, c.column_name from information_schema.columns c
 where c.table_schema = 'public' and c.column_name in ('user_id','owner_id','profile_id','created_by');
-- then count rows per listed table/column for the two ids
```

Expected: `is_anonymous = true`, null email, `created_at` ≈ 18:54Z on 2026-10-06, one profile each, no other rows.

### 6. Cleanup recommendation (not executed)

- **Do not** use `supabase/functions/purge-anonymous-users`. It deletes every anonymous user (all pages of `listUsers` with `is_anonymous`), which would remove legitimate anonymous visitors.
- If the check above matches expectations: delete exactly these two ids through the Supabase Dashboard (Authentication → Users → delete) or `auth.admin.deleteUser(id)` with the service role. First delete their `public.profiles` rows with `.eq('user_id', id).eq('is_anonymous', true)`, the same per-user step the purge function uses. Delete by id only, never by name or time range.
- If any row doesn't match (not anonymous, an email, later sign-ins, other owned data), leave them alone.
- No legitimate user is touched by an id-scoped delete.

### 7. Merge recommendation

**GO.** The only open test failure was a test defect, now fixed and mutation-proven. The regression set is green 6/6. The production users are a cleanup chore for the owner and don't block the merge.
