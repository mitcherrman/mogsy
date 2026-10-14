/**
 * PAV1 — the shape of PA1's frozen content capture
 * (`__fixtures__/pa1AssemblyCapture.json`, written by
 * `scripts/pro-play-assembly/capture_pa1_sample.py`).
 *
 * Values are PA1's own (`pro_authority.assembly_content`, contract
 * `assembly_content.v1`, rules `pa1.1`), verbatim; only fields the lab does
 * not draw were trimmed. The capture CONTAINS ANSWERS (`trays[].private`) —
 * it stands in for the server, lives under the DEV-only lab, and the
 * primitive's source test pins that it never reaches `PositionalAssembly`.
 */

export type AssemblyFamily = "roster_lock" | "draft_memory";

/** PA1's slot ids (`SLOT_IDS`): the corpus says "Bot", the board says `adc`. */
export type AssemblySlotId = "top" | "jungle" | "mid" | "adc" | "support";
/** PA1's role spellings, lane order. */
export type AssemblyRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support";

export interface CapturedCard {
  /** PA1's answer-blind token, `t0..`. The lab re-mints these per round. */
  token: string;
  entity_type: "player" | "champion";
  /** `player_lp_page` or the champion key; public on the card only for media lookup. */
  entity_key: string;
  label: string;
}

export interface CapturedTray {
  seed: string;
  size: 10 | 15;
  include_bench?: boolean;
  cards: CapturedCard[];
  /** THE ANSWER. Server-side only in production (PA1 §4). */
  private: {
    answer: Record<AssemblySlotId, string>;
    cards: Record<string, { role_anchor: AssemblyRole; tier: "answer" | "opponent" | "bench" | "tournament" | "series" }>;
  };
}

export interface CapturedSubjectBase {
  match_id: string;
  team_key: string;
  opponent_key: string;
  league_slug: string;
  tournament_id: string;
  tournament_name: string;
  stage: "Finals" | "Semifinals" | "Quarterfinals" | null;
  season: number;
}

export interface CapturedRosterSubject extends CapturedSubjectBase {
  games: { game_number: number; game_date: string; side: "blue" | "red" }[];
}

export interface CapturedDraftSubject extends CapturedSubjectBase {
  game_number: number;
  canonical_game_id: string;
  historical_game_id: string;
  game_date: string;
  patch: string | null;
  side: "blue" | "red";
}

export interface CapturedLineupEntry {
  slot_id: AssemblySlotId;
  role: AssemblyRole;
  entity_key: string;
  label: string;
  evidence_levels?: string[];
}

export interface CapturedRoundBase {
  id: string;
  content_id: string;
  display: { team: string; opponent: string | null; event: string | null; stage: string | null };
  lineup: CapturedLineupEntry[];
  provenance: Record<string, unknown> & { path?: string };
  trays: CapturedTray[];
}

export interface CapturedRosterRound extends CapturedRoundBase {
  family: "roster_lock";
  subject: CapturedRosterSubject;
}

export interface CapturedDraftRound extends CapturedRoundBase {
  family: "draft_memory";
  subject: CapturedDraftSubject;
  notes: { pick_order: string };
}

export type CapturedRound = CapturedRosterRound | CapturedDraftRound;

export interface CapturedTeamMedia {
  team_key: string;
  state: "art" | "fallback";
  reason: string;
  display_name: string | null;
  /** The authority's monogram source, e.g. "SSG". */
  label: string | null;
  /** Relative to the Combat API root; resolved with `resolveAssetUrl`. */
  asset_path: string | null;
  credit: string | null;
  as_of: string[];
}

export interface AssemblyCapture {
  captured_at: string;
  authority: {
    module: string;
    contract_version: string;
    rules_version: string;
    pa1_content_commit: string;
    corpus: string;
    identity_db: string;
    media: string;
  };
  sample: { league: string; stage: string; first_season: number; seeds: string[]; tray_sizes: number[] };
  refusals: { family: AssemblyFamily; match_id: string; team_key: string; season?: number; game_number?: number; primary_reason: string }[];
  rounds: CapturedRound[];
  team_media: Record<string, CapturedTeamMedia>;
}

/** PA1's lane order, as slot ids. */
export const ASSEMBLY_SLOT_ORDER: readonly AssemblySlotId[] = ["top", "jungle", "mid", "adc", "support"];

export const ASSEMBLY_SLOT_LABELS: Record<AssemblySlotId, { label: string; short: string }> = {
  top: { label: "Top", short: "TOP" },
  jungle: { label: "Jungle", short: "JNG" },
  mid: { label: "Mid", short: "MID" },
  adc: { label: "Bot", short: "BOT" },
  support: { label: "Support", short: "SUP" },
};

/** The corpus's role word for a slot id, as PA1 spells it. */
export const ASSEMBLY_SLOT_ROLE: Record<AssemblySlotId, AssemblyRole> = {
  top: "Top", jungle: "Jungle", mid: "Mid", adc: "Bot", support: "Support",
};

export function slotForRole(role: AssemblyRole): AssemblySlotId {
  return (Object.keys(ASSEMBLY_SLOT_ROLE) as AssemblySlotId[]).find((s) => ASSEMBLY_SLOT_ROLE[s] === role) ?? "top";
}
