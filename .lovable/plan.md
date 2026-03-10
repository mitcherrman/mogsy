

## Plan: Move Match Count to Right of "Who Mogs?" with Balanced Centering

### Current Layout
```
← ⚔ 🗡12  |  Who Mogs?  |  [timer/controls]
```
The match count (swords icon + number) sits to the left of "Who Mogs?", pushing the title off-center.

### Target Layout
```
← ⚔  |  Who Mogs?  🗡12  |  [timer/controls]
```
"Who Mogs?" stays visually centered by adding equal invisible spacers on both sides.

### Changes

**`src/pages/SwipePreset.tsx`** (lines 639-645)
- Remove the match count `<p>` from before the center div
- Restructure the center section: use a wrapper with `flex-1 flex items-center justify-center` containing "Who Mogs?" and the match count to its right
- Add an invisible spacer element on the left side (same width as the match count) so the title stays centered

**`src/pages/Swipe.tsx`** (lines 413-421)
- Same restructure: move match count (including gauntlet streak) to the right of "Who Mogs?" inside the center div
- Add matching invisible left spacer for centering balance

### Structure (both files)
```tsx
<div className="flex-1 flex items-center justify-center">
  {/* invisible spacer to balance the match count */}
  <div className="w-12" />
  <h1 className="text-sm font-bold text-foreground">Who Mogs?</h1>
  <p className="text-muted-foreground text-xs flex items-center gap-1 ml-2">
    <Swords className="h-3.5 w-3.5" />
    <span className="text-primary font-bold">{matchCount}</span>
  </p>
</div>
```

