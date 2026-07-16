# Advertising infrastructure (provider-neutral core + hardened legacy)

Status: **no live ad serving**. Third-party ads are disabled by default,
consent is structurally "unknown" (no CMP), and the AdSense script is never
loaded unconditionally.

## The AdSense account (real, intentional)

The site has a **legitimate, existing Google AdSense account**:
`ca-pub-9823769047605421`. It was previously submitted for review and was
**not approved to serve ads** because Google judged the site's content
insufficient at the time — a site-readiness issue, **not** an invalid
publisher configuration. The account connection is deliberately preserved.

Distinguish:
- **Account connection** — the `<meta name="google-adsense-account">` tag in
  `index.html`. Present, unchanged, and the single deployed source of truth
  for the publisher ID (read by `getAdsensePublisherId()`; an optional
  `VITE_ADSENSE_PUBLISHER_ID` env var overrides it, validated `ca-pub-\d+`,
  fail-closed when malformed/missing — never fabricated).
- **Site approval to serve ads** — not yet granted; requires resubmission.
- **Ad units / slots** — configured per placement in Supabase
  `app_settings.global_ads_enabled` via Admin → Ads; no slot IDs in code.
- **Google script loading** — on-demand only, via
  `src/lib/ads/googleLoader.ts` (see below). The old unconditional
  `<script>` tag was removed from `index.html` in Phase A.
- **House/direct advertising** — legacy `ad_creatives` (admin-managed) and
  new static house promos; neither needs the Google script.
- **Consent readiness** — no CMP; `src/lib/ads/consent.ts` returns
  `"unknown"`, which blocks all Google rendering and script loading.
- **Route/entitlement controls** — centralized in `src/lib/ads/policy.ts`,
  applied to new `<AdSlot>`s AND to legacy surfaces via `useLegacyAdGate`.

## Google script loader (`src/lib/ads/googleLoader.ts`)

`ensureGoogleAdsScript()` — states `idle → loading → loaded | failed`:
- Requires ALL of: `VITE_ADS_ENABLED`, `VITE_THIRD_PARTY_ADS_ENABLED`,
  consent `"granted"`, a third-party-eligible policy decision, and a valid
  publisher ID.
- Idempotent: concurrent callers share one promise; an existing matching
  script tag is reused; at most one tag is ever injected.
- Fails safely (never throws into UI); retries only when explicitly asked.
- Never runs inside the test runner unless a test opts in.
- Google test mode (`data-adtest` on non-production hosts) is unchanged — it
  is applied per-unit by `AdBanner`.

Because no CMP exists, **production Google rendering is unreachable**: the
consent gate cannot return `"granted"` until a CMP is integrated in
`consent.ts`.

## Legacy compatibility gate (`src/lib/ads/useLegacyAdGate.ts`)

Maps legacy placement keys to typed registry placements
(`swipe → swipe_interstitial`, `blog → blog_inline`; unknown keys fail
closed) and runs the same pure policy resolver as `<AdSlot>`:
- Pro status from the shared `SitewideThemeContext.proStatus` (no second
  query); **fail-closed while a signed-in user's entitlement is unresolved**.
- Returns `{ allowGoogle, allowCustom, suppressed, reason, staffQaActive }`.
- Legacy Swipe creatives are paid-style ads, so Pro is fully suppressed
  (no Google unit and no custom creative), unlike `<AdSlot>` house promos.
- **Staff QA override**: explicit `staffQa` input (Swipe pages pass their
  existing role check). It lifts ONLY Pro suppression, grants custom
  creatives only, never Google eligibility — so it cannot create live ad
  traffic — and cannot bypass the kill switch, routes, gameplay states,
  consent, or loading entitlement. Previously staff were handled by
  falsifying `isPro=false`; that hack is removed.

### Swipe (preserved UX, hardened policy)

`Swipe.tsx`/`SwipePreset.tsx` keep their interstitial design, frequency
logic (`shouldShowAd` every N matches, unchanged), creative selection,
skip/countdown, and `ad_events` analytics. The gate now decides *whether*
any ad may show; `SwipeAdCard`'s AdSense path additionally requires
`allowGoogle`. No ad is queued while entitlement is unresolved, and no ad is
shown retroactively for matches that occurred during that window.

**Deployment note:** legacy Swipe ads now also require the env flags
(`VITE_ADS_ENABLED=true` and, for custom creatives, `VITE_HOUSE_ADS_ENABLED=true`)
in addition to the existing Supabase settings. Unset flags = no Swipe ads.

### Blog (bypass closed)

The blog `adsense` block now renders through
`src/components/ads/GatedAdBanner.tsx` — the only permitted path to a Google
unit in blog content. It enforces the full policy, validates the author slot
(numeric only), ignores author-supplied client IDs in favor of the single
publisher source, loads the script via the loader only, labels output
"Advertisement", renders **nothing** (no layout gap) when suppressed, and
shows a dashed diagnostic only in dev builds with placeholders enabled.

## Fail-closed remote configuration

`useAdSystem` now starts `off` and stays `off` for: missing settings row,
query error, malformed value, absent enable flags, or per-placement
disabled. Only an explicit, valid, enabled configuration turns legacy ads on
— and the compatibility gate still applies afterwards. No Supabase data or
schema changed.

## Analytics: two systems, two jobs

- **`ad_events`** (legacy, Supabase, via `logAdEvent`) — authoritative
  monetization history: impression / click / skip / cta_click with creative
  and profile attribution. Unchanged; history preserved.
- **`funnel_events`** (`ad_slot_*`, `house_ad_clicked`) — policy/lifecycle
  observability: eligibility, rendering, suppression reasons, errors.
  Payloads are placement/provider/reason only — no PII, no quiz answers.

Google ad clicks are never tracked via DOM interception (AdSense reports
them itself).

## Architecture

| Piece | File | Role |
| --- | --- | --- |
| Placement registry | `src/lib/ads/placements.ts` | Typed `AdPlacement` union + per-placement metadata (label, surface, reserved height, house/third-party allowance). Unknown ids cannot render. |
| Policy resolver | `src/lib/ads/policy.ts` | Pure function `resolveAdPolicy(ctx)` → `third_party` / `house` / `placeholder` / `suppressed(reason)`. All commercial rules live here; fully unit tested. |
| Env flags | `src/lib/ads/config.ts` | Reads `VITE_ADS_*` flags; everything defaults **off**. |
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

No CMP exists yet. `AdSlot` passes `consent: "unknown"`, so third-party
eligibility is **structurally impossible** until a consent integration sets
`"granted"`. Do not flip this without legal review.

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
"Advertisement", using `googleLoader` + the `AdBanner` unit internals.
Nothing else in product pages should need to change.

## Remaining Phase B work (provider unification)

1. Implement the `adsense` provider inside `<AdSlot>`'s third-party boundary
   (reusing `AdBanner`'s fill-status/adtest/slot-validation internals).
2. Implement `house`/`direct` providers backed by `ad_creatives`, replacing
   the static `houseAds.ts` content.
3. Map admin placement keys ↔ registry placements in one table; retire the
   legacy `shop` placement key (violates the checkout exclusion).
4. Remove the remaining hardcoded `ca-pub` fallbacks: `AdBanner.tsx:23` and
   the inline fallbacks in `Swipe.tsx`/`SwipePreset.tsx` SwipeAdCard props
   (all the same legitimate ID; currently unreachable without consent, kept
   in Phase A to avoid churn).
5. Migrate the Swipe interstitial UI onto the shared component model.

## CMP requirement + re-review checklist (process, not code)

- Integrate a CMP and wire its advertising-consent signal into
  `src/lib/ads/consent.ts` — until then Google units cannot render anywhere.
- Settle the canonical domain (`mogzy.lol` vs `mogsy.app` in `index.html`
  metadata and `AdBanner`'s prod-host regex) before resubmitting.
- Add `ads.txt` at the canonical domain root.
- Re-verify the privacy policy's advertising section.
- Resubmit the (existing) AdSense account for site approval; validate with
  `data-adtest` test mode; do not enable Auto ads.
- Invalid-traffic safeguards and Core Web Vitals monitoring after approval.
