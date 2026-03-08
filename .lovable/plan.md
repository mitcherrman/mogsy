

## In-Swipe Ad Cards + Enhanced Admin Ads Panel

### Overview
Add a new ad delivery method — **In-Swipe Ads** — where ads appear as fake "matchup cards" within the swiping game. Users see what looks like a normal card pair but one (or both) is an ad. They must wait a configurable number of seconds before swiping past. The admin panel gets a major upgrade to let you choose between ad systems and configure everything.

### New Ad System: In-Swipe Cards

Instead of a fullscreen popup overlay (`SwipeAd`), ads appear inline as one of the two cards in a matchup. The ad card shows:
- A "Sponsored" badge
- Ad creative (image URL or placeholder for AdSense)
- Brand name / CTA text
- A countdown timer — user must wait N seconds before they can swipe past

After the countdown, tapping either card (or a "Skip" button) advances to the next real matchup. No ELO changes occur on ad rounds.

### Admin Panel Changes

The Ads tab gets restructured into sections:

1. **Ad System Selector** — New top-level toggle to choose which ad delivery method is active per placement:
   - `popup` (existing SwipeAd interstitial)
   - `in_swipe` (new card-based ads)
   - `both` (alternate between them)
   - `off`

2. **In-Swipe Ad Creative Manager** — A list of admin-created ad cards stored in a new `ad_creatives` table:
   - Image URL, brand name, CTA text, destination URL
   - Enable/disable individual creatives
   - Live preview of how the ad card looks in-game

3. **Existing placement configs** remain, with the new `ad_mode` field added to `PlacementConfig`

### Database Change

New table `ad_creatives`:

```sql
CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  brand_name text NOT NULL DEFAULT '',
  cta_text text NOT NULL DEFAULT 'Learn More',
  destination_url text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT true,
  placement text NOT NULL DEFAULT 'swipe',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ad creatives" ON public.ad_creatives
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ad creatives are publicly readable" ON public.ad_creatives
  FOR SELECT TO authenticated
  USING (is_enabled = true);
```

### Files Changed

| File | Change |
|------|--------|
| `src/components/SwipeAdCard.tsx` | **New** — In-swipe ad card component that mimics a profile card with countdown |
| `src/components/SwipeAd.tsx` | Minor — rename/clarify as "popup" mode |
| `src/pages/Swipe.tsx` | Integrate in-swipe ad logic: fetch ad settings + creatives, inject ad card rounds based on `ad_mode` |
| `src/pages/SwipePreset.tsx` | Same in-swipe ad integration for preset leagues |
| `src/components/admin/AdminAds.tsx` | Major rewrite: add ad system selector per placement, in-swipe creative CRUD with live preview, restructured UI |

### Admin Panel UX

The redesigned Ads tab will have:

1. **Global controls** (existing kill switch + summary cards)
2. **Ad System Mode** per placement — dropdown: Popup / In-Swipe Card / Both / Off
3. **In-Swipe Creatives** section:
   - Card list with image preview, brand, enable toggle
   - "Add Creative" form: image URL, brand name, CTA, destination URL
   - **Live Preview** button showing a mock swipe card
4. **Placement configs** (existing collapsibles, now with `ad_mode` field)
5. **Per-user overrides** (existing)

### Swipe Game Integration

In `Swipe.tsx` and `SwipePreset.tsx`:
- Fetch `ad_mode` from settings and `ad_creatives` from DB on mount
- On every Nth swipe (frequency), check `ad_mode`:
  - `popup`: show existing `SwipeAd` overlay
  - `in_swipe`: replace next pair with an ad card + a real profile/item, show countdown, skip ELO
  - `both`: alternate between the two
- The `SwipeAdCard` component renders like a ProfileCard but with sponsored branding and a visible countdown before interaction is allowed

