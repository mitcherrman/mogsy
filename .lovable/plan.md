

# Show Elo/Rank Stats in Animation Overlays

## Problem
The animation overlays (Burn, Shatter, Vaporize, Crush, Slice) render at `z-50` and cover the entire card area including the stats section. They only show item names — no Elo, rank, globe icon, or `EloChangeIndicator`. Classic Fade works because it renders `null`, so the parent's stats are always visible.

## Solution
Pass Elo/rank/change data through `CardAnimationRouter` to all animation components. Each animation's card replica will render the full stats section matching the parent layout.

### Data flow
1. **Extend `CardItem` interface** across all animation components to include:
   - `localElo`, `localRank`, `globalElo`, `globalRank`
   - `eloChange`, `globalDirection`, `rankOld`, `rankNew`
   - `subtitle?`, `eloVisible`, `rankVisible`

2. **Update `CardAnimationRouter`** props to accept the enriched `CardItem[]`.

3. **Update `SwipePreset.tsx` and `Swipe.tsx`** — when building the items array passed to `CardAnimationRouter`, include the Elo/rank data from current state.

4. **Update all 5 animation components** — replace the simple name-only footer with the full stats section:
   - Item name + subtitle
   - Local Elo + rank, divider, Globe icon + global Elo + rank
   - `EloChangeIndicator` with change/rank/globalDirection

### Stats section template (shared across all animations)
```tsx
<div className="px-2 py-1.5 flex-shrink-0 relative z-20">
  <h3 className="text-sm md:text-base lg:text-lg font-extrabold text-foreground truncate text-center">{item.name}</h3>
  {item.subtitle && <p className="text-[10px] text-muted-foreground truncate text-center">{item.subtitle}</p>}
  {item.eloVisible && (
    <div className="flex items-center justify-center gap-3 mt-0.5">
      <span className="text-[10px] md:text-xs text-muted-foreground inline-flex items-center gap-0.5">
        <span className="font-semibold text-primary">{item.localElo}</span>
        {item.rankVisible && item.localRank && <span className="text-muted-foreground/70">#{item.localRank}</span>}
        <span className="mx-1 text-muted-foreground/30">|</span>
        <Globe className="h-2.5 w-2.5 text-blue-400/70" />
        <span className="font-semibold text-blue-400">{item.globalElo}</span>
        {item.rankVisible && item.globalRank && <span className="text-blue-400/70">#{item.globalRank}</span>}
      </span>
    </div>
  )}
  <div className="flex justify-center mt-0.5">
    <EloChangeIndicator change={item.eloChange} oldRank={item.rankOld} newRank={item.rankNew} globalDirection={item.globalDirection} />
  </div>
</div>
```

### Files to modify
- `src/components/animations/CardAnimationRouter.tsx` — extend `CardItem` interface and props
- `src/components/animations/BurnAnimation.tsx` — use enriched stats footer
- `src/components/animations/ShatterAnimation.tsx` — same
- `src/components/animations/VaporizeAnimation.tsx` — same
- `src/components/animations/CrushAnimation.tsx` — same
- `src/components/SliceBattleAnimation.tsx` — same
- `src/pages/SwipePreset.tsx` — pass enriched item data to `CardAnimationRouter`
- `src/pages/Swipe.tsx` — pass enriched item data to `CardAnimationRouter`

