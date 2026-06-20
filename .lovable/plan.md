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
