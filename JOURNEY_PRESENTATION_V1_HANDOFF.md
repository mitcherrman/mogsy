# JOURNEY-PRES-V1: Journey questions in the Mogzy question system

| | |
|---|---|
| Branch | `journey-presentation-v1` (worktree `.worktrees/journey-pres-v1`) |
| Base | production `origin/main` `6a1e5282` |
| Not merged | SFX `2153d4c8`, Formula/Calculator `cf98dbd7` |
| Scope | presentation only; no backend change |
| Status | local commit only, **not pushed** |

## Root cause of the missing Journey background

The backend already sends every Journey child its own `motif` (JX2), and the child renderers already draw it:
- the structural views draw it through `AtomicRecallQuestionView` and `ComparisonQuestionView`;
- the prose and Combat path draws it through `InteractiveScenarioSurface`.

It never showed because of **one CSS rule** in `src/index.css`:

```css
.journey-question .question-motif-layer { display: none; }
```

JOURNEY-UI2 added this rule for two reasons:
1. "The board is the scenario art." But the board is state, drawn in the media region. The motif is a separate QF1 axis.
2. The motif's 40rem bleed pseudo-element gave the scrollable `.journey-question` a phantom scroll range.

`showMedia={false}` → `mediaScale: "none"` only removes the ISS media **band**. The motif was already decoupled from it in code. Only the CSS hid it.

## Exact fix

- The `display: none` rule is replaced by a clip at the motif's own host:
  ```css
  .journey-question .question-motif-host { overflow: clip; overflow-clip-margin: 6px; }
  ```
  `clip` does not create a scroll container, and clipped overflow adds nothing to the ancestor's scrollable area. `.journey-question` therefore scrolls exactly as far as before. This was measured: `scrollHeight === clientHeight` at every certified width.
- The QF1 treatment is untouched: the art, 0.3 opacity, filter and crop, and the phone rule `display: none` below 640px (the same as non-Journey questions).
- The motif always comes from the child. Champion and Matchup children show `champion_studies`, and Combat children show `combat_workings`. The motif changes when the child changes. A child with no motif draws nothing, and there is no blanket Journey motif.

## Focus media

- **Pure rule:** `src/lib/journey/focusMedia.ts` `journeyFocusMediaFor(challenge)`.
  - Its input type is `Pick<MasterySliceChallengeView, "presentation" | "challengeIndex">`. It cannot see answer options, the prompt, a reveal or any private field.
  - It reads the server's pre-reveal `presentation` blob (RR1). That is the same blob the ordinary slice's `ScenarioMediaBand` uses.
  - It reads that blob through the same pre-reveal selector the band and the RFX1 preloader use: `selectScenario(source, false, null)`.
  - So a spoiler subject yields `null`. The reveal-time subject upgrade and an item's missing component are never computed.
- **Component:** `src/components/journey/JourneyFocusMedia.tsx`. It is one reusable component, mounted once, last in `JourneyChild`, on all three paths (structural, prose and Combat). It is `aria-hidden`, because every word on it is already in the prompt.

| Question | Focus object |
|---|---|
| Ability cooldown / cost / Combat damage (`combat_cooldown` subject with `ability_icon`) | ability icon, large, with its slot badge, on the champion's splash; caption: champion · ability · rank |
| Champion stat (`combat_cooldown` subject, no ability) | champion portrait on its splash; caption: name · metric · level |
| Item subject (`item_analysis`) | item icon + name (no Journey family serves one today) |
| Matchup (`matchup` subject) | both champions' splashes facing, VS medallion + metric label |
| no presentation / spoiler / unknown | nothing |

- **Placement:** in flow, after lock-in, in the parchment's leftover space. It never overlaps the prompt, answers, timer or board.
  - The boxes between `.journey-question` and the slot grow to fill (`flex: 1 0 auto`). The slot is a size container (`flex: 1 1 0`), so it gets only what the question leaves over.
  - **Full plate:** at 72px or more.
  - **Compact plate:** from 52px to 96px. It shows one caption line and a smaller hero.
  - **Hidden:** under 52px. It is never squeezed, and never scrolled into.
  - **Below `lg`:** the page scrolls, so the slot has a 7.5rem basis.
  - The slot's `space-y` margin is zeroed. An empty slot's 12px margin alone had pushed lock-in below a 1024×768 card.

## Matchup treatment

- The mechanics are unchanged, and there is no new motif id: the comparison stays `champion_studies`.
- **Focus plate:** two facing splash halves with a portrait and ability name each. A VS medallion carries the served metric label ("Cooldown").
- **Board order:** the plate follows the board's side order, so the player is on the left. This is the same swap rule as `JourneyMatchupSides`.
- **Side tiles:** the existing `JourneyMatchupSides` tiles now carry their champion's splash as a darkened, masked underlay. The text and tile height are unchanged.
  - This keeps the confrontation visible when the card has no room for the plate. That happens on 1024×768 and 1280×800 Matchup cards.

## Board splash treatment

- **Seam:** `MasteryAssets` gains an optional `championSplashUrl`.
  - `MasteryAssetsProvider` implements it with the existing `getChampionSplash(manifest, name)`, using the same module-cached manifest.
  - It is optional, so every existing resolver and test double stays valid, and "no resolver" means no art.
- **Rendering:** `JourneyStateBoard` `SideSplash` sits inside each side panel and is absolutely positioned.
  - It is bled to the board edge, and the board clips it.
  - It is masked toward the seam: the player's splash fades rightward, and the opponent's is mirrored.
  - Treatment: `opacity: 0.42`, `brightness(0.7)`, `aria-hidden`.
- **Stability:** it takes no layout, so the board cannot change size when the art loads or fails. The board height was measured stable per width.
- **Disclosure:** it is keyed only on `side.championId` / `side.championName`, the public identity already printed beside it.
- **Room to grow:** it fills the sparse state visually without adding structure, so the board keeps its rows free for later marks, stats, ranks and items.

## Role emblems

- **Question roles (shipped):** these reuse `QuestionRoleEmblems` / `RoleEmblem` and the canonical `public/assets/ranked/mogzy-role-icons/*.svg`. No new icons were made.
  - **Source:** only the on-screen challenge's own `challenge.roles`. `masterySliceModule` passes `current.roles` on the question branch only. The pending and waiting branches pass nothing, and the board drops them while a beat runs.
  - **Where:** the board's step header, beside "Journey · Step N of M" and before STATE.
  - **Why the header:** a separate row cost 29px and pushed lock-in out of a 1024×768 card. The header already describes the question on screen and costs nothing.
  - **No duplicate:** the prose surface's own meta row (drawn below `lg`) no longer repeats the emblems.
  - **Proof that it never uses the recipe role:** Lucian's recipe `role` string is `"bot"`, while its challenges' `roles` are `["adc"]`. The badge shows `adc`.
  - A universal question has no badge.
- **Player role (found, implemented):** the authoritative field exists. It is `players[].role`, R1's role frozen per participant at match creation, and it already reaches `CombatantView.roleId`.
  - Daily children are created through `create_bot_match` with no explicit role. With R1 on, that freezes the account's stored ranked role. This was checked read-only in backend `daily_challenge/wiring.py` and `ranked_public/service.create_bot_match`.
  - In a Journey the banner's role mascot is replaced by the champion crest. `CombatantPanel` now draws a `RoleEmblem` beside the role label, from `roleId` only.
  - A role-less participant gets no emblem.
  - Outside a Journey nothing changes, because the mascot already shows the role. The phone match bar already drew `RoleEmblem`.
  - The Journey recipe `role` string is never read.

## Responsive results

Harness: `/dev/journey-arena`, real J4 captures (Lucian: Champion / Matchup / Combat children; Pantheon: champion-stat child). No width had horizontal overflow, and no width had question scroll (`scrollHeight − clientHeight = 0`).

| Width | Board | Motif | Focus (Champion / Matchup / Combat) | Lock-in |
|---|---|---|---|---|
| 375×812 | 121px, stable | off (QF1 phone rule, same as non-Journey) | 112px plate on all four (full page scroll) | above the plate |
| 390×844 | 127px, stable | off (same rule) | 112px on all | above the plate |
| 1024×768 | 200px, stable | on | hidden / hidden / hidden (15–47px leftover) | inside the card, no scroll |
| 1280×800 | 208px, stable | on | compact 52px / hidden (50px) / 75px | inside the card |
| 1440×900 | 200px, stable | on | full / full / full; Pantheon champion 148px | inside the card |

- Answers stay fully accessible at every width, and nothing is clipped. At 1024×768 the question height is 339px, the same as before this change.
- **Non-Journey Champion / Matchup / Combat surfaces:**
  - `OrdinaryChild` is unchanged.
  - Every new CSS selector is scoped to `.journey-*`.
  - The `MasteryAssets` field is optional and additive.
  - Their suites still pass.

Screenshots: `docs/handoffs/journey-presentation-v1/*.jpg`. They were taken with headless Edge, and their banner labels render faintly in headless mode.

## Tests

- **New:** `src/lib/ranked-core/modules/masterySliceModule.journeyPresentation.test.tsx`, 20 tests on real J4 captures.
  - **Motif:** the stylesheet no longer hides the motif and clips it instead. Each child (structural, comparison, prose) draws its own motif layer from its own challenge. The motif changes `champion_studies` → `combat_workings` with the child. No motif means no layer.
  - **Focus media:** the object is correct for each child kind. Rewriting answer options, the prompt, the semantics, a reveal or the correct answer leaves the choice identical, and presentation alone reproduces it. A spoiler or missing presentation gives `null`. The slot is the child's last element, and the figure holds no answer value. The Matchup plate keeps the board's sides.
  - **Question roles:** they come from `challenge.roles` (`adc`, not the recipe's `bot`) and change with the child. A universal question has no badge anywhere.
  - **Board underlay:** each side uses its own champion's public id and name, is `aria-hidden` inside its panel, and there is no box without a resolver.
  - **Banner role:** the emblem comes from `roleId`. It is absent for a null role and outside a Journey.
- **Existing suites:** journey, ranked-core, ranked-arena, question-surface, mastery, quiz-ranked, ranked-public and dev harness. 219 files, 2770 tests, 2764 passed.
  - The 6 failures are exactly the known pre-existing set that JOURNEY5 recorded: `QuestionMotifLayer.qf1` 1, `AnswerGrid.elimination` 2, `QuestionStageGeometry` 3.
- **`tsc -p tsconfig.app.json --noEmit`:** 2 errors, both in untouched Supabase-typed files (`OnboardingProfile.tsx`, `identity/connections.ts`). None are in changed files.
- **`npm run build`:** passes. The build rewrites `public/sitemap.xml`; that change was reverted and not committed.

## Deferred / not done

- `!` knowledge marks, hover facts, calculator/formulas, SFX, beat durations, level/rank/item and stat-delta animation, dynamic curriculum and backend changes are all out of scope and untouched. Motion V1 was not started.
- **Focus media on height-locked 1024×768 cards** (and 1280×800 Matchup cards) is hidden by design: there is no leftover space without making the question scroll. The Matchup side tiles' splashes carry the confrontation there. To show a plate on those cards, some existing question height would have to be spent, which is an owner call.
- **Motif on phones:** off below 640px. This is the shared QF1 rule for all questions, not a Journey choice.
- **The Generator Lab** passes no `journey`, so it is unaffected.

## Final SHA

The commit carrying this file (`git log --oneline -1` on `journey-presentation-v1`).
