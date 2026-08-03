/**
 * Academy Broadcast — content model.
 *
 * The broadcast surface renders transmissions; this file is the seam where a
 * future provider (news, patches, events…) plugs in. It is deliberately lean:
 * a transmission is one announcement-shaped record, a feed is a small union of
 * the states the surface can actually draw. Nothing here knows about the audio
 * store, the network, or any CMS.
 *
 * Today the only feed is the placeholder below. It says exactly what is true —
 * the broadcast shell is online and content will appear here later — and
 * nothing more: no fake dates, stories, stats, or alerts.
 */

import type { PatchBrief } from "@/lib/patch-reports/patch-brief";

export interface BroadcastAction {
  label: string;
  /** Router path — broadcast actions always stay inside the app. */
  to: string;
}

export interface BroadcastTransmission {
  /** Stable ID so future feeds can page, dedupe, and announce changes. */
  id: string;
  /** Channel/category key — future feeds group and filter on this. */
  channel: string;
  /** Small label drawn above the headline (already display-cased by the data). */
  eyebrow: string;
  headline: string;
  summary: string;
  /** Optional media region. Absent = the surface draws no media box at all. */
  artworkUrl?: string;
  primaryAction?: BroadcastAction;
  secondaryAction?: BroadcastAction;
  /** Preformatted display string; the surface never parses or invents dates. */
  timestamp?: string;
  /**
   * Structured Patch Brief payload. When present the surface renders the
   * icon-led change rows instead of plain summary text; headline/summary/
   * actions above still describe the same transmission for every other use.
   */
  brief?: PatchBrief;
}

/** Every state the surface knows how to draw. A future provider returns one. */
export type BroadcastFeed =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "unavailable" }
  | {
      status: "ready";
      transmissions: readonly BroadcastTransmission[];
      /** Which transmission is on the page. Pager UI appears only with 2+. */
      index: number;
    };

/**
 * The one honest transmission that exists today: the shell announcing itself.
 * Accurate generic Academy language only — this is a finished placeholder, not
 * scaffolding, and it must never pretend a live content source is connected.
 */
export const PLACEHOLDER_TRANSMISSION: BroadcastTransmission = {
  id: "transmission-systems-online",
  channel: "system",
  eyebrow: "Academy Broadcast",
  headline: "Transmission systems online",
  summary: "Academy updates will appear here when new transmissions begin.",
};

export const INITIAL_BROADCAST_FEED: BroadcastFeed = {
  status: "ready",
  transmissions: [PLACEHOLDER_TRANSMISSION],
  index: 0,
};
