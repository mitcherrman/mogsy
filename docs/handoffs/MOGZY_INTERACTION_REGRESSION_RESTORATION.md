# Mogzy Interaction Regression Restoration

## Objective

Restore the established click/tap hop on the desktop Academy Hall mascot without changing the shared guide architecture, Hall layout, navigation, data behavior, or any other mascot surface.

Base: `origin/main` `0fd1bb6a682c2ba08b5da91a2d1bcd5879bc61ee` (2026-10-21).  Branch: `codex/mogzy-interaction-regression`.

## Historical evidence and conclusion

| Evidence | Original/current behavior | Conclusion |
|---|---|---|
| [`48ebd543`](https://github.com/mitcherrman/mogsy/commit/48ebd543815c8100af428a90d57797350086395c), `src/components/lol/MogzyHubGuide.tsx` | The mascot image owned `onClick={handleReact}`. The handler removed `mogzy-click-react`, forced reflow, re-added it, and animation end/cancel removed it. Reduced-motion skipped the class. Facing and contextual lean lived on separate transform layers. | Click-hop, repeat-click replay, cleanup, contextual turn/lean, and reduced-motion suppression were established together as the approved Hub behavior. |
| [`95d36ce7`](https://github.com/mitcherrman/mogsy/commit/95d36ce789b9166bad1e811cb874fcea5be04500), MG-C migration | Replaced `MogzyHubGuide` with shared `MogzyGuide`. The handoff says the goal was replacement “without changing what a user sees or hears,” but desktop did not pass `interactive`; the same commit replaced three click lifecycle tests with a decorative-only assertion. Mobile did pass `interactive`. | Exact regression introduction. The omission conflicts with the stated no-behavior-change goal, but the accompanying test made the resulting decorative state explicit in code. Therefore it is a migration regression with an intentionally updated assertion, not an evidence-free claim of an accidental edit. |
| `MogzyGuide.tsx` on `origin/main` | The shared component still owns the same retrigger technique, `mogzy-click-react`, end/cancel cleanup, a labelled-button mode, and OS/app reduced-motion handling. `interactive` defaults to `false`. | No obsolete component or new animation system is needed. |
| [`c94469ee`](https://github.com/mitcherrman/mogsy/commit/c94469ee33675631b52fbeb5ffaddb90c7447a02) + [`f6cd181b`](https://github.com/mitcherrman/mogsy/commit/f6cd181b593c48f610bc8526c7c8f204cfbc808d), `origin/fix/mogzi-desktop-click-20261010` | Added only `interactive` and `triggerLabel` to desktop, then restored a click/retrigger test. This branch is not an ancestor of current `origin/main`. | A prior minimal restoration was authored but never landed in main. The present fix reapplies it to current main and strengthens regression coverage. |
| Academy Core V3 (`8207c079`, `195526cb`) | `/lol` became Academy Core; the complete former Hall moved to `/lol/hall`. Its `MogzyOperator` is focus-driven and not a click target. | Restore the historical Hall contract at `/lol/hall`; do not invent a click behavior for the newer Core operator. |

## Current mascot inventory

| Mounted surface | Purpose | Pointer/click and motion contract | Nearby controls / tests |
|---|---|---|---|
| `/` (`MogzyEntryV2`) | Navigational entry | The whole labelled **Enter Mogzy** button contains the decorative base mascot; hover/focus/entry motion belongs to that action. Reduced motion is handled by the entry component. | Existing entry and welcome handoff tests. Untouched. |
| `/welcome` (`ChapterPlate`) | Narrative/decorative | Decorative base plate on the mascot chapter; no mascot click. | Registration controls are separate. Untouched. |
| `/lol` (`AcademyCorePage` → `MogzyOperator`) | Instructional/contextual operator | Focus changes pose/readout and triggers a one-shot hop; no direct mascot pointer handler. Idle/hop stop under reduced motion. | Destination books/instrument own activation and focus. Academy Core component/E2E tests. Untouched. |
| `/lol/hall` desktop (`LolHub` → `MogzyGuide`) | Instructional Hall guide plus cosmetic reaction | Hover/focus on four books drives bubble, lean and facing. This change restores the labelled, mascot-sized click button and existing hop. Root/central lane remain `pointer-events-none`; only the trigger opts in. | Patch Report, radio, four books, and Academy Updates are siblings/separate targets. `LolHub.test.tsx` covers their contracts. |
| `/lol/hall` mobile | Instructional Hall guide plus cosmetic reaction | Already passed `interactive`; tap triggers the same shared hop. In-flow mobile zone, not a central overlay. | Four mobile books remain links. Existing mobile Hall test. |
| `/lol/hall` Commons (`AcademyCommons`) | Environmental decoration | Base mascot is an `aria-hidden`, `pointer-events-none` CSS background with no motion or state. | Painted panels and Commons navigation remain separate. Untouched. |
| `/quiz` Leaguecraft (`LeaguecraftGuide`) | First-use/contextual guidance | Message-gated shared guide; decorative/non-interactive. Role choice or PLAY dismisses it; it never navigates or writes. | Role selector and PLAY own interaction. Guide tests. Untouched. |
| Leaguecraft signup gate (`QuizSignUpGate`) | Instructional signup prompt | Shared guide is decorative/non-interactive; account/guest/sign-in buttons own navigation and analytics. | Signup gate tests. Untouched. |
| Leaguecraft role selector (`PlayScrollRoleSelector`) | Gameplay-adjacent role presentation | `RoleMascot interactive` provides a local cosmetic hop; the surrounding capture boundary plays the existing reaction SFX. Role arrows remain the actual selector. | RoleMascot and selector tests. Untouched. |
| Ranked live arena (`CombatantPanel` → `RoleCrest` → `RoleMascot`) | Gameplay identity and feedback | Mascots accept local clicks, but attack/hit/cheer/celebrate/focus actions take precedence and can interrupt/drop cosmetic reactions. Reduced motion suppresses cosmetic reaction. | Answer grid and match controls remain separate; extensive Ranked mascot tests cover precedence/retrigger/facing. Untouched. |
| Ranked entry, mobile rail, outro, result duel | Gameplay/result presentation | Role mascots face the arena and may receive host-driven actions where supplied; these mounts are otherwise decorative and non-clickable. | Ranked intro/outro/result tests. Untouched. |
| Daily/results/discovery, Journey coach, Leaguecraft empty/error states, blog empty state, Combat Battles error, Not Found, playtest interstitial | Status, instruction, or decoration | `MogzyMascot` plates are decorative. Journey coach dismissal belongs to its containing message surface, not the image. No new mascot interaction justified. | Surface-specific tests. Untouched. |
| Global HUD identity/hat art | Identity/navigation chrome decoration | Images are decorative inside existing HUD controls; no mascot-specific click animation. | HUD menu/home controls own their interactions. Untouched. |

Dev-only mascot labs/entry previews were inspected but are not production-mounted surfaces and were not changed.

## Change and decisions

- `src/pages/LolHub.tsx`: pass `interactive` and the existing accessible label to the desktop shared guide. No wrapper, geometry, z-index, pointer layer, animation, state, callback, analytics, or data change.
- `src/pages/LolHub.test.tsx`: replace the obsolete decorative assertion. The regression test now proves a labelled `type="button"`, repeated replay without class accumulation, animation-end return to idle, reduced-motion suppression, and no route prefetch, analytics, audio, update read, or extra warm-up from the cosmetic click.
- All other mascot surfaces remain unchanged. In particular, the landing CTA, Academy Core operator, Leaguecraft guides, Commons art, and Ranked combat precedence retain their existing contracts.

## Verification

- Baseline on pristine `origin/main`: `LolHub.test.tsx` passed 87/87. Combined with `MogzyGuide.test.tsx`, 113/114 passed; the sole failure was the pre-existing stale compact cheering-asset expectation (`-240.webp` is now returned).
- Candidate: `LolHub.test.tsx` passed 87/87.
- Candidate shared-guide suite: 26/27 passed with the identical baseline-only compact cheering-asset expectation failure.
- ESLint on both changed TSX files: passed.
- TypeScript project validation reaches two pre-existing errors in `OnboardingProfile.tsx:180` and `connections.ts:263`; neither file differs from `origin/main` and neither diagnostic involves this change.
- `git diff --check`: passed.
- Browser verification: pending the repository-required explicit approval for one local bundled-headless-Chromium run. Do not claim observed browser behavior until that approval/run exists.

## Current state / next task

The minimal source restoration and unit regression protection are complete. Next: after explicit browser-run approval, verify `/lol/hall` at one desktop and one phone viewport, including hit target/stacking, repeated reaction/cleanup, reduced motion, four books, Patch Report/radio, contextual focus/hover, and Academy Updates reachability; then record the observations here. No merge, deploy, backend, or production-data action is authorized.
