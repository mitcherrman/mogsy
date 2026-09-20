/**
 * COMPATIBILITY SHIM — superseded by "@/lib/analytics" (FUNNEL1B1).
 *
 * This file used to be the emitter: it assembled a row by hand and wrote it to
 * `public.funnel_events` through `(supabase as any)`. That table does not exist
 * and never has (docs/FUNNEL1_HANDOFF.md §5), so every one of the 34 call sites
 * below has been a silent no-op in production since 2026-07-10.
 *
 * It is now a delegation to the real emitter, and nothing else. Keeping the
 * function signature means those 34 call sites start working again — against
 * the new store, with a visitor id, a session id and attribution they never
 * had — without a single product surface being edited in a schema phase.
 * Retargeting and renaming them is FUNNEL1B2's job.
 *
 * Two names are translated on the way through (see LEGACY_EVENT_ALIASES):
 * `lol_landing_viewed` → `hub_entered` and `lol_start_quiz_clicked` →
 * `leaguecraft_opened`. Both have been semantically wrong since the root
 * entrance shipped — `/lol` is the Hub, not the landing — and the store now
 * records what actually happened rather than what the call site still calls it.
 *
 * NEW CODE SHOULD IMPORT `track` FROM "@/lib/analytics" DIRECTLY. This module
 * is deleted when the last legacy call site is migrated.
 */

import { track } from "@/lib/analytics";
import type { ProductEventName } from "@/lib/analytics";

/**
 * B2 UPDATE. The two `lol_*` names this type used to accept are gone, along
 * with the emitter-level rewrite rule that translated them. B1 could not touch
 * the call sites in a schema phase; B2 instruments the real surfaces, so
 * `hub_entered` and `leaguecraft_opened` now come from the places they describe
 * and the misnamed originals are retired (see RETIRED_EVENTS). Six legacy names
 * in total were retired or mapped — the emitter refuses them outright rather
 * than translating, so a reintroduced call site fails loudly.
 *
 * What is left here is diagnostic product telemetry, which keeps its names.
 */
export type FunnelEventName = ProductEventName;

/**
 * Fire-and-forget funnel event.
 *
 * The failure contract is unchanged where it was right — this never throws and
 * never blocks gameplay — and corrected where it was not: failures are now
 * recorded in the analytics diagnostics channel and warned about in DEV,
 * instead of vanishing into a bare `catch {}`. A missing table will be noticed
 * the next time, rather than two months later during an audit.
 */
export function trackFunnelEvent(
  eventName: FunnelEventName,
  payload?: Record<string, unknown>,
) {
  track(eventName, { metadata: payload });
}
