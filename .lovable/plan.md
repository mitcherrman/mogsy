

# Upgrade Mogsy Swipe Media System

This is a large, multi-phase upgrade. Important context: this project uses **React + Vite** (not Next.js), **Supabase** for backend, and the current swipe system renders static images (not GIFs/videos for card content). The decorative GIFs are only used in animation overlays. Let me scope this to what's actually impactful and feasible.

## What Already Exists
- Cards render `<img>` tags with static images from `preset_item_images` table
- Framer Motion handles card transitions with `opacity` animations
- Card animations (burn, shatter, slice, etc.) use z-[70] overlays
- Image uploads go to Supabase Storage (`profile-photos` bucket)
- No video support, no gesture-based swiping (only click + minimal drag)
- No prebuffering of upcoming card images

## Plan

### Phase 1: Media Processing Pipeline (Edge Function + Database)

**Database migration** — Create `processed_media` table:
```
id, owner_profile_id, original_url, mp4_url, webm_url, thumbnail_url, 
media_type (image|gif|video), duration, width, height, created_at
```

**Edge function** `process-media/index.ts` — When a GIF is uploaded in Admin Play:
1. Accept the upload, store original to Supabase Storage
2. Use a cloud FFmpeg service (or flag for async processing) to convert GIF → MP4/WebM
3. Generate thumbnail JPG
4. Store converted assets and update `processed_media` row

> **Reality check**: Server-side FFmpeg isn't available in Deno edge functions. The practical approach is to use a **client-side conversion** library or integrate with an external API. For MVP, we'll detect GIF uploads and convert client-side using the existing `modern-gif` package (already installed) for thumbnail extraction, and store a flag indicating the media needs video conversion. A future iteration can add server-side processing.

**Practical MVP approach**: 
- Detect GIF uploads in `AdminPlayLeagueItems.tsx`
- Generate a static thumbnail frame client-side
- Store both original GIF URL and thumbnail URL in `processed_media`
- Render GIFs using `<video>` tags where MP4/WebM versions exist, fall back to `<img>` otherwise

### Phase 2: AutoVideo Component + Card Rendering

**Create `src/components/AutoVideo.tsx`** — Reusable component:
- Accepts `src` prop (any media URL)
- Detects if URL points to video (mp4/webm) vs image
- Renders `<video autoPlay loop muted playsInline preload="metadata">` for video
- Falls back to `<img>` for images
- Accepts `className`, `style`, `onLoad` props
- Controls play/pause based on visibility via IntersectionObserver

**Update `SwipePreset.tsx` card rendering** — Replace `<img>` tags with `<AutoVideo>` where media might be animated.

### Phase 3: Image/Media Prebuffering

**Add prebuffering in `SwipePreset.tsx`**:
```tsx
useEffect(() => {
  // Preload next 2-3 matchup pairs
  const upcoming = matchups.slice(currentIndex + 1, currentIndex + 4);
  upcoming.flat().forEach(item => {
    const url = getDisplayImage(item) || item.image_url;
    if (url) {
      if (url.endsWith('.mp4') || url.endsWith('.webm')) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;
      } else {
        const img = new Image();
        img.src = url;
      }
    }
  });
}, [currentIndex, matchups]);
```

Same pattern in `Swipe.tsx` for user-league swiping.

### Phase 4: GPU-Accelerated Swipe Gestures

**Update card motion in `SwipePreset.tsx`**:
- Replace the current minimal drag with proper `translate3d` transforms via Framer Motion
- Add `will-change: transform` to card containers
- Implement velocity-based swipe prediction:
  ```tsx
  onDragEnd={(_e, info) => {
    const velocity = info.velocity.x;
    const offset = info.offset.x;
    if (Math.abs(velocity) > 500 || Math.abs(offset) > 60) {
      handleChoose(idx as 0 | 1);
    }
  }}
  ```
- Add swipe direction overlay (subtle "MOG" / "PASS" text that fades in based on drag offset)
- Ensure all transforms use `translate3d(x, 0, 0) rotate(angle)` for GPU compositing

### Phase 5: Swipe Direction Overlays

**Add overlay layer to each card** during drag:
- Show "👑 MOG" or "👎" overlay that scales with drag distance
- Layer structure: card bg (z-1) → image (z-10) → drag overlay (z-15) → animation overlay (z-70)
- Fade in/out with CSS opacity transitions tied to drag offset

### Phase 6: Card Stack Rendering (Visual Polish)

**Render next card slightly visible behind current pair**:
- Show the upcoming matchup pair scaled down (scale 0.95, opacity 0.5) behind current cards
- Absolute positioning with stacking context
- Only on desktop (mobile viewport too constrained)

## Files to Create/Edit

| File | Action | Description |
|------|--------|-------------|
| `src/components/AutoVideo.tsx` | Create | Reusable video-as-gif component with visibility control |
| `src/components/SwipeDirectionOverlay.tsx` | Create | Drag direction indicator overlay |
| `src/pages/SwipePreset.tsx` | Edit | Add prebuffering, GPU transforms, gesture prediction, direction overlays |
| `src/pages/Swipe.tsx` | Edit | Same prebuffering + gesture improvements |
| `src/components/admin/AdminPlayLeagueItems.tsx` | Edit | Detect GIF uploads, store processed media reference |
| DB migration | Create | `processed_media` table for tracking converted assets |

## Phases Summary

1. **Media table + GIF detection** — Database + admin upload awareness
2. **AutoVideo component** — Render video where available
3. **Prebuffering** — Preload next 3 matchup pairs
4. **GPU swipe gestures** — translate3d, velocity prediction, will-change
5. **Direction overlays** — Visual swipe feedback
6. **Card stack** — Depth effect on desktop

