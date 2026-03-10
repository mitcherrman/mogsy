

## Plan

### 1. Hide tutorial tips during onboarding

The `TutorialTipPopup` is rendered in `Layout.tsx`. The onboarding flow is rendered inside `Home.tsx` when `showOnboarding` is true, overlaying the entire screen at `z-[100]`.

**Fix:** In `TutorialTipPopup.tsx`, check if the user's `onboarding_completed` is false. If so, return null. This uses the existing profile query pattern — fetch `onboarding_completed` from profiles and suppress tips until it's true.

**File:** `src/components/TutorialTipPopup.tsx`

### 2. Cinematic welcome screen redesign

Redesign `OnboardingWelcome.tsx` to feel more dramatic and cinematic:

- Dark fullscreen backdrop with a radial gradient glow behind the logo
- Staggered text reveal animations (each line fades in sequentially with delay)
- Logo enters with a dramatic scale + blur-to-sharp animation
- Subtle particle/sparkle dots animating in background using framer-motion
- Tagline text uses larger, bolder typography with a slight glow effect
- Button pulses subtly to draw attention
- Remove the dots indicator from the welcome screen (first impression should be immersive, dots appear from step 2 onward)

**File:** `src/components/onboarding/OnboardingWelcome.tsx`

