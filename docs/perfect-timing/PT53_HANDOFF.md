# PT5.3 — Blind Timing, Automatic Flow and Effect Durations

Status: **planning/specification committed; code NOT implemented; no production changes.** Owner approved exploring the full workstream on 2026-10-19. Branch `perfect-timing/pt53-blind-flow-research`. Read `PT52_HANDOFF.md`, `PT51_HANDOFF.md` and `PT5_HANDOFF.md` first.

## Product objective

Make Perfect Timing a high-tempo, **blind** game of LoL timing intuition. The game controls **when an event starts**; the player controls **when it ends**. Reuse the polished PT5.2 Arcane Chronometer, artwork and sounds, but stop exposing elapsed seconds or periodic elapsed-time cues. Add a curated **Effect Durations** category (stasis, resurrection, protection, CC, stealth, buffs/debuffs, DoT) alongside the existing cooldown challenges.

## Delivery lanes — keep separate

**A. PT5.3A (first PR; frontend/game-engine only): Blind automatic flow.**
- A clear, loud but accessible **3, 2, 1 → CAST/ACTIVATE** countdown opens each round, with a fixed count-in animation and sound. It is *pre-start* only.
- The timing engine accepts an explicit `AUTO_START` event with monotonic timestamp, not synthetic pointer/key events. The event must be recorded at the **actual executed start**, never backdated to an animation/CSS timestamp.
- After auto-start, the player only presses once to **STOP**. Reject attempts before start and guard any 3→2→1 key/press bleed. Preserve min-run, dedupe, visibility void, exact engine-submitted elapsedMs, server lock contracts.
- Blind run: **no stopwatch digits**, no whole-second ticks, no every-fifth accent, no synchronized sweep/pulse/progress representing elapsed time. Maintain a static/ambient clock face and finite cast/lock effects. No time cues tied to hidden target.
- On stop show lock burst, then authoritative reveal with YOU vs TRUE, error and rank/item lesson. Brief *readable* dwell; then automatically proceed. For Mastery Slice play Rank Up/Item Equipped transition before the next count-in. Don't require Continue to advance normal rounds.
- Decide explicit control policy during review: owner recommendation **pause only between attempts**; resume re-counts in, not silently starts. Allow exit and accessibility/reduced-motion without breaking zero-scroll. Provide user-settable pacing or a nonintrusive "Hold" between-round control if browser evidence shows feedback is too rushed.
- **Initial timing suggestions only, subject to playtest**: first countdown 3 s, reveal ~2.5 s, slice lesson transition ~1.5 s; no extra waiting beyond these. Never auto-advance away from a live server error, interrupted round or unresolved submission; keep recovery actionable.
- Test race conditions (slow tab, throttling, canceled countdown, backgrounding, resume, unmount, double-press, keyboard and touch), full 14 viewport zero-scroll matrix, reduced motion, no leaked target, Real Browser.

**B. PT5.3B (subsequent backend+frontend PRs; independent of A): Effect Durations authority and playable catalog.**
- **Do not put effect durations into existing `cooldownRaw` or pretend they are cooldowns.** Introduce explicit `challenge_kind`, `event_start`, `event_end`, `duration_ms`, `conditions`, rank/variant and independently verifiable patch provenance. Prefer a versioned editorial manifest + backend validation and server-authoritative deal/lock/reveal; client never receives secret duration before lock.
- Patch scope: **PC League Summoner's Rift** with an explicit frozen patch. On 2026-10-19, patch 26.20 is live; 26.21 is scheduled for 2026-10-21 (recheck on rollout). Do not automatically equate Mogzy's older canonical cooldown snapshot (26.18) with certified 26.20 durations.
- A candidate is playable only once its exact rank, target event, conditional scenario, exact integer milliseconds, source and reviewed patch revision are certified; otherwise keep it research-only.
- Different semantic outcomes: end of stasis, resurrection completed, root/sleep ending, protection-zone expiry, stealth ended, DoT expired (single application/no refresh). Don't label all protections as "invulnerable."
- Duration grading can reuse existing relative-error tiers *only after explicit tests and product acceptance*, but must use backend-authoritative targets. Very short durations may need a difficulty/fairness review.
- Presets can deliver "mixed" runs and thematic effect packs after the initial curated cohort passes acceptance. Existing Random Run/Mastery Slice preserved until owner chooses distribution.
- Sounds: original Mogzy synthesized event-specific cues (cast, stasis, revive, sleep, burn), respecting mute. Do not extract or redistribute Riot-recorded ability/item SFX until license/rights are verified.

## Consolidated candidate inventory

Indicative durations below are **NOT production-certified** unless separately signed off against the frozen target patch.

| Effect | Event to time | Indicative seconds | Conditions and priority |
|---|---|---:|---|
| Zhonya's Hourglass | stasis activation → stasis ends | 2.5 | Priority A, fixed. Legacy Mogzy Zhonya timing game should be located/audited; not yet located. |
| Guardian Angel | death triggers resurrection → player revives | 4 | Priority A, must mark correct start event. |
| Vladimir W | Sanguine Pool begins → untargetability ends | 2 | Priority A. |
| Xayah R | Featherstorm untargetability start → ends | 1.5 | Priority A, verify event endpoint. |
| Tryndamere R | Undying Rage activation → death prevention ends | 5 | Priority A; **cannot die**, not universally invulnerable. |
| Kindred R | Lamb's Respite zone created → zone expires | 4 | Priority A; zone duration, **not blanket invulnerability**. |
| Lillia R | sleep begins (AFTER drowsy) → sleep ends | **2.5 / 2.75 / 3** at R rank 1/2/3 | Riot **26.20** verified, no wake-up damage; rank progression candidate. |
| Neeko E — FIRST target | first E hit applies root → normal root ends | **0.7 / 0.9 / 1.1 / 1.3 / 1.5** at E ranks 1–5 | Patch 26.20 champion-data listing; zero tenacity, no cleanse. Need source certification and 0.7 s fairness playtest. |
| Neeko E — AFTER passing through an enemy | empowered E hits later target → root ends | **2 / 2.25 / 2.5 / 2.75 / 3** at E ranks 1–5 | Riot 26.20 **empowered** values; projectile has already struck another enemy (minion/champion), not first target; zero tenacity. Show the through-target geometry/condition clearly. |
| Kayle R | Divine Judgment invulnerability begins → ends | **2.5 at all R ranks** | Riot 13.9 removed previous 2/2.5/3 rank scaling; do not create rank-varying duration lesson. |
| Zilean R — buff | Chronoshift buff applied → 5 s revive-protection window expires | 5 | Only if no lethal damage triggers it. |
| Zilean R — rebirth | lethal damage triggers Chronoshift → resurrection completes | 3 | Clock begins **on lethal trigger**, NOT when Zilean casts R. |
| Liandry's Torment | last qualifying hit applies burn → burn expires | 3 | One application; no refresh. Distinguish tick cadence. |
| Blackfire Torch | last qualifying hit applies burn → burn expires | 3 | One application; no refresh; distinct from Liandry, confirm canonical item ID. |
| Fizz E | start untargetability → normal max untargetability ends | ~1.25 | No early recast; multi-phase endpoint not certified; later wave. |
| Talon R | stealth begins → maximum stealth ends | up to 2.5 | No attack/recast; later wave. |
| Kha'Zix evolved R | evolved single invisibility activation begins → ends | 2 | Evolved only, one activation, NOT total recast window; later wave. |
| Akali W | shroud appears → base shroud lifetime ends | 5 / 5.5 / 6 / 6.5 / 7 | Verify by patch; shroud duration is NOT uninterrupted stealth. |
| Bard R | Tempered Fate stasis begins → ends | ~2.5 | Verify. |
| Morgana Q | Dark Binding root applied → root ends | rank dependent | Verify all five ranks; zero tenacity, no cleanse. |

Extra candidate families for later exploration: ignite/grievous-wounds debuffs, Nasus W Wither, stun/root/knockup durations, stealth and invisibility, cleanseable marks, shield durations, damage-over-time ticks versus total lifespan. Keep unverified families OUT of playable pool.

## Neeko E correctness — user specifically emphasized this

The first enemy that E strikes gets **normal** root duration. The projectile becomes **empowered after striking an enemy**, making later hits use the **empowered** root. The first enemy can be a minion or champion. Build two distinct question variants:
- `neeko_e_first_target`: "E hits this champion directly as its first target" (normal duration).
- `neeko_e_pass_through`: "E passes through a minion/champion, then roots this champion" (empowered duration).
Never use empowered 2–3 s if the champion is first hit; never assume the same target receives both root durations.
Reference Riot 26.20: https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/
Patch-26.20 champion-data listing: https://pharos.wiki/lol/en/champions/Neeko?patch=26.20
Patch history for first-versus-subsequent hit mechanics: https://leagueoflegends.fandom.com/wiki/Neeko/LoL

## Sources / patch authority

- Riot 26.20 official Lillia 2.5/2.75/3 and empowered Neeko 2/2.25/2.5/2.75/3: https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/
- Riot 14.18 previous Lillia normalization: https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-18-notes/
- Riot 13.9 Kayle normalization: https://www.leagueoflegends.com/en-gb/news/game-updates/patch-13-9-notes/
- Riot patch schedule (26.21 expected Oct 21): https://support-leagueoflegends.riotgames.com/hc/en-us/articles/360018987893-Patch-Schedule-League-of-Legends
- Further wiki candidates and owner history documented in the conversation's `PT53_EFFECT_DURATION_CANDIDATES.md` research ledger; source links should be integrated during B editorial certification, not trusted blindly.

## Acceptance / sequencing

1. Ship **no code** as part of this research/spec commit. Keep branch for Claude handoff.
2. Fresh implementation instance reads this handoff and existing PT5.x handoffs, checks current `main` and opens a **separate PT5.3A branch** (not from stale spec branch).
3. Implement, test, record desktop/phone video of auto-start blind loop, owner review/PR; **do not merge/deploy without explicit approval**.
4. Another scoped PT5.3B backend authority investigation: research canonical content sources for active patch; implement versioned audited effect manifest, tests, then FE category and original sound palette. Never ship guessed targets.
5. User acceptance should judge pacing and actual gameplay fun before considering public rollout; owner-only stays until approved.

## Implementation environment
Frontend `mitcherrman/mogsy` (`main`, Lovable deployment), backend `mitcherrman/League_Combat_Simulator` (`master`, Railway production); **no Docker**. Use isolated worktrees, handoff updates, screenshot/video captures, preserve all Perfect Timing input safety and zero-scroll guarantees.
