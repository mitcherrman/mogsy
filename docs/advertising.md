# Advertising infrastructure (preliminary, provider-neutral)

Status: **no live AdSense integration**. This module contains **no Google ad
scripts, no publisher ID, and no slot IDs**, makes **no outbound ad network
calls**, and third-party ads are **disabled by default**. It exists so that
AdSense, house ads, and direct sponsorships can later mount into the same
placement system without touching every product page.

> Note: a separate **legacy** ad system for the Swipe card game predates this
> module (`src/hooks/useAdSystem.ts`, `src/components/AdBanner.tsx`,
> `src/components/SwipeAd*.tsx`, admin Ads panel, and an adsbygoogle script tag
> in `index.html`). The new infrastructure does not use or modify it.

## Architecture

| Piece | File | Role |
| --- | --- | --- |
| Placement registry | `src/lib/ads/placements.ts` | Typed `AdPlacement` union + per-placement metadata (label, surface, reserved height, house/third-party allowance). Unknown ids cannot render. |
| Policy resolver | `src/lib/ads/policy.ts` | Pure function `resolveAdPolicy(ctx)` → `third_party` / `house` / `placeholder` / `suppressed(reason)`. All commercial rules live here; fully unit tested. |
| Env flags | `src/lib/ads/config.ts` | Reads `VITE_ADS_*` flags; everything defaults **off**. |
| Consent boundary | `src/lib/ads/consent.ts` | `getConsentState()` returns `"unknown"` until a CMP is integrated — third-party is structurally blocked. |
| House content | `src/lib/ads/houseAds.ts` | Minimal internal product recommendations (no rotation/campaign system). |
| Analytics | `src/lib/ads/analytics.ts` | `ad_slot_eligible/rendered/suppressed/error`, `house_ad_clicked` via the existing `funnel_events` pipeline. No new SDK. Payload: placement/provider/reason/creativeId only. |
| Component | `src/components/ads/AdSlot.tsx` | `<AdSlot placement="quiz_results" />`. Wrapped in an error boundary — never throws. Renders `null` (no reserved space) when suppressed; reserves `minHeight` only when a visible unit renders. Contains the future third-party provider boundary (currently renders nothing). |

## Eligibility rules

`resolveAdPolicy` suppresses, in priority order:

1. `global_disabled` — `VITE_ADS_ENABLED` is not `true` (emergency kill switch).
2. `unknown_placement` — id not in the registry.
3. `active_quiz` / `active_ranked_match` / `ranked_recovery` — live gameplay is always ad-free.
4. Blocked routes: `admin` (`/admin*`, `/moderator`, `/quiz/admin`, `/secret-room`), `developer_route` (`/dev/*`, diagnostics pages, `/broadcast/*`), `auth_or_checkout` (`/auth`, `/reset-password`, `/shop`, `/lol/pro`, `/settings`), `policy_route` (`/privacy`, `/terms`, `/security`, `/contact`, `/feedback`).
5. `entitlement_loading` — signed-in user whose Pro status hasn't resolved. **Fail-closed**: Pro users never see an ad flash while loading.
6. Then, in order: third-party (requires known-free + flag + placement allowance + **granted consent**), house, dev placeholder, else suppressed (`pro` / `consent` / `nothing_to_render`).

### Pro behavior

- Third-party ads: **always suppressed** for Pro (and while entitlement is unresolved).
- House promotions: shown to Pro only when the creative is an ordinary product recommendation (`showToPro: true`). The "Upgrade to Pro / remove ads" upsell is never shown to Pro. House promos never imitate external ads (labeled "From Mogzy", internal links only).

Pro status comes from the existing `SitewideThemeContext` (`proStatus: "unknown" | "pro" | "free"`, backed by `profiles.is_pro`). There is no second entitlement system.

### Consent

No CMP exists yet. `AdSlot` reads `getConsentState()` (permanently
`"unknown"`), so third-party eligibility is **structurally impossible** until
a consent integration sets `"granted"`. Do not flip this without legal review.

## Environment flags (see `.env.example`)

```
VITE_ADS_ENABLED=false            # global kill switch; false disables everything
VITE_THIRD_PARTY_ADS_ENABLED=false# future AdSense/direct eligibility (keep false)
VITE_HOUSE_ADS_ENABLED=false      # internal product recommendations
VITE_AD_PLACEHOLDERS_ENABLED=false# dashed dev placeholders (never in prod builds)
```

To preview placeholders locally: set `VITE_ADS_ENABLED=true` and
`VITE_AD_PLACEHOLDERS_ENABLED=true` in `.env.local` and run `npm run dev`.
Placeholders are hard-disabled in production builds (`import.meta.env.PROD`).

To disable the entire system: unset/`false` `VITE_ADS_ENABLED` and rebuild.

## Placements

Registered: `lol_hub_mid`, `quiz_selection_lower`, `quiz_results`,
`daily_challenge_results`, `ranked_queue`, `ranked_results`, `combat_results`,
`docs_inline`, `docs_sidebar`, `profile_history`, `broadcast_below`.

Currently mounted (all render nothing unless flags enable them):

- `quiz_results` — Quiz.tsx, below score/breakdown/review (result phase only)
- `daily_challenge_results` — Quiz.tsx, below the daily result
- `combat_results` — CombatLab.tsx, below FinalStatePanel
- `docs_inline` — LeagueDocsChampionDetail.tsx, after the champion header
- `lol_hub_mid` — LolHub.tsx, between the feature grid and Swipe games

Not mounted: `ranked_queue`/`ranked_results` (Ranked exists only as the
`/dev/ranked-duel` staff prototype — a hard-excluded dev route),
`docs_sidebar`, `profile_history`, `quiz_selection_lower`, `broadcast_below`.

## Must-stay-ad-free (hard exclusions)

Active quiz questions and answer controls; active Ranked matches, round
transitions, and reconnect/recovery; checkout/auth/billing/settings; admin,
Quiz Builder, Broadcast Studio/OBS rendering; dev/test routes; privacy, terms,
security, contact; error and empty states.

## Future AdSense integration point

`AdSlot.tsx` — the `decision.kind === "third_party"` branch. A real provider
mounts there behind `VITE_THIRD_PARTY_ADS_ENABLED` + granted consent, labeled
"Advertisement". Nothing else in product pages should need to change.

## AdSense-readiness follow-ups (NOT done in this commit)

1. AdSense publisher account application and approval
2. Canonical `mogzy.lol` domain verification (and legacy-domain strategy)
3. Real publisher ID + per-placement slot IDs (env/config, never hardcoded)
4. `ads.txt` at the canonical domain root
5. CMP/consent integration (GDPR/CCPA) wired to the `consent` input
6. Privacy-policy updates for third-party advertising cookies
7. Google script loader (deferred, consent-gated) — including reconciling the
   legacy adsbygoogle tag in `index.html`
8. SPA ad-unit lifecycle (route-change handling, no timed refresh)
9. Production validation with `data-adtest` test mode
10. Invalid-traffic safeguards
11. Core Web Vitals monitoring for layout shift/regressions
