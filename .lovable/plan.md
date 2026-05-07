## What's actually happening today

The ad you saw is **not Google AdSense** — it's an internal "Mogsy Pro / Live Leagues / Leaderboard / Referrals" creative from your `ad_creatives` table. Even though your placement config is set to `ad_source: "adsense"`, the swipe pages call `getRandomCreative()` first and only fall back to AdSense if the creative has no `image_url`. So custom always wins.

On top of that, two things prevent Google from ever serving:

1. The AdSense `<script>` is only injected the first time `<AdBanner>` mounts (every 5 swipes). That's late, and it means Google's crawler never sees the script on a fresh page load when verifying your site.
2. The configured `adsense_slot` is the literal string `"auto"`, which is not a valid AdSense ad-unit slot ID. A real slot needs an ID from the AdSense dashboard (e.g. `1234567890`), or you need to switch to **Auto Ads** (page-level code, no slot).

## Plan

### 1. Expose AdSense to Google on every page load

Add the AdSense loader script directly to `index.html` `<head>` with the publisher ID `ca-pub-9823769047605421`, plus the standard `meta name="google-adsense-account"` tag. This is what Google's site-verification crawler looks for. The `<AdBanner>` component will keep doing the per-unit `adsbygoogle.push({})` call.

```html
<meta name="google-adsense-account" content="ca-pub-9823769047605421" />
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9823769047605421"
        crossorigin="anonymous"></script>
```

### 2. Force AdSense (not custom creatives) in the swipe slot

Update `SwipePreset.tsx` and `Swipe.tsx` so when `adSource === "adsense"`:
- Do **not** call `getRandomCreative()`.
- Always set `showAdsenseInSwipe = true` (Swipe) / a new equivalent flag in SwipePreset.
- Pass the AdSense slot/client straight to `<SwipeAdCard>`.

### 3. Make the placeholder real and unmistakable

Right now `SwipeAdCard` just renders an `<ins>` and if AdSense has no fill the slot is invisible. Update `<AdBanner>`:
- Render a labelled placeholder behind the `<ins>` element saying **"Google AdSense slot active — ca-pub-9823769047605421 · slot {slot}"** plus a small status row ("Waiting for fill…" / "Filled" / "No fill — house ad would show here").
- Detect fill state by polling `ins.getAttribute("data-ad-status")` — AdSense sets it to `"filled"` or `"unfilled"` after the auction. Show the appropriate state.
- Keep the placeholder visible only until AdSense actually paints content (so real ads aren't covered).

This guarantees you visually confirm the AdSense unit is mounted even when Google chooses not to serve.

### 4. Enable AdSense test mode for verification

Add `data-adtest="on"` to the `<ins>` whenever the app is running on `localhost`, the Lovable preview domain, or when a `?adtest=on` query param is present. Google requires this on non-approved/dev domains to avoid policy violations and it forces test ads to render so you can confirm the integration end-to-end. On `mogsy.net` (production) the attribute is omitted so real ads serve.

### 5. Use a real ad slot (or switch to Auto Ads)

The current value `"auto"` in `app_settings.placements.swipe.adsense_slot` isn't a valid slot ID. Two options — pick one:

- **A. Display ad unit (recommended for the in-swipe slot):** create a "Display ad" in your AdSense dashboard, copy the numeric `data-ad-slot`, and update the setting via the existing Admin → Ads UI. The plan will not hard-code the slot.
- **B. Auto Ads only:** remove the `<AdBanner>` `<ins>` and rely on the page-level Auto Ads script added in step 1. This usually doesn't fit a "replace the matchup" UX, so A is better.

The plan will leave the setting untouched and surface a clear note in the UI placeholder when the slot is still `"auto"` so it's obvious what to fix.

## Best way to test the AdSense integration

1. After the changes, hard-reload the preview and open DevTools → Network. Filter for `adsbygoogle.js` — it should load on first paint (not after 5 swipes).
2. Open DevTools → Console; AdSense logs `adsbygoogle.push() error: ...` if config is wrong. With `data-adtest="on"` you should see Google's "Test Ad" creative render inside the ad card after a few swipes.
3. The new placeholder will show **Filled / Unfilled / Waiting** so even with no fill you'll know the slot is wired up correctly.
4. To validate from Google's side, in the AdSense console go to **Sites → mogsy.net → Verify**; with the script in `<head>` (step 1) the verification check passes. For per-unit verification, use **Ads → Overview → "Get code"** for the unit, confirm the slot ID matches what's in `app_settings`.
5. Before going live, replace the `"auto"` slot with the real numeric slot from AdSense and remove `?adtest=on`.

## Files touched

- `index.html` — add AdSense meta + async script.
- `src/components/AdBanner.tsx` — add labelled placeholder, fill-state detection, `data-adtest` on non-prod hosts.
- `src/pages/Swipe.tsx` — when `adSource === "adsense"`, skip `getRandomCreative()` and always show AdSense.
- `src/pages/SwipePreset.tsx` — same change, plus add an `showAdsenseInSwipe` flag (currently only Swipe.tsx has one).
- No DB migration required (the existing `app_settings` row already has `ad_source: "adsense"`).
