## Add third popout style: "portrait"

Adds a new option alongside `splash` (inside-card background) and `cutout` (transparent hover slide). The `portrait` style renders the champion's full rectangular loading-art portrait sticking out past the **outer** edge of each zipper card — matching the original screenshot where Akali's portrait juts out to the right of the Combat Lab card.

### Type + storage
- Extend `HexPopoutStyle` in `HexZipperCard.tsx` to `"cutout" | "splash" | "portrait"`.
- `app_settings` row `lol_hub_popout_style` now accepts `"portrait"` as a valid value; default remains `"splash"`. Invalid values still fall back to `"splash"`.

### HexZipperCard
- Add a third render branch (`popoutStyle === "portrait"`) outside the inner card body, behind the border layer (`z-0`), anchored to the **outer** edge (right card → `right-0`, left card → `left-0`) — opposite of the `cutout` branch which anchors inner.
- Rectangular frame: `aspect-[3/4]`, height `~h-[360px]` (flagship `h-[440px]`), `object-cover` with `object-position` biased to face inward. Translated outward by ~50% so roughly half the portrait sits beyond the card edge.
- Always visible (not hover-gated), with a subtle hover lift (`group-hover:scale-[1.02]` + brightness bump) and a soft cyan radial glow behind it. No outward slide on hover (it's already out).
- Clipped with a soft mask-image fade on the card-facing edge so it blends into the hex border instead of a hard rectangle seam.
- Uses the same `cutoutUrl` prop the card already accepts — `LolHub` will pass the splash/loading URL for this style.
- Shield fallback preserved when `cutoutUrl` is null.

### useChampionAssets
- No changes. `getChampionSplash` already returns splash with loading fallback — reused for `portrait`.

### LolHub
- When `popoutStyle === "portrait"`, pass `getChampionSplash(...)` as `cutoutUrl` (same as `splash` branch).
- No layout/zipper changes; portrait sits in the existing card's overflow.

### LolPopoutStyleToggle
- Expand the segmented control from 2 to 3 buttons: `Splash`, `Cutout`, `Portrait`.
- Same optimistic update + `toast.error` revert on `app_settings` write failure.
- Admin-only gating (`has_role`) unchanged.

### Changelog
- Append entry to `src/lib/lol-changelog.ts` describing the new third option.

### Files
- Modified: `src/components/lol/HexZipperCard.tsx`, `src/components/lol/LolPopoutStyleToggle.tsx`, `src/pages/LolHub.tsx`, `src/lib/lol-changelog.ts`
- No DB migration, no edge function changes, no new dependencies.
