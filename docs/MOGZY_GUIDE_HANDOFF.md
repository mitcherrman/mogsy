# Mogzy Guide — MG-A foundation handoff

Branch `mg/a-guide-foundation`, based on `origin/main` `6231bfb6` (did not move during the task).
Infrastructure only. **No Hub, Leaguecraft, signup, Landing or Welcome behavior was changed.**

## Objective

One small reusable substrate so several surfaces can host the same Mogzy guide:
canonical `MogzyMascot`, an authored per-surface anchor, a speech bubble, a compact
message contract, optional look/lean target, a tiny motion vocabulary, desktop/mobile
authored placement, reduced motion, four message priorities, and one-time local
persistence. Mogzy **consumes** product state; he is never an authority for Ranked,
quiz, auth, Premium, Daily, etc.

## Frozen public API

Import **only** from `@/components/mogzy-guide` (`src/components/mogzy-guide/index.ts`).
Do not import deeper files, and do not add parallel types/APIs. If the contract is
insufficient, stop and report rather than extending it locally.

```ts
// Messages ------------------------------------------------------------------
type GuidePriority = "contextual" | "first-use" | "hover" | "ambient"; // HIGH → LOW
interface GuideMessage {
  id: string;                       // stable within a surface
  priority: GuidePriority;
  text: string;                     // ≤ GUIDE_MAX_TEXT_LENGTH (100)
  title?: string;                   // ≤ GUIDE_MAX_TITLE_LENGTH (32)
  pose?: MogzyMascotPose;           // overrides the rest pose while active
  target?: { direction: "left"|"right"|"up"|"down"; distance?: "near"|"far" };
  cue?: "hop";                      // one-shot when the message becomes active
  ttlMs?: number;                   // auto-hide; expiry == dismissal
  dismissible?: boolean;            // Escape / tap on interactive guide
  once?: "show" | "dismiss";        // persist (localStorage) when shown / when dismissed-or-expired
}
type GuideHoverMessage = Omit<GuideMessage, "priority" | "once">;

// Controller ----------------------------------------------------------------
useMogzyGuide({ surface, messages, enabled?, storage?, ambient? }): {
  message: GuideMessage | null;     // the ONE message to show
  hover(m: GuideHoverMessage): void;  clearHover(): void;   // 140ms grace
  dismiss(id?: string): void;  resetSeen(): void;
}

// Placement (authored, deterministic) ---------------------------------------
interface GuidePlacement {
  anchor?: { top?; right?; bottom?; left?: string; centerX?: boolean }; // CSS lengths; omit = in flow
  size: string;                                  // mascot width, CSS length
  bubbleSide: "top" | "bottom" | "left" | "right";
  bubbleWidth?: string;                          // default "min(220px, 60vw)"
  restFacing?: "left" | "right";                 // default "left" (art's native facing)
}
interface GuidePlacements { desktop: GuidePlacement; mobile?: GuidePlacement } // mobile = viewport < 768px

// Renderer ------------------------------------------------------------------
<MogzyGuide
  surface="hub"                     // same string as the hook; test ids = `mogzy-guide-${surface}[-bubble|-lean|-facing|-react|-live|-trigger]`
  message={controller.message}
  placement={placements}
  layout?                           // force "desktop"|"mobile" (tests); default = viewport
  pose?="base"  interactive?=false  triggerLabel?="Mogzy, guide"
  onActivate?  onDismiss?={controller.dismiss}  className?
/>
```

Also exported: `useGuideLayout`, `selectGuideMessage`, `isCompactGuideCopy`,
`createGuideStorage`, `guideStorageKey`, `GUIDE_PRIORITIES`, `GUIDE_LEAN_PX`
(`near` 32px / `far` 96px, capped at 18vw), `GUIDE_AMBIENT_DEFAULTS`
(4s first delay, 6s visible, 24s gap), `GUIDE_HOVER_CLEAR_DELAY_MS`.

### Behavior rules (part of the contract)

- **One message at a time.** Highest priority wins; ties → earliest in `messages`
  (list the most important contextual message first). `hover` outranks only `ambient`:
  a live `first-use` message blocks hover reactions until dismissed/expired.
- **Ambient** messages are never shown immediately; they rotate one at a time on the
  ambient cadence and always yield to higher priorities.
- **Persistence**: `once` is keyed `mogzy-guide:v1:{surface}:{id}` in `localStorage`
  with in-memory fallback if storage throws. `once:"show"` is recorded on first
  display but stays up for the rest of that mount; it is excluded on the next mount.
  Non-`once` dismissal is session-memory only. There is no backend/account sync.
- **State stays external.** The surface computes `messages` from its own state each
  render; the hook never reads product state and never gates product actions.
- **Accessibility.** The visible bubble is always `aria-hidden`. `contextual` and
  `first-use` text is announced through ONE persistent `role="status"` polite live
  region; `hover`/`ambient` are never announced — the surface must expose hover copy
  to AT itself (e.g. `aria-describedby` on the hovered control, as the Hub does).
  Mount the guide **outside any `aria-hidden` subtree** if announced messages matter.
  The mascot is decorative (`alt=""`, `aria-hidden`) unless `interactive`, which renders
  one labelled `<button>`. The guide root is `pointer-events-none`; only that button
  takes pointer events. A `dismissible` message is dismissed by Escape or by activating
  the interactive button (wire `onDismiss={controller.dismiss}`); a surface may also
  call `controller.dismiss()` from its own "Got it" control.
- **Reduced motion** (OS `prefers-reduced-motion` **or** app `html.reduce-motion`,
  via `useReducedMotionPreference`): no idle bob, no lean, no turn, no hop; the bubble
  appears with no slide/fade and carries all information. `data-motion="still"`.
- **Mobile**: `placement.mobile` (falls back to desktop). Authors pick a spot that is
  free on each layout; the only runtime correction is shifting the **bubble** back
  inside the viewport (8px margin; re-measured on resize, image load and lean landing).

### Motion vocabulary (reuses the existing Hub stack — no second animation system)

`idle` (`.academy-mogzy-float`), `lean` (`.mogzy-lean-glide`, from `target`),
`turn` (`.mogzy-facing-turn`, mirror toward left/right targets), `hop`
(`.mogzy-click-react`, from `cue:"hop"` or a tap). One transform per nested layer.

## Important decisions

- Reused `MogzyMascot`, `useReducedMotionPreference` and the existing motion CSS classes;
  the Hub files (`MogzyHubGuide.tsx`, `hub-guide.ts`) were **not touched or refactored**.
  The Hub's per-mode pixel tuning and bubble `x/y/yNarrow` offsets are Hub-specific and
  deliberately not part of the generic contract.
- Message/priority/once logic lives in a hook so surfaces pass plain data; the renderer
  has no state of its own beyond animation/clamp bookkeeping.
- Distance is a word (`near`/`far`), never px. Authored placement is data, not CSS in
  the surface.
- Test ids are per-surface (`mogzy-guide-{surface}…`) so they cannot collide with the
  Hub's existing un-suffixed `mogzy-guide-bubble` ids while both exist.

## Files

New: `src/components/mogzy-guide/` — `index.ts` (frozen barrel), `types.ts`,
`priority.ts`, `placement.ts`, `storage.ts`, `useMogzyGuide.ts`, `useGuideLayout.ts`,
`MogzyGuide.tsx`, `pure.test.ts`, `MogzyGuide.test.tsx`; this doc.

Shared CSS: **one appended block at the end of `src/index.css`**, every selector
prefixed `.mogzy-guide-*` (bubble position/material/tail + a reduced-motion override).
No existing selector was edited.

## Tests / certification

- `npx vitest run src/components/mogzy-guide` — 41 tests (priority order, tie-break,
  hover grace, once show/dismiss, ttl, ambient rotation, storage fallback, placement
  desktop/mobile, lean/turn/hop, pose, interactive/Escape/dismiss, live-region semantics,
  reduced motion, viewport clamp).
- Regression: `src/pages/LolHub.test.tsx` + `src/components/mascot` — 133 pass (untouched).
- `tsc -p tsconfig.app.json`: no errors in `mogzy-guide` (the repo has pre-existing,
  unrelated errors in other files). ESLint clean on the new folder.
- Real-browser check with a throwaway harness (not committed): desktop 1280×720 (lean 96px,
  mirror, tail), phone 375×812 (mobile placement, side bubble, clamp keeps the bubble within
  the 8px margin), reduced motion via `html.reduce-motion` (no float/lean/turn; text and
  live region intact).

## Known limitations

- Only the **bubble** is viewport-clamped. A `target` leaning toward a nearby viewport
  edge can push the mascot off-screen, and a clamped bubble can then overlap him. Author
  the anchor/side/target so they point into free space on each layout.
- No collision/pathfinding; no per-message bubble offsets (Hub's `bubble.x/y` model is not
  generalized). One bubble side per layout.
- Non-base poses may not face the same way as the base art; `turn`/`restFacing` assume the
  base art (native facing left). Check each pose you use with a `target`.
- Facing is not preserved under OS reduced motion (existing `.mogzy-facing-turn` rule pins
  the mirror off); the component instead omits the turn entirely and applies only the
  authored `restFacing`.
- Hover/focus copy is not announced by the substrate (by design; see Accessibility).
- Ambient timers run while a higher-priority message is showing; ambient simply stays hidden.
- Persistence is per-browser localStorage only.

## Next tasks

### MG-C — Hub (`/lol`)

Goal: replace `MogzyHubGuide`'s rendering with `<MogzyGuide surface="hub">` **without changing
what a user sees or hears.** Starting point: `src/components/lol/MogzyHubGuide.tsx`,
`hub-guide.ts`, `src/pages/LolHub.tsx` (+ `LolHub.test.tsx`, ~lines 587–740 guide tests).

1. Keep `HUB_GUIDE_MODES` copy and `hubGuideDescriptionId` + the visually-hidden
   `aria-describedby` descriptions (they are the hover/focus AT path; the substrate does
   not announce hover). Drive hover/focus through `controller.hover({id, title, text, target})`
   / `clearHover()` — `useHubGuideState`'s 140ms grace equals `GUIDE_HOVER_CLEAR_DELAY_MS`.
2. Map lean to `target`: left cards → `{direction:"left",distance:"far"}`, right →
   `"right"`. Mount **outside** the aria-hidden lane only if a contextual/first-use message
   is introduced; otherwise leave the lane as is.
3. Placement: `desktop` = anchor `{bottom:"16%",centerX:true}`, `size:"clamp(97px,9.7vw,167px)"`,
   `bubbleSide:"top"`; `mobile` = the existing mobile slot, `size:"clamp(84px,24vw,100px)"`,
   `bubbleSide:"right"`, `bubbleWidth:"min(160px,42vw)"`. The old beside-the-head bubble
   offsets are not in the contract: either accept the new top placement and update the
   Hub tests that assert `--guide-bubble-*`, or stop and report what is needed — do not add
   API locally.
4. Update `LolHub.test.tsx` selectors from `mogzy-guide-bubble|lean` to
   `mogzy-guide-hub-bubble|lean`; preserve the behavioral assertions (idle hidden, per-card
   copy, focus/blur, no navigation changes, aria-describedby).
5. Retire dead Hub-only code/CSS only after parity is verified; do not touch MG-A's block.

### MG-D — Leaguecraft

Goal: add the guide to the Leaguecraft surface as the first consumer of **contextual** and
**first-use** messages. Product state stays in Leaguecraft code.

1. Pick a stable `surface` (`"leaguecraft"`) and derive `messages` from existing Leaguecraft
   state (e.g. an empty/first-visit state → `first-use` with `once:"dismiss"`, `dismissible`,
   `ttlMs`; a significant state such as a locked/blocked mode → `contextual`). Keep every
   string ≤ 100 chars (`isCompactGuideCopy`) — add a test that asserts it for every message.
2. Author `placements.desktop` and `placements.mobile` against the real layout (verify the
   chosen anchor/side is free of cards, HUD and the Mogzy dock on both layouts).
3. Use `interactive` + `onDismiss={controller.dismiss}` for the dismissible first-use message;
   mount outside aria-hidden regions so the live region is announced.
4. Tests: message selection from product state, once-per-browser persistence (inject a
   `storage`), reduced motion, phone layout, no navigation/product side effects from the guide.
5. Do not fork the substrate; report any contract gap back to MG-A's owner.

---

# MG-D — Leaguecraft role guidance + Mogzy-led signup conversion

Branch `mg/d-leaguecraft-conversion` = `origin/main` `6231bfb6` + MG-A `6111462c` + code commit
`913ec332`. No MG-B (Landing/Welcome) or MG-C (Hub) work is included. MG-A's frozen contract above is
unchanged and `src/components/mogzy-guide` was **not touched**; MG-D imports only from
`@/components/mogzy-guide`.

## Journey

Hub → Leaguecraft → role guidance → PLAY → gameplay → result → Mogzy-led account prompt.

### 1. Lobby guide (`surface="leaguecraft"`)

| When | Message | Priority / persistence |
|---|---|---|
| First arrival with **no role on the stage** (guest, or an account that never chose) | "Start here — Pick the role you know best." pose `explaining`, `cue:"hop"` | `first-use`, `once:"dismiss"`, `ttlMs` 14 s |
| The reader moves the role stage (first time this visit) while PLAY is pressable | "Ready? Press Play." pose `base`, `target:{down, near}`, `cue:"hop"` | `contextual`, `ttlMs` 3.5 s, not persisted |
| Match-entry record open | none (guide `enabled:false`) | — |
| Quiz runner / results | none — he is not mounted outside the lobby phase | — |

Rules this implements:

- **He reflects, never decides.** `LeaguecraftGuide` receives only `hasRole`, `rolePicks`, `playOpen`,
  `playDisabled`. No queue, Ranked-availability, auth or role-write state. `onSelectRankedRole` is
  still called exactly as before (it is `setPendingRankedRole`, local); the role is still written
  only by the record's Ranked entry (`handleCommitRankedRole`). Tests assert `selectRole` is never
  called by browsing, by the guide, or by PLAY opening the record.
- **First-use is evaluated once, when the role state settles.** `Quiz.tsx` passes
  `roleGuide={rankedRole.loadState !== "loading"}`; the guide latches `!hasRole && !playOpen` at mount.
  A saved role that is still loading never flashes "pick a role"; an auth-return restored role
  (`?role=`) and an account with a saved role never see it. Acting on it (a pick, or PLAY) records it
  via `controller.dismiss`; a visit that ends without either (navigating away) does not consume it, so
  a redirect or an early exit cannot burn it unseen.
- **Presence is message-gated.** Mogzy is on the lobby only while he has something to say (+500 ms
  fade-out linger). A returning player sees the unchanged lobby. This is deliberate: a permanent second
  Mogzy next to the role-mascot carousel would read as a sixth role.
- Non-interactive (no extra tab stop in the selection flow), `pointer-events:none`, never blocks input.
- If the Ranked role read is slow, the guide simply waits (it never appears before the role state is
  known). Observed once in dev when the remote backend hung; no fallback timer was added.

Wiring: `LeaguecraftHub` gets opt-in `roleGuide?: boolean` (default `false` — `/dev/lobby-preview`
and every fixture host render exactly as before) and a `rolePicks` counter; `RankedLobbyHero` gets an
opaque `guide?: ReactNode` slot rendered inside the **centre scroll's** content box (already
`position:relative`), which is the guide's authored coordinate space.

### 2. Placement (authored in `leaguecraft-guide.ts`)

Anchored to the top-left of the centre scroll's writing area, straddling the paper edge, under
"Choose your role", bubble **below** him. Free of the role stepper (foot of the stage), dot indicator,
emblem button (top-right) and the PLAY seal; the bubble never covers the face of the role being
chosen. Because the anchor is relative to the scroll's own content box it is correct both in the
three-column rack and when the columns stack (<1024 px).

| Layout | Anchor | Size | Bubble |
|---|---|---|---|
| desktop (≥768) | `top:2.4rem; left:-1.75rem` | `clamp(48px,4.4vw,64px)` | bottom, `min(168px,46vw)` |
| mobile (<768) | `top:2rem; left:-2.9rem` | `clamp(40px,12vw,48px)` | bottom, `min(132px,42vw)` |

### 3. Signup conversion

Policy **not changed**: same `quiz:gate:*` counters (`onboarding-gate.ts` untouched), same config
source (`app_settings.quiz_onboarding_config`) and defaults — re-verified in code: soft nudge 3,
hard prompt 5 (no production row), `redirect_to_hub` true; the hard prompt is only *armed* mid-run and
shown after completion (`handleNext`), never mid-question; soft nudge once per session;
`returnTo="/quiz"`; `Keep Playing as Guest`; sign-in link; `useAccountUpgrade`/`resetGateState` untouched.

**Chosen path — post-completion prompt: Mogzy-voiced. Soft nudge: left structurally unchanged.**

- `QuizSignUpGate` gains optional `guideLine`. When present the lock icon is replaced by Mogzy
  (`surface="leaguecraft-signup"`, pose `holdingBook`, in flow at the head of the card, bubble to his
  right) saying e.g. "Not bad. Want me to keep track of your progress?" (`leaguecraftSignupLine`: ≥60 %
  → "Not bad.", otherwise "Good practice." — never a verdict on a weak run). The heading, description,
  benefits list, stats row, three buttons and their handlers are the gate's own. Hosts that do not pass
  it (the Daily Challenge's save-your-run prompt) are unchanged.
- **Why the soft nudge was left alone:** it appears *mid-run* at the answer-feedback moment, over the
  question UI. Making it a Mogzy message would put him in gameplay (explicitly out of scope) and need an
  anchor inside the quiz layout with real collision risk on phones. The honest MG-D scope is the
  post-result prompt; the soft nudge keeps its copy, position, once-per-session rule and behavior.
- **Results page:** `GameResultsShell` is shared by every mode and has no authored mascot space, so no
  persistent Mogzy was forced into it; he lives in the prompt instead.
- **Analytics:** no new event, no counter. `quiz_signup_gate_shown`, `quiz_signup_clicked`,
  `quiz_guest_continue_clicked` gain one metadata key, `presentation: "mogzy_guide"`, **only when the
  guide line is shown**, so Mogzy-voiced vs plain prompt conversion can be compared. Absent otherwise
  (existing payloads exact — asserted).
- **Short phones:** Mogzy is sized with `vh` and the card reserves only his height, so on 667×375 the
  Create Account button sits at the same y as before (339–379 px) and on 320×568 all three buttons are
  visible without scrolling.

## Files

New: `src/components/quiz/leaguecraft-guide.ts` (messages, copy, placements — pure),
`LeaguecraftGuide.tsx`, and tests `leaguecraft-guide.test.ts`, `LeaguecraftGuide.test.tsx`,
`QuizSignUpGate.test.tsx`, `src/pages/Quiz.guide.test.tsx`.
Edited: `LeaguecraftHub.tsx` (+`roleGuide`, `rolePicks`), `RankedLobbyHero.tsx` (+`guide` slot),
`QuizSignUpGate.tsx` (+`guideLine`), `Quiz.tsx` (2 props). **No** CSS, no `mogzy-guide`, no
Hub/Landing/Welcome, no auth/onboarding-gate/analytics-library change.

## Tests / certification

- New: 4 files, 41 tests — message selection from state, every string within `isCompactGuideCopy`,
  first-use persistence across mounts (injected storage), consumed by a pick/PLAY, contextual lean, one
  live region / one announcement per message, reduced motion (`data-motion="still"`, `--guide-lean-y:0`),
  mobile/desktop layout, absolute (cannot move the lobby); through the real `/quiz` page: first-visit
  guest, loading role, saved role, no-role account, role change, **no role write**, record opens on
  `/quiz`, never in the quiz runner, soft nudge at 3 (unchanged copy), hard prompt armed at 5 and shown
  only after completion, Keep Playing as Guest, Create Account → `/auth?mode=signup&returnTo=%2Fquiz`,
  no signed-in prompt, no second prompt, exactly one announcing live region.
- `src/components/mogzy-guide` 41 tests pass (substrate untouched).
- Regression sweep `src/pages/Quiz*`, `src/components/quiz`, `src/pages/dev/lobby-preview`,
  `src/pages/quiz-daily-challenge`, `src/test/onboarding-gate.test.ts`: only **pre-existing** failures
  remain, all reproduced on MG-A `6111462c` itself: `Quiz.hub` "keeps exactly one h1", `Quiz.rankedRole`
  "commits NOTHING for Practice after a role change", `playModeCard.styles` ×2 (CRLF checkout),
  `QuestionTimeline` ×14 (jsdom popover cost). `QuestionReviewHost` and
  `LobbyPreviewPage.premiumAnalytics` only fail under parallel load and pass alone.
- ESLint on touched files: only pre-existing `no-explicit-any` / `exhaustive-deps` findings on lines MG-D
  did not touch. `tsc -p tsconfig.app.json`: no errors in touched files.
- Real browser (Edge, headless, Vite dev server in this worktree; the role endpoint stubbed to a guest
  401): lobby first-use at 1440×900, 1280×800, 1024×768, 768×1024, 390×844, 375×667, 667×375; post-pick
  lean at 1440 and 390; `prefers-reduced-motion` (`data-motion="still"`, no float class); signup prompt at
  1440×900, 390×844, 320×568, 667×375 including the short-height button position above. The bubble never
  overlapped the stepper, PLAY, or the role figure's face; no horizontal overflow. Not exercised in a real
  browser: a live end-to-end quiz run and a real auth round trip (no reachable backend session) — those are
  covered through the real page in jsdom only.

## Frozen-API limitations (for MG-INT — nothing was forked)

1. **No silent reaction.** `lean`/`target`/`cue` exist only on a `GuideMessage`, and a non-null message
   always shows its bubble with non-empty text. "A nonverbal look toward PLAY with no new bubble" is not
   expressible, so the post-pick reaction is a ~20-character contextual bubble (3.5 s). Wanted: a message
   flag such as `silent?: true` (no bubble, no live-region text; motion only).
2. **Layout breakpoint mismatch.** The substrate's `mobile` is `<768 px`; the Leaguecraft lobby stacks at
   `<1024 px`. 768–1023 uses `desktop` placement inside a stacked 30 rem scroll. It works because the
   anchor is relative to the scroll's content box, but a per-surface breakpoint (or `placement.tablet`)
   would be cleaner.
3. **`once:"dismiss"` is not recorded on unmount.** That is what this needs (a redirect from `/quiz` before
   the hub settles must not burn first-use), so leaving the lobby without acting repeats first-use next
   visit. An explicit `markSeen(id)` on the controller would let a surface decide.
4. **No keyboard dismissal for a non-interactive guide** (Escape only reaches the guide root when focus is
   inside it). Mogzy here is deliberately non-interactive; the 14 s ttl and acting on the lobby are the
   exits. If a persistent "Got it" is ever wanted, MG-INT needs a surface-level control or a focus story.
5. Vertical targets never mirror, so "toward PLAY" (below, centre) is a short down-lean, not a point.

## MG-INT notes

- **One guide per page.** `/quiz` mounts at most one `MogzyGuide` at a time: the lobby guide
  (`leaguecraft`) while `phase==="sets"`, the prompt's guide (`leaguecraft-signup`) only on the result
  phase. They never coexist, so there is one announcing `role="status"` region at any moment. MG-C's Hub
  guide lives on `/lol` — a different route — so they never share a page; keep it that way.
- **Storage keys:** `mogzy-guide:v1:leaguecraft:lc-role-first` is the only key MG-D persists. The signup
  surface persists nothing — the existing `quiz:gate:*` policy alone decides when it appears.
- **Ordering with MG-B:** if the Welcome/automatic-entry flow introduces Mogzy before a visitor reaches
  `/quiz`, decide whether `lc-role-first` should be suppressed; today it is independent and shows once.
- **Reuse:** other hosts can voice their own signup prompt by passing `guideLine` to `QuizSignUpGate`
  (the Daily Challenge's `DailyCompletion` was deliberately left alone). `leaguecraftSignupLine` is
  Leaguecraft-specific; other surfaces should supply their own copy.
- **Rolling back** is one prop each: stop passing `roleGuide` from `Quiz.tsx` and stop passing
  `guideLine` to `QuizSignUpGate`; both default off.
- The throwaway gate harness (`mgd-harness.*`) and `.claude/launch.json` entries used for the visual
  checks are untracked/git-excluded and not part of the branch.
