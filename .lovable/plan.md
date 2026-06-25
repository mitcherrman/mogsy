## Quiz Broadcast Studio (admin)
New three-layer system: BroadcastEngine (state machine, in `src/lib/quiz-broadcast/engine.ts`), Broadcast Studio at `/admin/quiz-broadcast` (admin-only), and a clean Broadcast Window at `/admin/quiz-broadcast/view` for OBS capture. Studio and Window share `BroadcastRenderer` and stay synced via BroadcastChannel. Falls back to `MOCK_BROADCAST_QUESTIONS` when the quiz API is unreachable. Playlists + config persist in localStorage.

---

### Problem
The `portrait` popout style currently renders champion **splash** art (via `getChampionSplash`), which falls back to loading art only when splash is missing. The user wants `portrait` to always use the dedicated **loading** art asset instead.

### Changes
1. **`src/hooks/useChampionAssets.ts`**
   - Add a `getChampionLoading` helper that returns `manifest.champions?.[name]?.loading` resolved through `resolveAssetUrl`, with no splash fallback.

2. **`src/pages/LolHub.tsx`**
   - In the `cutoutUrl` prop passed to `HexZipperCard`, branch so that `popoutStyle === "portrait"` calls `getChampionLoading(...)` instead of `getChampionSplash(...)`.
   - `cutout` continues to use `getChampionCutout(...)`.
   - `splash` continues to use `getChampionSplash(...)`.

3. **`src/components/lol/HexZipperCard.tsx`**
   - Update the `cutoutUrl` JSDoc to document that portrait uses loading art.

No DB migrations, no new dependencies, no edge function changes.
