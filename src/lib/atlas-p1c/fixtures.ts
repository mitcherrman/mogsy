/**
 * ATL-P1-C — DEMO DATA.
 *
 * Everything in this file is a memory-only fixture for the flagship prototype.
 * No value here is a sourced game number, a Riot change line or a Pro Play
 * statistic; the shapes mirror what the audited sources can and cannot answer
 * (current ability values yes, absolute historical values no, Pro ability usage
 * no, exact head-to-head admin-only) so the workspace tells the truth about
 * coverage even though its numbers are illustrative.
 */
import type {
  AbilitySlot,
  ChampionId,
  Evidence,
  GlobalContext,
  PlayerId,
  SourceId,
  WorkspaceSnapshot,
  WorkspaceState,
} from "./types";

export const DEMO_DATA_LABEL = "DEMO DATA";

/* ------------------------------------------------------------------------- */
/* Identities and crosswalks                                                   */
/* ------------------------------------------------------------------------- */

export interface ChampionIdentity {
  id: ChampionId;
  name: string;
  title: string;
  /** Leaguecraft catalog key and Pro Play registry key; distinct on purpose. */
  leaguecraftKey: string;
  proPlayKey: string | null;
  hue: number;
}

export const CHAMPIONS: Record<ChampionId, ChampionIdentity> = {
  ahri: { id: "ahri", name: "Ahri", title: "the Nine-Tailed Fox", leaguecraftKey: "lc:champion/ahri", proPlayKey: "pro:champion/Ahri", hue: 330 },
  syndra: { id: "syndra", name: "Syndra", title: "the Dark Sovereign", leaguecraftKey: "lc:champion/syndra", proPlayKey: "pro:champion/Syndra", hue: 268 },
};

export interface PlayerIdentity {
  id: PlayerId;
  name: string;
  team: string;
  role: "mid";
  proPlayKey: string;
}

export const PLAYERS: Record<PlayerId, PlayerIdentity> = {
  faker: { id: "faker", name: "Faker", team: "T1", role: "mid", proPlayKey: "pro:player/faker" },
  chovy: { id: "chovy", name: "Chovy", team: "Gen.G", role: "mid", proPlayKey: "pro:player/chovy" },
};

/* ------------------------------------------------------------------------- */
/* Leaguecraft — patches                                                       */
/* ------------------------------------------------------------------------- */

export interface PatchEntry {
  patch: string;
  /** Ordering after 26.16 is incomplete in the audited archive. */
  orderingCertified: boolean;
  isCurrent: boolean;
}

export const CURRENT_PATCH = "26.20";

export const PATCHES: PatchEntry[] = [
  { patch: "26.20", orderingCertified: false, isCurrent: true },
  { patch: "26.19", orderingCertified: false, isCurrent: false },
  { patch: "26.18", orderingCertified: false, isCurrent: false },
  { patch: "26.17", orderingCertified: false, isCurrent: false },
  { patch: "26.16", orderingCertified: true, isCurrent: false },
  { patch: "26.14", orderingCertified: true, isCurrent: false },
  { patch: "26.12", orderingCertified: true, isCurrent: false },
  { patch: "26.10", orderingCertified: true, isCurrent: false },
];

export function patchEntry(patch: string): PatchEntry | null {
  return PATCHES.find((p) => p.patch === patch) ?? null;
}

/** Numeric ordering helper for "between patch X and current". */
export function patchNumber(patch: string): number {
  const [major, minor] = patch.split(".").map((n) => Number.parseInt(n, 10));
  return (Number.isFinite(major) ? major : 0) * 100 + (Number.isFinite(minor) ? minor : 0);
}

/* ------------------------------------------------------------------------- */
/* Leaguecraft — current ability values (DEMO)                                 */
/* ------------------------------------------------------------------------- */

export interface AbilityRecord {
  champion: ChampionId;
  slot: AbilitySlot;
  name: string;
  baseDamage: number[];
  apRatio: number;
  cooldown: number[];
  cost: number[];
  costType: "mana";
  range: number;
  source: SourceId;
}

export const ABILITIES: AbilityRecord[] = [
  {
    champion: "ahri",
    slot: "Q",
    name: "Orb of Deception",
    baseDamage: [40, 65, 90, 115, 140],
    apRatio: 0.5,
    cooldown: [7, 7, 7, 7, 7],
    cost: [55, 65, 75, 85, 95],
    costType: "mana",
    range: 880,
    source: "lc.ability_catalog",
  },
  {
    champion: "syndra",
    slot: "Q",
    name: "Dark Sphere",
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 0.65,
    cooldown: [7, 6.5, 6, 5.5, 5],
    cost: [40, 50, 60, 70, 80],
    costType: "mana",
    range: 800,
    source: "lc.ability_catalog",
  },
];

export function abilityRecord(champion: ChampionId, slot: AbilitySlot): AbilityRecord | null {
  return ABILITIES.find((a) => a.champion === champion && a.slot === slot) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Leaguecraft — patch archive change lines (DEMO)                             */
/*                                                                             */
/* The real archive stores CHANGE LINES, not past game state. These sample     */
/* lines exist so the "historical patch" state can show recorded evidence      */
/* while refusing to show absolute historical values.                          */
/* ------------------------------------------------------------------------- */

export interface ArchiveLine extends Evidence {
  champion: ChampionId;
  slot: AbilitySlot | null;
}

export const ARCHIVE_LINES: ArchiveLine[] = [
  { id: "arc-1", champion: "ahri", slot: "Q", patch: "26.18", text: "Orb of Deception — sample change line (DEMO): mana cost adjusted at early ranks.", source: "lc.patch_archive", orderingCertified: false },
  { id: "arc-2", champion: "ahri", slot: "W", patch: "26.17", text: "Fox-Fire — sample change line (DEMO): targeting priority note.", source: "lc.patch_archive", orderingCertified: false },
  { id: "arc-3", champion: "ahri", slot: "Q", patch: "26.12", text: "Orb of Deception — sample change line (DEMO): AP ratio note.", source: "lc.patch_archive", orderingCertified: true },
  { id: "arc-4", champion: "syndra", slot: "Q", patch: "26.19", text: "Dark Sphere — sample change line (DEMO): cooldown note at max rank.", source: "lc.patch_archive", orderingCertified: false },
  { id: "arc-5", champion: "syndra", slot: "R", patch: "26.14", text: "Unleashed Power — sample change line (DEMO): sphere count note.", source: "lc.patch_archive", orderingCertified: true },
  { id: "arc-6", champion: "syndra", slot: null, patch: "26.10", text: "Syndra — sample change line (DEMO): base stat note.", source: "lc.patch_archive", orderingCertified: true },
];

/** Change lines recorded strictly after `patch` and up to the current patch. */
export function archiveLinesSince(champion: ChampionId, slot: AbilitySlot | null, patch: string): ArchiveLine[] {
  const floor = patchNumber(patch);
  const ceil = patchNumber(CURRENT_PATCH);
  return ARCHIVE_LINES.filter((line) => {
    if (line.champion !== champion) return false;
    if (slot && line.slot && line.slot !== slot) return false;
    const n = patchNumber(line.patch);
    return n > floor && n <= ceil;
  }).sort((a, b) => patchNumber(b.patch) - patchNumber(a.patch));
}

/* ------------------------------------------------------------------------- */
/* Pro Play — seasons and champion records (DEMO)                              */
/* ------------------------------------------------------------------------- */

export interface ProSeason {
  season: string;
  label: string;
  /** Product season scope; NOT a calendar year. */
  scopeNote: string;
}

export const PRO_SEASONS: ProSeason[] = [
  { season: "2026", label: "2026 Season", scopeNote: "Product season scope: regular splits plus international events in product coverage. Not the 2026 calendar year." },
  { season: "2025", label: "2025 Season", scopeNote: "Product season scope. Not the 2025 calendar year." },
];

export const CALENDAR_YEARS = [2026, 2025];

export interface ProChampionRecord {
  champion: ChampionId;
  /** Key of the temporal context this record answers, e.g. "pro-season:2026". */
  contextKey: string;
  population: string;
  games: number;
  wins: number;
  presence: number; // 0..1, pick + ban rate
  /** Oracle's Elixir style metric coverage is incomplete: null means "not covered". */
  goldDiff15: number | null;
  source: SourceId;
}

export const PRO_CHAMPION_RECORDS: ProChampionRecord[] = [
  { champion: "ahri", contextKey: "pro-season:2026", population: "LCK + international, 2026 Season scope", games: 184, wins: 97, presence: 0.61, goldDiff15: 142, source: "pro.champion_records" },
  { champion: "syndra", contextKey: "pro-season:2026", population: "LCK + international, 2026 Season scope", games: 121, wins: 58, presence: 0.44, goldDiff15: null, source: "pro.champion_records" },
  { champion: "ahri", contextKey: "calendar-year:2026", population: "All competitions in coverage, 2026 calendar year", games: 203, wins: 105, presence: 0.58, goldDiff15: 118, source: "pro.champion_records" },
  { champion: "syndra", contextKey: "calendar-year:2026", population: "All competitions in coverage, 2026 calendar year", games: 139, wins: 66, presence: 0.41, goldDiff15: null, source: "pro.champion_records" },
  { champion: "ahri", contextKey: "pro-season:2025", population: "LCK + international, 2025 Season scope", games: 96, wins: 44, presence: 0.37, goldDiff15: 61, source: "pro.champion_records" },
  // Syndra has NO 2025 record on purpose: "0 games" and "not covered" must read differently.
];

export function proChampionRecord(champion: ChampionId, contextKey: string): ProChampionRecord | null {
  return PRO_CHAMPION_RECORDS.find((r) => r.champion === champion && r.contextKey === contextKey) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Pro Play — player-on-champion records (DEMO)                                */
/* ------------------------------------------------------------------------- */

export interface PlayerChampionRecord {
  player: PlayerId;
  champion: ChampionId;
  contextKey: string;
  games: number;
  wins: number;
  kda: number;
  population: string;
  source: SourceId;
}

export const PLAYER_CHAMPION_RECORDS: PlayerChampionRecord[] = [
  { player: "faker", champion: "ahri", contextKey: "pro-season:2026", games: 23, wins: 15, kda: 4.8, population: "Faker's recorded games on Ahri, 2026 Season scope", source: "pro.player_champion_records" },
  { player: "faker", champion: "syndra", contextKey: "pro-season:2026", games: 9, wins: 4, kda: 3.1, population: "Faker's recorded games on Syndra, 2026 Season scope", source: "pro.player_champion_records" },
  { player: "chovy", champion: "ahri", contextKey: "pro-season:2026", games: 17, wins: 12, kda: 6.2, population: "Chovy's recorded games on Ahri, 2026 Season scope", source: "pro.player_champion_records" },
  { player: "chovy", champion: "syndra", contextKey: "pro-season:2026", games: 0, wins: 0, kda: 0, population: "Chovy's recorded games on Syndra, 2026 Season scope", source: "pro.player_champion_records" },
  { player: "faker", champion: "ahri", contextKey: "calendar-year:2026", games: 26, wins: 17, kda: 4.6, population: "Faker's recorded games on Ahri, 2026 calendar year", source: "pro.player_champion_records" },
  { player: "chovy", champion: "ahri", contextKey: "calendar-year:2026", games: 19, wins: 13, kda: 5.9, population: "Chovy's recorded games on Ahri, 2026 calendar year", source: "pro.player_champion_records" },
];

export function playerChampionRecord(player: PlayerId, champion: ChampionId, contextKey: string): PlayerChampionRecord | null {
  return PLAYER_CHAMPION_RECORDS.find((r) => r.player === player && r.champion === champion && r.contextKey === contextKey) ?? null;
}

/* ------------------------------------------------------------------------- */
/* Gates                                                                       */
/* ------------------------------------------------------------------------- */

export const EXACT_MATCHUP_ROUTE = "/api/pro-play/matchup/exact";

/* ------------------------------------------------------------------------- */
/* Default global context and memory-only sample workspaces                    */
/* ------------------------------------------------------------------------- */

export const DEFAULT_GLOBAL: GlobalContext = {
  leaguecraft: { kind: "current" },
  proPlay: { kind: "pro-season", season: "2026" },
};

export const EMPTY_WORKSPACE: WorkspaceState = {
  global: DEFAULT_GLOBAL,
  lenses: [],
  groups: [],
  comparisons: [],
  seq: 0,
};

/**
 * Sample workspaces. These are restorable from memory only; nothing is
 * persisted, nothing is shareable, and the prototype says so on screen.
 */
export const SAMPLE_SNAPSHOTS: WorkspaceSnapshot[] = [
  {
    id: "snap-lane-scout",
    label: "Lane scout",
    description: "Ahri Q beside Syndra Q at the current patch, already compared.",
    order: ["lens-1", "lens-2"],
    state: {
      global: DEFAULT_GLOBAL,
      lenses: [
        { id: "lens-1", subject: { kind: "ability", universe: "leaguecraft", champion: "ahri", slot: "Q" }, override: null, held: null, pinned: true, groupId: null, clonedFrom: null, provenance: [] },
        { id: "lens-2", subject: { kind: "ability", universe: "leaguecraft", champion: "syndra", slot: "Q" }, override: null, held: null, pinned: false, groupId: null, clonedFrom: null, provenance: [] },
      ],
      groups: [],
      comparisons: [{ id: "cmp-3", lensIds: ["lens-1", "lens-2"] }],
      seq: 3,
    },
  },
  {
    id: "snap-divergence",
    label: "Patch divergence",
    description: "Global at 26.16; Syndra Q overridden back to current so the two Lenses diverge on purpose.",
    order: ["lens-2", "lens-1"],
    state: {
      global: { leaguecraft: { kind: "lc-patch", patch: "26.16" }, proPlay: { kind: "pro-season", season: "2026" } },
      lenses: [
        { id: "lens-1", subject: { kind: "ability", universe: "leaguecraft", champion: "ahri", slot: "Q" }, override: null, held: null, pinned: false, groupId: null, clonedFrom: null, provenance: [] },
        { id: "lens-2", subject: { kind: "ability", universe: "leaguecraft", champion: "syndra", slot: "Q" }, override: { kind: "current" }, held: null, pinned: true, groupId: null, clonedFrom: null, provenance: [] },
      ],
      groups: [],
      comparisons: [],
      seq: 2,
    },
  },
  {
    id: "snap-mid-matrix",
    label: "Mid matrix",
    description: "Faker and Chovy on Ahri and Syndra as four independent player-on-champion Lenses.",
    order: ["lens-1", "lens-2", "lens-3", "lens-4"],
    state: {
      global: DEFAULT_GLOBAL,
      lenses: [
        { id: "lens-1", subject: { kind: "player-champion", universe: "pro-play", player: "faker", champion: "ahri" }, override: null, held: null, pinned: false, groupId: "grp-5", clonedFrom: null, provenance: [] },
        { id: "lens-2", subject: { kind: "player-champion", universe: "pro-play", player: "faker", champion: "syndra" }, override: null, held: null, pinned: false, groupId: "grp-5", clonedFrom: null, provenance: [] },
        { id: "lens-3", subject: { kind: "player-champion", universe: "pro-play", player: "chovy", champion: "ahri" }, override: null, held: null, pinned: false, groupId: "grp-5", clonedFrom: null, provenance: [] },
        { id: "lens-4", subject: { kind: "player-champion", universe: "pro-play", player: "chovy", champion: "syndra" }, override: null, held: null, pinned: false, groupId: "grp-5", clonedFrom: null, provenance: [] },
      ],
      groups: [{ id: "grp-5", kind: "matrix", label: "Faker · Chovy × Ahri · Syndra", players: ["faker", "chovy"], champions: ["ahri", "syndra"] }],
      comparisons: [],
      seq: 5,
    },
  },
];
