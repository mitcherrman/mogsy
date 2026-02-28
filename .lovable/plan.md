## Changes Identified: SliceBattleAnimation Pattern vs Other Animations

The SliceBattleAnimation uses a **flash-prevention pattern** that the other four animations (Shatter, Burn, Vaporize, Crush) do NOT use. This is the change to propagate.

### The Pattern Difference

**SliceBattleAnimation (correct):**

1. `finish` callback sets phase to `"done"` (not `"idle"`), then calls `onComplete()`
2. Render guard: `if (winnerSide === null || items.length < 2)` — no `phase === "idle"` check
3. Overlay stays mounted at `phase === "done"` until parent clears `winnerSide`
4. Phase resets to `"idle"` only when `winnerSide` becomes `null`

**Shatter/Burn/Vaporize/Crush (buggy):**

1. `reset` callback sets phase to `"idle"` AND calls `onComplete()` simultaneously
2. Render guard includes `|| phase === "idle"` — unmounts overlay immediately
3. This causes a brief flash of old cards before the parent processes `onComplete` and updates state

### Implementation Plan

For each of **ShatterAnimation**, **BurnAnimation**, **VaporizeAnimation**, **CrushAnimation**:

1. **Replace `reset` with `finish**`: Change `setPhase("idle"); onComplete();` to `setPhase("done"); onComplete();`
2. **Add idle reset on winnerSide null**: In the `useEffect`, when `winnerSide === null`, explicitly `setPhase("idle")` and return early (already present in most, just needs to stay)
3. **Remove `phase === "idle"` from render guard**: Change `if (winnerSide === null || phase === "idle" || items.length < 2)` to `if (winnerSide === null || items.length < 2)`
4. **Add `"done"` to phase type**: Add `"done"` to each animation's phase union type where missing, and handle it in animation targets (e.g., fade to opacity 0 during "done" phase)

**DefaultFadeAnimation** is a no-op component (returns null always) — no changes needed.  
  
Keep `"done"` as a “hold” state (overlay still rendered and opaque).

- Let unmount/fade happen only when **parent sets** `winnerSide` **to null**, not when phase becomes `"done"`.

### Files Modified

- `src/components/animations/ShatterAnimation.tsx`
- `src/components/animations/BurnAnimation.tsx`
- `src/components/animations/VaporizeAnimation.tsx`
- `src/components/animations/CrushAnimation.tsx`