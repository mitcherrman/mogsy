

## Initial Swipe Lock / "Get Ready" Feature

**Concept**: When a user enters a swiping game (first render of SwipePreset or SwipeLeagues), block all interactions for 1.5s with a visual countdown or "Get Ready" overlay.

### Timing Thoughts

1.5s feels right — long enough to orient the user but short enough to not frustrate. Could also consider:
- **1.0s** if users are returning/experienced
- **2.0s** if there's a visual countdown (3-2-1 style)
- Making it configurable in `app_settings` so you can tune it without code changes

### Similar Features Worth Considering

1. **Countdown overlay** — Instead of just locking, show a "3...2...1...GO!" or a pulsing "Get Ready" text with animation. More engaging than a blank lock.

2. **First-swipe-only vs every-entry** — Lock only on the very first matchup load per session, or every time they enter a league? First-time-only is less annoying for power users.

3. **Minimum view time per card** — Prevent instant spam-swiping by requiring each matchup to be visible for at least 0.5-1s before a vote registers. Encourages actually looking at the cards.

4. **Anti-spam cooldown** — After X rapid swipes in a row (e.g., 10 swipes under 5s), briefly slow them down with a "Slow down!" message.

5. **Streak/combo indicator** — After a sequence of swipes, show a streak counter or combo animation to gamify the experience.

### Implementation Plan

1. **Add a `readyDelay` state** to `SwipePreset` and `SwipeLeagues` pages — starts as `true`, flips to `false` after 1.5s via `useEffect` + `setTimeout`
2. **Create a `SwipeReadyOverlay` component** — full-screen overlay with a short animation/text (e.g., "GET READY" that fades out), rendered when `readyDelay` is true
3. **Disable swipe interactions** — pass `readyDelay` as a `disabled` prop to the swipe card area, preventing clicks/swipes while active
4. **Also pause the swipe timer** — pass `readyDelay` into `useSwipeTimer`'s `paused` parameter so the countdown doesn't tick during the lock

Files to modify:
- `src/pages/SwipePreset.tsx` — add ready state + overlay
- `src/pages/SwipeLeagues.tsx` — same
- New: `src/components/SwipeReadyOverlay.tsx` — the visual overlay component

