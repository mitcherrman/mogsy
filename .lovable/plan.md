

## Plan: Photo-dominant Profile Cards

### Current State
`ProfileCard.tsx` shows a small circle avatar (80px mobile / 128px desktop) centered above user info. The card is vertically stacked: circle photo → name/age/location → status → socials.

### New Layout
Replace the circular avatar with a large rectangular photo that fills most of the card, with user info overlaid or placed below.

**Structure:**
```text
┌──────────────────┐
│                  │
│   LARGE PHOTO    │  ← ~60-70% of card height, full width, rounded top
│   (object-cover) │
│                  │
│  [Pro] [Boosted] │  ← badges overlaid on photo corners
├──────────────────┤
│ Name        Tier │  ← info section below photo
│ Age · Location   │
│ "Status message" │
│ 📷 🎥 🎮        │  ← social icons
└──────────────────┘
```

### Changes — `src/components/ProfileCard.tsx`

1. **Photo section**: Replace the `w-20 h-20 sm:w-32 sm:h-32 rounded-full` circle with a full-width rectangular image area (`w-full aspect-[3/4] rounded-t-2xl overflow-hidden`). Image uses `object-cover` to fill.
2. **Fallback**: Keep the User icon fallback for missing photos, but in the rectangular shape.
3. **Badges**: Pro crown and boost badges positioned as absolute overlays on the photo (top-right, bottom-right).
4. **Profile frame**: Apply frame ring/shadow classes to the photo container instead of the circle.
5. **Info section**: Name, age/location, tier badge, status, and socials placed below the photo in a compact section with left-aligned or center-aligned text, padding `p-3`.
6. **Card container**: Remove centered flex layout padding, use `overflow-hidden` with `rounded-2xl` so the photo bleeds to edges.

Only file changed: `src/components/ProfileCard.tsx`.

