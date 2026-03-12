

## Root Cause

The `processed_media` table maps GIF URLs to optimized WebM video URLs. When "The Avengers" GIF was converted, a `webm_url` was stored. The `getDisplayImage()` function in `SwipePreset.tsx` replaces the original GIF URL with the WebM URL. However, the WebM URL is then passed to an `<img>` tag, which **cannot render video files**. The image silently fails to load.

Iron Man 1 works because its `processed_media` entry has `webm_url = null`, so the original GIF URL is used — which `<img>` can display.

**Affected areas:**
- `CardDraggable` component (lines 1216-1228) — uses `<img>` for both background blur and main image
- Ad-interstitial card rendering (lines 848-852) — uses `<img>`  
- Prebuffering logic (lines 320-331) — correctly handles video vs image, no issue here

## Fix

Replace `<img>` tags in `CardDraggable` (and the ad-interstitial card) with the existing `AutoVideo` component, which automatically renders `<video>` for video URLs and `<img>` for image URLs.

### Changes

**`src/pages/SwipePreset.tsx`**

1. Add `import AutoVideo from "@/components/AutoVideo"` to imports
2. In `CardDraggable` (lines 1216-1228): Replace the two `<img>` tags (blur background + main image) with `AutoVideo`
   - Background blur: use `AutoVideo` with same classes
   - Main image: use `AutoVideo` with same classes + `onError` handling via a wrapper or fallback
3. In the ad-interstitial card section (lines 848-852): Same replacement
4. In `GauntletCard` — already delegates to `CardDraggable`, so covered automatically

The `AutoVideo` component handles video detection via file extension matching (`.mp4`, `.webm`, `.mov`, `.m4v`) and renders `<video autoPlay loop muted playsInline>` for videos, `<img>` for images. It also includes IntersectionObserver-based play/pause for performance.

Since `AutoVideo` doesn't support `onError`, we'll add an `onError` prop to it, or handle fallback at the `CardDraggable` level by checking the URL extension and conditionally rendering.

