

# Client-Side GIF → WebM Conversion Pipeline

## Summary
When an admin uploads a GIF in Admin Play, automatically convert it to WebM using the browser's Canvas + MediaRecorder API, upload the optimized version to storage, and serve the WebM in the swipe game instead of the raw GIF.

## How It Works

```text
Admin uploads GIF
       ↓
Decode GIF frames (modern-gif)
       ↓
Render frames to Canvas → MediaRecorder → WebM blob
       ↓
Upload both GIF + WebM to storage
       ↓
Insert row into processed_media table (original_url, webm_url)
       ↓
Swipe game checks processed_media for optimized URL
       ↓
Renders <video> via AutoVideo component instead of <img>
```

## Changes

### 1. Create `src/lib/gif-to-video.ts`
Utility that:
- Accepts a GIF `File`
- Uses `modern-gif` (already installed) to decode frames
- Draws each frame to an offscreen canvas at proper timing
- Records via `MediaRecorder` with `video/webm` codec
- Returns a WebM `Blob`
- Also extracts first frame as a JPEG thumbnail

### 2. Update `AdminPlayLeagueItems.tsx` — `handleUploadImage`
When `file.type === "image/gif"`:
1. Upload original GIF to storage (existing behavior)
2. Call `gifToWebm(file)` to get WebM blob + thumbnail
3. Upload WebM blob to storage as `preset-items/{id}/{timestamp}.webm`
4. Upload thumbnail as `preset-items/{id}/{timestamp}_thumb.jpg`
5. Insert into `processed_media` with `original_url`, `webm_url`, `thumbnail_url`, `media_type: 'gif'`
6. Store the image record's `image_url` as the original GIF URL (backward compatible)
7. Show toast: "GIF converted to optimized video"

### 3. Update `SwipePreset.tsx` — Use optimized media
- On load (alongside existing image fetch), query `processed_media` for all URLs matching loaded item images
- Build a `Map<original_url, webm_url>` lookup
- In `getDisplayImage()`, check if the URL has an optimized version and return the WebM URL instead
- The existing `AutoVideo` component already handles `<video>` rendering for `.webm` URLs

### 4. Update `AutoVideo.tsx`
- Already handles video URLs correctly
- Add `.gif` → processed media URL resolution support (minor: ensure the component's `isVideoUrl` check covers `.webm`)

## Files

| File | Action |
|------|--------|
| `src/lib/gif-to-video.ts` | Create — GIF decode + Canvas + MediaRecorder conversion |
| `src/components/admin/AdminPlayLeagueItems.tsx` | Edit — auto-convert GIFs on upload |
| `src/pages/SwipePreset.tsx` | Edit — resolve optimized URLs from processed_media |

## Constraints
- `MediaRecorder` WebM support is available in Chrome, Edge, Firefox (covers ~95% of admin users)
- Safari has limited WebM MediaRecorder support — falls back to serving original GIF
- No server-side FFmpeg needed
- Conversion happens in-browser during upload, takes a few seconds for typical GIFs

