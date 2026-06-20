## Goal

Add an admin-only floating toggle on `/lol` that switches the champion popout between two visual styles, with the choice stored globally in `app_settings` so every visitor sees the selected style. **Default is `splash`** when the row is missing or the value is invalid.

## Two styles

- **`splash` (default, original):** Rectangular splash art rendered behind the card body, clipped to the hex shape. Uses `champions[name].splash` (falls back to `loading`) from the Railway `/api/assets/champions` manifest. `object-cover`, `opacity-30 group-hover:opacity-60`, subtle `scale-105 → scale-110` on hover. Stays inside the card silhouette — no outward slide. Shield fallback if no URL.
- **`cutout` (current):** Transparent champion PNG sliding from the inner edge toward page center on hover. This is the existing `HexZipperCard` behaviour, unchanged.

## Where the setting lives

- Row in `app_settings`: `key = 'lol_hub_popout_style'`, `value = { style: 'cutout' | 'splash' }`.
- Read on `LolHub` via a small dedicated query against `app_settings`.
- **Default resolution:** if no row exists, value is null, or `style` is not one of `'cutout' | 'splash'`, treat it as `'splash'`.
- Public read, admin-only write (matches existing `app_settings` RLS).

## UI

- New component `LolPopoutStyleToggle` rendered on `LolHub` only when the current user has the `admin` role (reuse existing admin check pattern from `AdminRoute` / `useAuth` + `user_roles`).
- Small floating segmented pill bottom-right of the hub hero: "Splash" / "Cutout".
- Click flow:
  1. Optimistically update local state and pass new style to cards.
  2. Upsert `app_settings` row.
  3. **On failure:** revert local state to the previous value and show `toast.error("Couldn't save popout style")` via `sonner`.
- Non-admins never see the toggle.

## Component changes

- `HexZipperCard` gains a `popoutStyle: 'cutout' | 'splash'` prop.
  - `cutout` branch = current code unchanged.
  - `splash` branch = absolutely-positioned `<img>` inside the card body's clipped container, `object-cover`, low opacity, subtle hover zoom, z-0 behind icon/text but inside the hex clip. Shield fallback if no splash URL.
- `useChampionAssets` gets a `getChampionSplash(assets, name)` helper alongside `getChampionCutout`, returning `splash ?? loading ?? null`.
- `LolHub` reads the setting, defaults to `splash`, renders the toggle for admins only, and passes `popoutStyle` + the appropriate URL into each `HexZipperCard`.

## Scope guardrails

- No changes to the Railway edge function, zipper layout, card sizes, border pulse, or mobile fallback.
- No new tables and no migration — uses existing `app_settings` row, inserted on first admin save via upsert.
- Changelog entry appended to `src/lib/lol-changelog.ts`.

## Files touched

- `src/components/lol/HexZipperCard.tsx` — add `popoutStyle` prop + splash branch.
- `src/hooks/useChampionAssets.ts` — add `getChampionSplash` helper.
- `src/components/lol/LolPopoutStyleToggle.tsx` *(new)* — admin-only segmented toggle with optimistic update, error toast, and revert on failure.
- `src/pages/LolHub.tsx` — fetch setting (default `splash`), render toggle for admins, pass `popoutStyle` and resolved URL to each card.
- `src/lib/lol-changelog.ts` — new entry.
