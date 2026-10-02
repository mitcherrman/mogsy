# JPX — Journey production-playtest UX pass (local, fast verification)

Branch `jpx/playtest-ux` from `origin/main` `66fc472e`. Fast pass: affected tests + screenshots only (no full Vitest, no 1,680-state sweep, no baseline differential).

## Changes
1. **No reveal perimeter.** `.ranked-question-stage:has(.journey-viewport) .ranked-result-edge { display: none }` (index.css, "JPX" block). RFX1's green/red ring + wash are Ranked's; the Journey keeps the centred CORRECT / INCORRECT / TIME'S UP stamp, verdict pill, tablet correctness and Reasoning Chain (all untouched). Checked in-browser by injecting an edge node: computed `display: none`.
2. **STATE coach** (`CoachPill`, JourneyStateBoard): same copy, portalled and positioned from the board's rect so it rests on the board's top edge, right-aligned to the header buttons — outside the board's contents at 390 and 1280. Dismiss/timer/once-only logic unchanged.
3. **Whole ability tile** opens retained knowledge: the `!` button's invisible hit area now spans the tile (`.journey-know--ability::before`). Same button, so hover/tap/keyboard/popup content are unchanged; unknown abilities stay inert.
4. **Item and shard reference popups** (`JourneyReferencePopover.tsx`, `lib/journey/itemReference.ts`).
5. **Button affordance**: cursor + brightness + thin gold outline (hover/focus/tap), 1px lift only under `prefers-reduced-motion: no-preference`. Portrait, known ability tile, occupied item, shard. Empty slots carry no `data-inspect`. Outline (not box-shadow) so focus shimmer / changed-state / `!` are unaffected.
6. **Role slot**: `.journey-role-slot` always renders beside the level, sized by a `::before` sizer ("Atk" compact / "Attacker" band, not in DOM text); the Attacker/Target chip arrives inside it. No champion-specific CSS.

## Authority for item / shard values
- **Items**: the public canonical item API the item pages already use — `/api/items` (id → slug) then `/api/items/{slug}` `stats[]` (`label` + `display`, printed as `+display label`). Fetched on first open, cached; shows "Loading stats…" / "Stats unavailable right now." on failure. Stats only (no effects text).
- **Shards**: the *served* `stat_sources` (backend stat-mod authority values, Adaptive Force already resolved for that champion), read from the side's stats and the portrait popup's current checkpoint, matched on `row` + `shardId`. No frontend calculation.
- **Limitation (real, not a blocker for this pass)**: the backend only publishes shard contributions inside `stat_sources` of a *stated* stat (today: Zed's Bonus AD). A shard with no served source shows its name/row and "No value is published for this shard in this state." Full "every shard, from the start" needs a backend addition (e.g. serve per-shard contribution in `stat_mods`, or a public `stat-mods` endpoint) — `mastery.runes.stat_mods` is the authority but is not exposed. Nothing derived is shown through either popup.

## Verification
- Tests (12 files, 244 tests): journey component tests + `masterySliceModule.{jp4,jp5,knowledge,portraitPopup,stageGrammar,motion,journey,visualLanguage}` + new `JourneyReferencePopover.test.tsx`: **all pass**. Updated one assertion (`knowledge.test` "no item ever carries a mark": items are now inspect buttons, still never a `!`). Added a reduced-motion-compliant CSS structure to satisfy the JP5 motion guard; item-popup test takes ~30s (cold import) — has its own 60s ceiling. Pre-existing `onTaskUpdate` timeouts under load may still print.
- `tsc` clean for the touched files.
- Screenshots: `docs/handoffs/jpx-playtest-ux/` (Zed/Ahri reference Journey, step 2): `desktop|mobile-{live,reveal,item-popup,shard-popup,ability-popup,coach}`. Harness (`/dev/journey-arena`) has no result overlay, so the perimeter removal is proven by CSS test + in-browser computed style, not a screenshot.

## Not done / next
- Backend shard-contribution publishing (above) if the owner wants all shards inspectable from step 1.
- Local only; not pushed or deployed.

## Shard reference follow-up (every shard inspectable from step 1)
- **Backend** (`League_Combat_Simulator` worktree `.worktrees/jpx-shard-reference`, branch `jpx/shard-reference`, `df526a57`, from `origin/master` `5d904438`): `sides.<side>.stat_mods[]` gains optional **`effects: [{key, label, value, unit}]`** (`unit` = `flat | percent | per_level`) from `mastery.runes.stat_mods.describe` — the shard's own canonical number (Adaptive Force 9, Attack Speed 10%, Health per level 10 …), never scaled to champion/level, no Journey knowledge gating. Omitted (fail closed) if a stat has no label; excluded from `state_key`.
- **Frontend**: `j3.ts` reads `effects` optionally (strict reader otherwise unchanged); `JourneyShard.effects`; the shard popup shows served `effects` first, `stat_sources` only when a backend does not serve them. jp5 Zed/Ahri fixtures were patched with real backend output; jref fixtures stay old to prove the compatibility path.
- **Deploy order: frontend FIRST, then backend.** The current production reader is a strict allowlist: an `effects` key on `stat_mods[]` would fail the read of every Journey with a shard page (the reference Journey). New frontend + old backend works (popups fall back to `stat_sources`/"not published"). Rollback: backend first.
- Screenshots: `shard-{offense,flex,defense}-zed.png`, `shard-offense-ahri.png`.
