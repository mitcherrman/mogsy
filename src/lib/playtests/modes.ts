/**
 * UGMP — every game mode the owner can play from Admin → Leaguecraft →
 * Ranked → Playtests, in hub order.
 *
 * One presentation, three honest maturities (the `tier`):
 *
 * * `ranked-bot` — an admin-only Ranked preset: a real unrated Ranked Bot
 *   match, server-authoritative rounds, grading and reveals.
 * * `prototype` — an owner-only historical prototype the backend deals,
 *   validates and reveals (Rangefinder, Glyph Press). Not a Ranked module.
 * * `experiment` — an owner-only numeric experiment: the backend releases the
 *   historical value after Lock and nothing is graded, because no tolerance
 *   policy has been approved (Stat Drop, Combat Estimate).
 *
 * None of them awards rating, points or leaderboard standing.
 */
import type { LabStatusKey } from "./api";

export const PLAYTESTS_HUB_ROUTE = "/admin/leaguecraft?section=ranked&view=playtests";

export type PlaytestTier = "ranked-bot" | "prototype" | "experiment";

export const PLAYTEST_TIER_LABEL: Record<PlaytestTier, string> = {
  "ranked-bot": "Ranked Bot · unrated",
  prototype: "Prototype · server-validated",
  experiment: "Experiment · no grading",
};

export type LabModeId = "rangefinder" | "glyph-press" | "stat-drop" | "combat-estimate";

export const LAB_MODE_IDS: readonly LabModeId[] = ["rangefinder", "glyph-press", "stat-drop", "combat-estimate"];

export function isLabModeId(value: string | undefined): value is LabModeId {
  return value !== undefined && (LAB_MODE_IDS as readonly string[]).includes(value);
}

/** The owner-only play route for a lab mode. */
export const labModeRoute = (id: LabModeId) => `/admin/playtests/${id}`;

export interface LabMode {
  id: LabModeId;
  title: string;
  tier: Extract<PlaytestTier, "prototype" | "experiment">;
  statusKey: LabStatusKey;
  description: string;
}

export const LAB_MODES: Record<LabModeId, LabMode> = {
  rangefinder: {
    id: "rangefinder", title: "Rangefinder", tier: "prototype", statusKey: "rangefinder",
    description: "Drag the target to an ability's exact cast range on the targeting board. Ten abilities per session; the server grades the exact stop.",
  },
  "glyph-press": {
    id: "glyph-press", title: "Glyph Press", tier: "prototype", statusKey: "glyph_press",
    description: "Complete a partially engraved champion, ability or item name. Three soundings per round; the server answers soundings and grades each glyph.",
  },
  "stat-drop": {
    id: "stat-drop", title: "Stat Drop", tier: "experiment", statusKey: "stat_drop",
    description: "Drop a marker where a historical stat lands on its scale. The historical value is revealed after Lock; no pass mark is applied.",
  },
  "combat-estimate": {
    id: "combat-estimate", title: "Combat Estimate", tier: "experiment", statusKey: "combat_estimate",
    description: "Set the two-beam balance to the damage one hit deals. The captured value is revealed after Lock; no tolerance is applied.",
  },
};

export type HubEntry =
  | { kind: "lab"; id: LabModeId }
  | { kind: "preset"; id: "roster-lock" | "draft-memory" | "chronoscope" | "match-grid" | "reconstruct" | "order-forge" };

/** The hub's one grid: the seven new modes first, then the earlier Ranked Bot playtests. */
export const HUB_ORDER: readonly HubEntry[] = [
  { kind: "lab", id: "rangefinder" },
  { kind: "lab", id: "glyph-press" },
  { kind: "preset", id: "roster-lock" },
  { kind: "preset", id: "draft-memory" },
  { kind: "preset", id: "chronoscope" },
  { kind: "lab", id: "stat-drop" },
  { kind: "lab", id: "combat-estimate" },
  { kind: "preset", id: "match-grid" },
  { kind: "preset", id: "reconstruct" },
  { kind: "preset", id: "order-forge" },
];
