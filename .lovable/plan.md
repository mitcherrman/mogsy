

## Add Red Heart Pop-Up on Winner Card (All Animations)

Every animation has a `!isLoser` winner card block. We'll add a heart emoji/icon that pops up with a scale+fade animation on the winner card's image area when the phase leaves "idle".

### Implementation

Add a `motion.div` inside the winner card's image container (after the `<img>`) across all 9 animation files. The heart will:
- Start at scale 0, opacity 0
- Spring up to scale 1, opacity 1
- Then fade out slightly (opacity ~0.8) and settle
- Positioned center of the image area, z-20 so it sits above everything
- Use a red heart character `❤️` styled with text-red-500, text-3xl/4xl

**Reusable snippet** (same in every file):

```tsx
{phase !== "idle" && (
  <motion.div
    className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 0.85] }}
    transition={{ duration: 0.45, delay: 0.05, ease: "easeOut" }}
  >
    <span className="text-4xl md:text-5xl drop-shadow-lg select-none">❤️</span>
  </motion.div>
)}
```

### Files to modify (9 total)
Each file gets the heart snippet added inside the winner card's image `<div>` (the `portrait:aspect-[5/4]` container), right after the `<img>`:

1. `src/components/animations/DefaultFadeAnimation.tsx`
2. `src/components/animations/ShatterAnimation.tsx`
3. `src/components/animations/BurnAnimation.tsx`
4. `src/components/animations/VaporizeAnimation.tsx`
5. `src/components/animations/CrushAnimation.tsx`
6. `src/components/animations/ChopAnimation.tsx`
7. `src/components/animations/MoggedAnimation.tsx`
8. `src/components/animations/SgtDoakesAnimation.tsx`
9. `src/components/SliceBattleAnimation.tsx`

