

## Analysis

I queried the `processed_media` table and found the problem. There are entries where the client-side GIF→WebM conversion "succeeded" (has a `webm_url`), but the resulting WebM files are likely **static or broken**. The `MediaRecorder` + `canvas.captureStream()` approach used in `gif-to-video.ts` is fundamentally unreliable — it's a known issue that this API often produces single-frame or poorly-encoded WebM files, especially with complex GIF timing.

**Your suspicion is correct**: Iron Man 1 works because its conversion failed (`webm_url = null`), so the original animated GIF is displayed. The Avengers and others got "converted" WebM files that are actually broken — showing as still images.

**Is the WebM conversion worth it?** No. The client-side `MediaRecorder` approach is too unreliable for production use. Server-side FFmpeg would work, but that's significant infrastructure. For the volume of GIFs in this app, the original GIFs are fine — browsers handle them natively and reliably.

## Plan: Remove WebM substitution, keep original GIFs

**1. `src/pages/SwipePreset.tsx`** — Remove the `optimizedUrls` state and the `processed_media` query that substitutes GIF URLs with WebM URLs. The `getDisplayImage` function will simply return the original image URL (GIF or static). This is the only change needed to fix the display issue.

- Remove `optimizedUrls` state variable
- Remove the `processed_media` query block (lines 270-282)
- Remove the optimized URL resolution from `getDisplayImage` (lines 346-348)

**2. `src/pages/SwipePreset.tsx`** — Keep `AutoVideo` usage for any actual video files that may be uploaded directly (mp4/webm uploads), but GIFs will now always render as `<img>` tags since their URLs end in `.gif`.

**3. No database changes** — The `processed_media` table can stay as-is; it just won't be queried during swipe rendering. The admin conversion UI can be cleaned up separately if desired.

This is a minimal, safe change that restores all animated GIFs to working state immediately.

