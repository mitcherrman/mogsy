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

## MG-C — Hub (`/lol`) completion state

Branch `mg/c-hub-guide` (origin/main `6231bfb6` + MG-A `6111462c`; no MG-B/MG-D files).
The frozen MG-A contract above is unchanged; `src/components/mogzy-guide` was **not** edited.

### What shipped

- `LolHub` now owns ONE `useMogzyGuide({ surface: "hub" })` and renders ONE `<MogzyGuide surface="hub">`
  chosen by `useGuideLayout()` (desktop → central lane, mobile → `mobile-mogzy-zone`). Previously both
  existed in the DOM; now only the active layout renders, so there is a single live region and a single
  once-only record.
- Messages: `welcome-leaguecraft` (`first-use`, `once:"show"`, `ttlMs:8000`, `dismissible`, hop cue, lean
  left toward Leaguecraft); the three Academy lines as `ambient` (`academy-line-{0,1,2}`, rotated from a
  random start, `Summoner` fallback, name capped at 24 chars so copy stays ≤100); per-destination
  `hover` messages `hub-{guideId}` via `hover()`/`clearHover()` from the book cards' existing handlers.
- `HUB_GUIDE_MODES` is now data only: `{ id, title, description, target }` (`target` replaces lean/bubble px).
  `hubGuideDescriptionId` and the sr-only `aria-describedby` descriptions are unchanged (hover/focus AT path).
- The desktop guide wrapper is **no longer `aria-hidden`** (the substrate hides its own bubble and mascot) so
  the first-use text reaches the live region. The Academy Updates mark is still a sibling, not inside the guide.
- The header's personalized line (`.academy-personal-line` + its CSS) was removed; Mogzy speaks it instead.
- Placement: desktop anchor `{bottom:"16%",centerX:true}`, size `clamp(97px,9.7vw,167px)`, `bubbleSide:"top"`,
  `bubbleWidth:"clamp(170px,15vw,230px)"`; mobile in-flow, `clamp(84px,24vw,100px)`, `bubbleSide:"right"`,
  `bubbleWidth:"min(160px,42vw)"`, `interactive` (label "Mogzy, Academy guide").
- Persistence uses `createGuideStorage()` created per Hub mount (so tests are isolated); key
  `mogzy-guide:v1:hub:welcome-leaguecraft`.

### Removed / retained

- Deleted `src/components/lol/MogzyHubGuide.tsx` (fully replaced, no importers left).
- Retained `src/components/lol/hub-guide.ts` as compatibility data (see above); `useHubGuideState` and the lean/bubble
  px model are gone.
- `.mogzy-lean-bubble*` rules in `index.css` are now unreferenced by the Hub guide (still pinned nowhere);
  left in place — delete in a cleanup once nothing else is confirmed to use them.
- `AcademyUpdates.tsx` comments still mention `MogzyHubGuide`; geometry is identical (same anchor/size), comments only.

### Behaviour differences vs the old guide (frozen-API limits, accepted)

1. Bubble is **above** Mogzy (`bubbleSide:"top"`), not beside his head; the old `bubble.x/y/yNarrow` offsets are
   not expressible. At narrow desktop widths the top bubble can touch the radio dock's lower edge.
2. Lean is `far` = 96px capped at 18vw; the old guide capped at 7vw. At ~1024px the glide is longer than before.
3. Desktop Mogzy is no longer clickable (no hop on click): making him `interactive` would add a focus stop ahead of
   the cards, which the old code deliberately avoided. Mobile keeps the tap-to-hop button. First-use still hops via `cue`.
4. A live first-use message blocks hover reactions (contract rule) for up to 8s on a visitor's first Hub visit only;
   Escape only reaches the guide when focus is inside it, so on desktop the welcome simply times out.
5. Per-mount storage: if `localStorage` is blocked the welcome re-shows per Hub mount rather than once per page load.

### Verification

- `npx vitest run src/pages/LolHub.test.tsx src/components/mogzy-guide src/components/lol` — 360 pass.
  New/updated LolHub tests: first-use once-only + not blocking + announced, Escape dismissal, priority
  (first-use > hover > ambient, ambient never replaces either), Summoner fallback, phone layout (single guide in
  the mobile zone, bubble side right), reduced motion, hover/focus/describedby, Hall/Commons snap + hub analytics
  tests untouched and green. ESLint clean on touched files; `tsc -p tsconfig.app.json` has no errors in touched files.
- Real browser (Vite, Chromium pane 800×609 and 375×812): first-use welcome leans toward Leaguecraft and expires;
  hover on Pro Play leans right with the top bubble; mobile bubble stays in bounds (right edge 313/375, no horizontal
  scroll), Mogzy sits between title and books without covering them; `html.reduce-motion` → `data-motion="still"`,
  no float/turn/glide. A ≥1024px / 1440px desktop pass was not captured (pane max 800px wide) — check at MG-INT.

### MG-INT notes

- Merge order is irrelevant to MG-B/MG-D: this branch touches only `LolHub.tsx`, `LolHub.test.tsx`,
  `components/lol/hub-guide.ts`, `MogzyHubGuide.tsx` (deleted), `index.css` (9 deleted lines) and this doc.
- Conflict risk: `src/index.css` (removed `.academy-personal-line` block + its reduced-motion line) and this doc (append-only).
- Check at integration: 1440px Hub (bubble vs radio dock), and that no other surface imports `hub-guide` types.

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

---

# MG-INT — integration and FTUE certification

Branch `mg/integration-ftue`, cut from `origin/main` **`f87240f8`** (OF3-F3). Main had moved one commit past the
feature branches' base `6231bfb6`; `f87240f8` touches only Order Forge fixtures/tests and
`src/lib/ranked-public/fixtures.ts`, no overlap with any MG file. **Not merged, not published, not deployed.**

## Integrated commits (cherry-picked in dependency order)

| Phase | Source | On this branch |
|---|---|---|
| MG-A substrate | `6111462c` | `3311bc6f` |
| MG-B automatic Landing / preserved Welcome | `4ec10794` | `cdb7e66e` |
| MG-C Hub migration (code) | `e6f64ac9` | `95d36ce7` |
| MG-C handoff notes | `5c50f4cf` | `5d57b732` |
| MG-D Leaguecraft + signup (code) | `913ec332` | `38ff032e` |
| MG-D handoff notes | `18345e0c` | `5d0f9a67` |
| MG-INT fix + cleanup | — | `027e9205` |

`mg/d-leaguecraft-conversion` tip `18345e0c` = MG-A + `913ec332` + `18345e0c`; MG-A was picked once.
Against `18345e0c`, the only source differences on this branch are MG-B, MG-C and main's OF3-F3, so nothing was
lost in the merge.

## Conflict resolutions

- `docs/MOGZY_GUIDE_HANDOFF.md`: MG-C and MG-D both appended after MG-A's text. Kept **both**, MG-C first, then
  MG-D, separated by a rule; no phase text was dropped or edited.
- `src/index.css`: **no conflict**. MG-A's `.mogzy-guide-*` block (end of file) and MG-C's removal of
  `.academy-personal-line` (and its reduced-motion line) applied cleanly; unrelated main CSS is unchanged.
- All code files applied without conflicts. `src/components/mogzy-guide` is byte-identical to MG-A `6111462c`.

## Final behaviour (new anonymous visitor)

1. `/`: the Mogzy Academy entrance plays on its own: 1.8 s hold + 780 ms door/zoom ≈ **2.6 s** (measured 2.60–2.68 s
   from mount to `/lol`), then `navigate("/lol", {replace:true})`. "Enter Mogzy" remains as an optional skip (measured
   840 ms to `/lol`). Under reduced motion: 450 ms + 220 ms (measured 750 ms). The Hub chunk is prefetched during the
   hold. `landing_viewed` is unchanged (root only, once per session). Nothing is written to `mogsy.academyWelcome.v1`.
2. `/lol` Hub: the first-use "Welcome to the Academy / Start with Leaguecraft and see what you know." appears about
   160 ms after arrival, leans toward Leaguecraft, is announced once and expires at 8 s (`once:"show"`); ambient lines
   then rotate, and hover/focus reactions work. Any destination can be chosen at any time.
3. `/quiz` (Leaguecraft): once the role state settles, the first-use "Start here / Pick the role you know best."
   appears about 170 ms after arrival. A role pick brings "Ready? Press Play." (contextual, 3.5 s, small down-lean),
   then Mogzy leaves the lobby. There is no guide on the match-entry record, the Daily Challenge or the quiz runner.
4. Result: the existing gate policy (soft nudge 3; hard prompt armed at 5 and shown only on completion; anonymous only)
   shows the Mogzy-voiced prompt: "Not bad." at ≥60 % or "Good practice." otherwise, plus "Want me to keep track of
   your progress?".
5. `/welcome` is no longer on the automatic path but remains a direct route: it renders all five chapters, including
   the registration chapter.

## Integration change: Hub bubble vs radio dock (the one defect found)

MG-C's desktop `bubbleSide:"top"` rose into the Academy Radio dock on short, wide desktops. It did so for first-use,
hover **and** ambient lines. The bubble is `pointer-events:none`, so the dock still worked, but it was visibly covered.

| viewport | top-bubble overlap with the 90 px dock |
|---|---|
| 1366×768 | 56 px |
| 1280×720 | 55 px |
| 1280×800 | 30 px |
| 1536×864 | 3–19 px |
| 1440×900, 1920×1080, 1024×768 | clear (≥ 6 px) |

A scan of 1024–1920 × 700–1200 (iframe, real layout) put every overlap inside
`(min-width: 1025px) and (max-height: 930px)`; all taller viewports keep ≥ 26 px of clearance.

**Fix** (in `LolHub.tsx`, authored placement data only, frozen API): inside that query the desktop bubble goes beside
Mogzy's head. It sits on his right when he leans left (toward the centre lane), and otherwise on his left, away from
the Academy Updates mark on his right shoulder. Everywhere else MG-C's top bubble is unchanged, and mobile is unchanged.

Verified: no dock, book or edge overlap for first-use, all four hovers and ambient at 1366×768 and 1280×800; top
mode is clean at 1920×1080 and 1024×768. This restores the retired guide's intent: its `bubble` offsets existed to
keep the bubble out of the dock.

## TTL judgements (no change)

- **Hub first-use 8 s: kept.** After a 2.6 s non-interactive Landing, the welcome appears within ~160 ms, so the
  visitor never waits on it, and it is the journey's one explicit pointer to Leaguecraft. The cost is that hover
  reactions are held for up to 8 s, on the first Hub visit only (a contract rule); navigation, focus descriptions and
  the books stay fully live. Noticeable, but not clearly excessive. A conservative trim (e.g. to 6 s) is an owner call.
- **Leaguecraft first-use 14 s: kept.** The Leaguecraft guide blocks nothing: that surface has no hover reactions,
  and the guide leaves as soon as the reader picks a role or presses PLAY. A long TTL therefore has no interaction cost.
- **Post-role bubble: kept.** It is ~20 characters for 3.5 s, never covers the stage or PLAY, and is not harmful;
  no `silent` API was added.

## Cleanup (after combining)

- Removed `.mogzy-lean-bubble` / `.mogzy-lean-bubble-tail` and their reduced-motion lines: zero references in `src`
  after MG-C, and no test scanned them. `.mogzy-lean-glide` stays because the substrate uses it.
- Refreshed comments that named the deleted `MogzyHubGuide` in `index.css` and `AcademyUpdates.tsx` (comments only).
  One such comment inside `src/components/mogzy-guide/MogzyGuide.tsx` (≈ line 307) still says "see MogzyHubGuide";
  it was left alone so the frozen substrate stays byte-identical to MG-A.
- `hub-guide.ts` is still imported by `LolHub.tsx` (copy, descriptions, targets), so it is not dead code.

## Tests

- Affected suites on the integration branch (109 files: mogzy-guide, entry v2, welcome, LolHub, components/lol,
  components/quiz, Quiz.guide/hub/playScroll/rankedRole/practiceMissed, onboarding-gate, Auth/AuthCallback, lib/auth,
  App route tests, ProtectedRoute, analytics instrumentation, lobby-preview): 2315 pass / 41 fail on a full-parallel run.
  Re-running the failing files at `--maxWorkers=3` on both branches: **the integration failure set equals clean
  `origin/main` `f87240f8`** (27 baseline failures). The 14 extra lobby-preview/QuestionReviewHost failures were
  parallel-load timeouts; they pass at matched concurrency (311/311).
- After the MG-INT fix: 26 Mogzy/Landing/Welcome/Hub/Leaguecraft/gate files pass **575/575**; Hub + `components/lol`
  pass 319/319.
- All 36 test files that read `src/index.css`: 12 failures on **both** branches, with identical names (pre-existing
  CRLF/source-scan geometry tests: `tomeGeometry` ×4, `playModeCard.styles` ×4, QuestionMotifLayer, and others).
- Baseline-only failures (pre-existing on `origin/main`): `App.routing-contract` retired multiplayer redirects ×2,
  `playModeCard.styles`, `QuestionTimeline` MALT B1 ×13 (jsdom popover cost), `Quiz.hub` "exactly one h1",
  `Quiz.rankedRole` "commits NOTHING for Practice", `welcome/tomeGeometry` ×4, `LobbyPreviewPage.premiumAnalytics` L1 percentile.
- `vite build` passes. `tsc -p tsconfig.app.json` reports no errors in touched files. ESLint on every touched file
  reports only the 13 `no-explicit-any` + 1 `exhaustive-deps` findings that `origin/main` has on the same untouched lines.
- Analytics: event names are unchanged and `landing_viewed` stays root-only. Gate events gain
  `presentation:"mogzy_guide"` only when the guide line is shown; there are no new events and no duplicates (asserted
  in `QuizSignUpGate.test.tsx`).

## Browser certification (Edge pane, Vite dev server on this worktree)

| surface | viewports | result |
|---|---|---|
| Landing | 1440×900, 1280×800 | auto 2.60 s, skip 0.84 s, reduced motion 0.75 s; Back during the hold stays on the previous page (the pending hand-off is cleared); no loop; no Welcome storage write |
| Hub first-use / hover / ambient | 1440×900, 1366×768, 1280×800, 1280×720, 1024×768, 1536×864, 1920×1080 | after the fix: no dock or book overlap; Leaguecraft visible; one live region; first-use announced, hover/ambient not; no desktop focus stop; 4 `aria-describedby` descriptions |
| Hub mobile | 390×844, 375×667 | bubble right of Mogzy, in bounds, books clear (at 390 the bubble top meets the title baseline, no letters covered); Hall→Commons scroll; single tap target |
| Leaguecraft | 1440×900, 1024×768, 768×1024, 390×844, 375×667, 667×375 | first-use bubble clear of stepper, PLAY and figure faces; post-pick "Press Play" + lean; no repeat on a 2nd pick; no guide after PLAY; a returning visitor sees no guide |
| Signup prompt | 1440×900, 390×844, 320×568, 667×375 | Mogzy + bubble in the card head; heading/body/benefits intact; Create Account → `/auth?mode=signup&returnTo=%2Fquiz`, Sign in → `/auth?returnTo=%2Fquiz`, Keep Playing as Guest dismisses; one live region; at 667×375 the buttons need the card's own scroll, as the plain gate already does (Create Account at y 339, plain gate y 357) |
| Reduced motion (one journey) | 1280×800 | Landing short path; Hub and Leaguecraft `data-motion="still"`, no float or lean; messages still announced |
| `/welcome` | 1280×800 | renders directly, 5 chapters, registration chapter (username/rank/Enter the register/Sign In) |

## Not exercised in a real browser (and why)

- **Live quiz run → result → gate, and the Daily Challenge:** the quiz session backend (Supabase) does not respond from
  this machine ("We couldn't start a session"). The gate was rendered from the real component with the exact props
  `Quiz.tsx` passes (throwaway harness, deleted). Thresholds, mid-run arming and post-completion display are covered
  through the real `/quiz` page in `Quiz.guide.test.tsx`.
- **Signed-in visitor / real auth round trip:** no test account is reachable, and signing in to the remote project is
  out of scope. Covered by `Quiz.guide.test.tsx` (no prompt when signed in; a saved role gets no first-use) and the auth tests.
- **Welcome registration submit:** it would write to the remote Supabase project. The page and its tests are unchanged
  since main (`AcademyWelcomePage.test.tsx` passes).
- Ranked availability is closed in this dev environment, so PLAY goes to the Daily Challenge (existing
  `LeaguecraftHub.openPlay` behaviour); the record path is covered by the MG-D tests.

## Remaining limitations

1. **Academy Updates mark vs side bubble.** This applies only inside the short-wide query, and only when the admin
   switch `academy_updates_enabled` is on with published entries. There, a left-lean bubble (first-use, Leaguecraft or
   Archives hover) sits under the mark: about 44 px of the bubble's left side is covered, and the mark (z-20) stays
   usable. No frozen-API placement clears the dock, the books and the mark at once there. The production switch state
   was not checked.
2. **1024×700-class viewports** (tablet landscape with browser chrome) keep the top bubble, which overlaps the dock by
   ~22 px. A side placement collides with the books or the mark there.
3. **800–1023 px desktop layout:** a far lean pushes Mogzy and either bubble side into the book columns, because the
   lane is 200 px wide. This is MG-C's known 18vw-cap limitation, unchanged by MG-INT.
4. Landing's reduced-motion path follows the **OS** setting only (framer-motion `useReducedMotion`). The app's own
   Reduce Motion setting stills the guides but not the entrance timing. Pre-existing.
5. A brand-new visitor who opens `/quiz` directly is sent to the Hub first (`redirect_to_hub`). Leaguecraft's
   first-use is not consumed by that redirect (verified).
6. The default guide storage keeps an in-memory mirror per page load (MG-A), so clearing `localStorage` mid-session
   does not re-arm a once-only message until reload. This only matters for testing.
7. The MG-A/MG-C/MG-D frozen-API limitations listed above still stand: no silent reaction, the 768 px substrate
   breakpoint, and no keyboard dismissal for non-interactive guides.

## Verdict

The integration is clean. The combined FTUE behaves as specified, with one integration defect fixed (Hub bubble over
the radio dock). Tests match the `origin/main` baseline and the build passes. **Safe to merge after owner review** of
the short-wide Hub bubble placement, and of limitation 1 if the Academy Updates switch is on in production.
**Do not publish Lovable or deploy from this pass.**

## Final branch / SHA

`mg/integration-ftue`: code tip `027e9205`, certification handoff `6d49f56d`, plus this record-only commit on top
(base `origin/main` `f87240f8`). Pushed to `origin/mg/integration-ftue` only.

## MG-GEOM: final Hub geometry adjustment (`mg/fix-final-geometry`)

Base `mg/integration-ftue` `8c8c739a`. Only `src/pages/LolHub.tsx` changed (Hub-authored placement and lean data; the frozen
`mogzy-guide` API, mobile, Landing, Welcome, Leaguecraft, auth, analytics and persistence are untouched).

**Fix**
1. `HUB_LEFT_BUBBLE_QUERY` = `(min-width:768px) and (max-width:1399px) and (max-height:800px)`: the desktop bubble is always
   on Mogzy's LEFT. It clears the radio dock (1024×700 was 22px over; 800×600 was 49px), the book columns and the Academy
   Updates mark (the mark does not lean, so a right-hand bubble covers it). Wider/taller viewports keep the MG-INT rule
   (`HUB_SIDE_BUBBLE_QUERY`, unchanged), because their books are larger and a left bubble would reach them (1440×900: 40px into
   Archives).
2. `HUB_NARROW_QUERY` = `(min-width:768px) and (max-width:1279px)`: hover and first-use leans use `near` (32px) instead of `far`
   (96px). `far` plus a left bubble reaches the book column under ~1100px, and a right lean puts the left bubble onto the mark
   under ~1190px. At ≥1280 the authored `far` lean is unchanged. The data in `hub-guide.ts` is not edited; the override is applied
   where the guide is activated.

**Defect findings**
- Defect 1 (1024×700 bubble over radio): reproduced at 22px, fixed.
- Defect 2 (lean into books at 800–1023): in short viewports Mogzy never reached the books; the real collision was the left
  bubble (and, at tall portrait sizes such as 768×1024, Mogzy himself: 36px into Archives with `far`). `near` removes the Mogzy overlap.
- Defect 3 (Updates mark vs bubble): the switch is dormant in code (`DEFAULT_PLATFORM_POLICY.academy.updatesEnabled = false`; the
  `academy_updates_enabled` row is seeded `false`; it renders only with the row on AND a published entry). The production row cannot
  be read from the repo, so its state is still unknown. Fixed inside the left-bubble region; remains outside it (see below).

**Browser matrix** (Chromium pane, real `/lol` in a same-origin iframe at each size; Updates mark forced on for the check with a
temporary, uncommitted harness; lean landing forced because the pane pauses animations when hidden). Geometry measured: bubble vs
radio dock, the four books, the mark, viewport edges; Mogzy vs radio and books.

| viewport | first-use (left lean) | hover L / R | ambient | result |
|---|---|---|---|---|
| 800×600 | left bubble | ✓ / ✓ | ✓ | clear; bubble 3px from Leaguecraft column (tightest) |
| 900×700 | ✓ | ✓ / ✓ | ✓ | clear |
| 1024×700 | ✓ | ✓ / ✓ | ✓ | clear (was 22px over radio) |
| 1024×768 | ✓ | ✓ / ✓ | ✓ | clear |
| 1280×720 | ✓ | ✓ / ✓ | ✓ | clear |
| 1280×800 | ✓ | ✓ / ✓ | ✓ | clear |
| 1366×768 | ✓ | ✓ / ✓ | ✓ | clear |
| 1440×900 | right bubble | mark overlap 44×44 on left-lean states | clear | see remaining |
| 1536×864 | right bubble | mark overlap on left-lean states | clear | see remaining |
| 800×900, 1024×900, 1024×1000 | top bubble | ✓ | ✓ | clear |
| 768×1024, 820×1180 | top bubble | Mogzy clear; bubble corner 9px into the book column | ✓ | see remaining |
| 390×844, 375×667 | right of Mogzy | n/a | ✓ | unchanged: in bounds, 8px edge margin, no books/dock |

**Tests/build:** `LolHub*`, `mogzy-guide`, `components/lol` = 16 files / 373 tests green; `eslint src/pages/LolHub.tsx` clean;
`tsc -p tsconfig.app.json` no errors in `LolHub.tsx`; `vite build` passes.

**Remaining visible defects**
1. Academy Updates ON, ≥1400px wide (or 801–930px tall at 1025–1399px): a left-lean bubble (first-use, Leaguecraft/Archives hover) still
   sits over the mark (44×44), which stays on top and usable. Books are too large there for a left bubble; fixing it needs a mark/bubble
   change outside Hub-authored lean data.
2. 768–~850px wide with height >930px (portrait tablets): the top bubble's corner reaches ~9px into the book column. Not in the matrix.
