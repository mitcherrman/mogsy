/**
 * The startup surface.
 *
 * One component, one job: paint the destination route's base colour and nothing
 * else. No structure, no placeholders, no animation, no text.
 *
 * This deliberately shows *less* than the page it stands in for. An earlier
 * version drew the hub's geometry — heading band, book outlines — on the theory
 * that reserving the final layout would feel more finished. It did the opposite:
 * the visitor watched the page assemble itself out of empty boxes, which reads
 * as slower than a plain surface even when it is not. A flat colour has no
 * intermediate state to notice, so the real page simply appears.
 *
 * It is `aria-hidden` and carries no role: this is ordinary route hydration, not
 * an event worth announcing. Assistive tech should meet the real page when it
 * arrives rather than a "loading" interstitial on every navigation.
 *
 * Route is still the only input, so it remains safe to render before auth, app
 * settings, profile or entitlement state are known — there is nothing here that
 * could turn out to be wrong about the visitor.
 */

import { baseBackgroundForPath } from "@/lib/startup-shell";

export function StartupSurface({ pathname }: { pathname?: string }) {
  return (
    <div
      aria-hidden="true"
      data-startup-surface=""
      className="fixed inset-0"
      // No pathname means no route context — falls through to the app base
      // colour, which is what the standalone routes (auth, reset-password,
      // admin viewers) want anyway.
      style={{ background: baseBackgroundForPath(pathname ?? "") }}
    />
  );
}
