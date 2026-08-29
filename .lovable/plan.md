# Diagnosis: Yasuo/Yone still under Nerfs in the Patch Brief

## Verdict

The frontend is correct. The live backend payload for patch 26.17 still labels both champions as nerfs with the old provenance source, so no frontend precedence change can move them.

## Evidence from the live API

`GET https://web-production-83e53.up.railway.app/api/patch-reports/26.17` (the URL built from `VITE_COMBAT_API_URL` in `.env`) returns HTTP 200, 44 cards, `built_at: 2026-08-27T22:28:14Z`.

There is exactly **one** Yasuo card and **one** Yone card — no competing semantic card exists:

```text
id 3178  Yasuo  section "Champions"
  editorial_direction        = "nerf"
  editorial_direction_source = "riot_patch_highlights"
  numeric_direction          = "non_numeric"
  change: Passive Critical Strike Damage Reduction  -10% -> -5%

id 3179  Yone   section "Champions"
  editorial_direction        = "nerf"
  editorial_direction_source = "riot_patch_highlights"
  numeric_direction          = "non_numeric"
  change: Passive Critical Strike Damage Reduction  -10% -> -5%
```

Both cards even carry Riot context text describing the change as *"reducing his crit damage penalty"* — a buff — yet the backend's resolved `editorial_direction` is still `nerf`, sourced from `riot_patch_highlights`. `riot_text_semantic` does not appear anywhere in the 26.17 payload.

## Point-by-point

1. **Live response** — see above: `nerf` / `riot_patch_highlights` for both. No `riot_text_semantic` card, no second card per entity.
2. **Runtime fields** — `usePatchBriefFeed` (`src/components/lol/broadcast/usePatchBriefFeed.ts:29-36`) fetches the same list/detail endpoints and hands `detailQuery.data` straight to `projectPatchBrief`. It receives exactly the fields above. `projectPatchBrief` honours the backend claim when present, so a single `nerf`/`riot_patch_highlights` card resolves to Nerfs. Correct behaviour for this input.
3. **Cache/query keys** — not the cause. `["patch-reports"]` / `["patch-report", version]` with `staleTime: 60_000` (`src/lib/query-client.ts`) can only serve data the API returned; the API itself returns `nerf`. A hard refresh would show the same result.
4. **Published bundle** — irrelevant to the symptom. The precedence change only matters when two or more claims compete for one entity; 26.17 ships one claim per entity, so old and new precedence produce identical output. (Whether the published build predates the change is worth confirming separately, but it cannot explain this symptom.)
5. **Post-projection overrides** — none. `briefTransmission` (`usePatchBriefFeed.ts:63-73`) only wraps the brief in a transmission; it does not touch section membership or direction.

## Root cause

Backend classification gap, not a frontend bug: the 26.17 build (`built_at` 2026-08-27) resolved Yasuo/Yone from `riot_patch_highlights` and never produced a `riot_text_semantic` claim for the `-10% -> -5%` crit-damage-reduction change. The semantic classifier either did not run for that patch build or does not treat a decreasing negative-penalty value as a buff.

Contributing signal: `numeric_direction` is `non_numeric` for both cards, so even a numeric-inference fallback would not flip them — the `-10%` / `-5%` values are not being read as numbers on the backend.

## Smallest correct fix

Frontend: nothing to change.

Backend (Patch Reports builder), one of:
- Emit a `riot_text_semantic` editorial claim for these cards so it outranks `riot_patch_highlights` (the frontend precedence already handles this correctly), **or**
- Correct the `riot_patch_highlights` grouping/semantics for penalty-reduction properties so a decrease in a negative modifier resolves to `buff`.

Then rebuild patch 26.17 so the payload changes; the live Patch Brief will regroup them under Buffs with no frontend deploy needed.

Optional frontend hardening (only if you want it, separate from this fix): treat a decreasing "…Reduction/Penalty" property as a buff in the local numeric-inference fallback. This would not help here, because the backend supplies an explicit non-null `editorial_direction` that intentionally overrides local inference.
