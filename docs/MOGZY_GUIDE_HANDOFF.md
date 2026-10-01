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
