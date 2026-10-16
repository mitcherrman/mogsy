# Worlds Dynasty ROG1-D1: owner-only frontend prototype

> Frontend milestone note linked to the authoritative handoff, `docs/roguelike/WORLDS_DYNASTY_HANDOFF.md` in `mitcherrman/League_Combat_Simulator` (branch `roguelike/rog1c1-dynasty-run-foundation`, PR #36). The ROG0 audit is on `mogsy` branch `roguelike/rog0-worlds-dynasty-audit`. When PR #36 is next touched, add a one-line pointer from its "Current state" section to this note.

## Status
- Branch `roguelike/rog1d1-dynasty-frontend`, cut from `origin/main` @ `7f6b365e` (UGMP, the latest frontend integration). Pushed. **Not merged, not published.**
- Route `/admin/dynasty`, wrapped in `<AdminRoute>`. It has no links from any page and is not enabled for the public.
- It needs a backend running the ROG1-C1 branch (PR #36) with `DYNASTY_ENABLED=1`. PR #36 is not deployed, so against production the page shows the "switched off" or "unreachable" state.

## What the owner can do
1. **Begin or resume a run.** `POST /runs {start_key}`. The browser keeps only the `start_key` (localStorage `mogzy.dynasty.v1.start_key`). On reload, the same idempotent call resumes the run from the server's verified replay.
2. **Draft seven players** (picks 1-5 are one per role, picks 6-7 are substitutes from any role), each from three server offers. Choosing takes two steps: select, then confirm. Cards show the following, all taken from the snapshot:
   - rating, rarity (labelled cosmetic), org and region;
   - the top three proficiencies;
   - "Top rating" and "Best mastery" flags within the offer;
   - shared org/region with the drafted roster;
   - for substitutes, the rating delta against the starter they would back up.
3. **See five starters and two substitutes** in the roster rail (a sidebar on desktop, below the content on phones). It also shows the locked champions and the relic.
4. **Choose one relic of three.** Name, rarity and effect come from the backend. Each card adds a "when it matters" line that only restates when the effect can apply. A targeted relic (`lane_specialist`) requires a lane before Equip is enabled.
5. **Pick champions.** Each starter's pool is listed with proficiencies. Other champions are offered through an off-pool picker. A champion locked for another role is disabled and labelled.
6. **Swap substitutes** into their own role only. Each substitute card shows the rating delta and their proficiency on the champion already locked for that role, because champion picks belong to the role and survive a swap.
7. **Start the match.** The page sends `play_match` and receives the opponent and the full result.
8. **Watch the battles.** The five positional battles (1 point each) and the weighted team battle (2 points) are revealed one at a time, with a running score and point ledger. The reveal can be skipped. Reduced motion, or a resumed completed run, shows everything at once.
9. **Read the explanation.** Every number comes from the backend:
   - per lane: both sides' power components, the backend total, the power gap, the logistic scale, the raw vs clamped probability, and every recorded roll (initial and re-roll), drawn as a 0-1 strip with the user's winning window and the draw;
   - for the team battle: components grouped into weighted lane power, momentum, synergy and relics/modifiers;
   - for the outcome: the points, upset and re-roll tags, contested re-roll claims, and provenance (ruleset, relic table, catalog), plus "Not a historical result".
10. **Resume without losing progress.** Covered by tests.

The synthetic-catalog label (`catalog.label` from the backend) is shown on every screen. Players are `SYN-…` and champions `Synthetic Champion NN`; nothing is presented as real. Champion names are known only after the lineup phase (the backend sends `champion_catalog` there), so draft cards show champion keys.

## Authority and failure handling
- The browser never generates a seed, offer, opponent, roll, modifier or score. `src/lib/dynasty/model.ts` only rearranges backend numbers. Its roll-window helper restates the backend rule (`roll_side` wins iff `roll < roll_threshold`), and a test checks it against the backend's recorded winner on all 16+ recorded draws.
- Responses are parsed fail-closed (`contracts.ts`): schema v1, known phase and actions, an offer in draft and relic, a match only when completed, and the user oriented as side `a`.
- **One action in flight at a time.** Each action carries the snapshot's `expected_seq` and a fresh `action_id`.

| Failure | Handling |
|---|---|
| Network | Retries the same `action_id` and `expected_seq` twice automatically, then offers Retry. The server applies an id at most once; `duplicate: true` is shown as "Already applied". |
| `STALE_SEQ` / `ACTION_ID_REUSED` | Re-reads the run and asks the owner to choose again. |
| 422 engine codes | Shows the refusal; the board is unchanged. |
| `DYNASTY_DISABLED` | Shows the "switched off" panel. |
| 401/403 | Shows "owner session required". |
| `DYNASTY_RUN_NOT_FOUND` | Clears the saved key and offers a new run. |
| `DYNASTY_RUN_INTEGRITY`/5xx | Refusal panel. |
| Unreadable response | "Unexpected response" panel. |
| Backend down on load | Lobby hint to start it with `DYNASTY_ENABLED=1`. |

## Files
New:

| File | Role |
|---|---|
| `src/lib/dynasty/contracts.ts` | Types for the ROG1-C1 public snapshot; fail-closed `readDynastySnapshot` |
| `src/lib/dynasty/client.ts` | `DynastyTransport` interface and HTTP implementation (`ADMIN_API_BASE_URL` + `buildAdminHeaders`); `DynastyApiError`; error-body mapping (`{detail:{code,message}}` and FastAPI's list form) |
| `src/lib/dynasty/model.ts` | Role mapping onto `RoleEmblem`, roll windows, lane/team/match view models, component grouping |
| `src/lib/dynasty/fixtureTransport.ts` | Recorded-path stand-in: replays real backend snapshots and accepts only the recorded action. Tests and the DEV preview only. |
| `src/lib/dynasty/fixtures/*.json` | **Real responses captured from the ROG1-C1 router** (b2f41603, FastAPI TestClient, synthetic catalog): full run (4-3 win with a Flash Ready re-roll), a 3-4 loss, a 7-0 win, and recorded error bodies |
| `src/pages/admin/dynasty/DynastyRunPage.tsx` | Page shell: lobby, phase rail, notices, fatal panels, roster rail |
| `src/pages/admin/dynasty/useDynastyRun.ts` | Run controller (resume, actions, retries, stale-seq recovery) |
| `src/pages/admin/dynasty/{DraftStage,RelicStage,LineupStage,MatchStage}.tsx` | One component per phase |
| `src/pages/admin/dynasty/parts.tsx`, `rarity.ts` | Banner, phase rail, player card, proficiency bar, roster rail, rarity frames |
| `src/pages/dev/dynasty/DynastyPreview.tsx` | DEV-only `/dev/dynasty?scenario=full|loss|stomp&delay=ms` |
| `src/lib/dynasty/dynasty.contract.test.ts`, `src/pages/admin/dynasty/DynastyRunPage.test.tsx`, `src/App.dynastyRoute.test.ts` | 31 tests |

Modified: `src/App.tsx` (+12 lines). It adds the lazy page, `<Route path="/admin/dynasty">` inside `<AdminRoute>`, and the DEV-only `/dev/dynasty`. No other existing file changed.

**Reused:**
- `AdminRoute`
- `buildAdminHeaders`/`ADMIN_API_BASE_URL`
- `RoleEmblem`
- `PlayerPortraitSlot` (monogram; correct for synthetic players)
- `MogzyMascot` (lobby, victory and defeat poses)
- Worlds-experience `SURFACE`/`Eyebrow`/`GOLD_TEXT`
- `useMotionAllowed`
- `useSfx` with existing cues (`ui.button.press`, `ranked.discovery.reveal`, `ranked.match.victory/defeat`)
- `tailwindcss-animate`

**Not reused (deliberately):**
- Champion art: the champions are synthetic keys with no art.
- Card Duel extraction: ROG0's proposed `src/components/cards/` extraction would modify the Card Duel page. That is out of scope here, so it remains a follow-up.

## Tests run
- `vitest run src/lib/dynasty src/pages/admin/dynasty src/App.dynastyRoute.test.ts`: **31 passed** (contract and transport 17, page 11, route 3).
- Wider run (`src/App*`, mascot, RoleEmblem and the new suites): 245 passed, 3 failed. The 3 failures are in `App.routeGuards.test.ts` (knowledge `master_admin` assertion) and `App.routing-contract.test.ts` (multiplayer redirects). They fail identically on unmodified `origin/main` with this branch's `App.tsx` reverted, so they are **pre-existing and unrelated**.
- `UGMP OwnerPlaytests.test.tsx` (neighbouring admin page): 14 passed.
- `tsc --noEmit -p tsconfig.app.json`: no errors in new or changed files. `eslint` on the new files: clean.

Page tests cover:
- the full run, checking that each action carries exactly `{expected_seq, action_id, kind, payload}`, that `expected_seq` runs 0..14 and that every `action_id` is unique;
- the synthetic banner;
- resume after remount (same `start_key`, Pick 3 of 7);
- a lost action retried with the same id and seq;
- stale-seq reload;
- a refused choice;
- disabled and integrity fatal panels;
- backend unreachable;
- a targeted relic sending `target_role`;
- a resumed result shown without the reveal.

## Visual check
Playwright (Chromium 1248) on the DEV preview at 1440×900 and 390×844, 12 screens each, plus an automated audit per screen. Saved locally to `C:\Users\mlmit\OneDrive\Desktop\rog1d1-dynasty-shots` (not committed).
- **Audit:** 0 horizontal overflow, 0 clipped elements, 0 off-screen buttons on every screen. Reduced motion shows the result at step 7 immediately on both sizes.
- **Fixed during the pass:**
  - **StrictMode double-mount bug:** the controller's `alive` ref stayed false, so responses were dropped and the button hung on "Drafting…".
  - Org and region truncated on draft cards.
  - Champion names truncated in mobile lineup and lane cards (the lane header is now two rows).
  - The opponent's re-roll was labelled with a team id; it now reads "the opponent".
  - The page is now scrolled to the top on each phase change.
  - Primary buttons are full width on phones.
- **Known cosmetic issues:**
  - Draft cards with two flags have a taller header than their neighbours.
  - On phones the roster rail sits below the stage, so the owner scrolls to see it.
  - The global Mogzy HUD floats over the top of the page on scroll, as on other full-screen admin pages.

## Remaining work
1. **Live smoke test against a local backend with a real owner session.** The contract is pinned by recorded real responses, but the page has not been driven against a running `uvicorn` with Supabase owner auth and CORS from the vite origin. Recipe: run the backend from the ROG1-C1 branch with `DYNASTY_ENABLED=1`, set `VITE_COMBAT_API_URL`, sign in as the owner and open `/admin/dynasty`.
2. Mirror the authoritative handoff into `mogsy`, or add the pointer to this note in the backend handoff.
3. Card Duel `GameCard`/`FlippableCard` extraction (ROG0 §5.2) if the owner wants one card system.
4. Dedicated `dynasty.*` SFX cues, and a team-crest VS intro once real orgs exist.
5. Later milestones, all out of scope here: encounters (ROG1-C2), series (BO3/BO5), Fearless, the 8-team bracket and the real catalog (ROG1-B).
