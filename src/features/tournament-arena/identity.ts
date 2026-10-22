/**
 * Entrant identity: a deterministic accent per `profile_id` (the Dynasty
 * `accentStyle` pattern, applied to people instead of orgs), initials for the
 * monogram fallback, and the role / tier art hooks.
 *
 * Entrants are PEOPLE, not teams: display name + role mascot (or monogram) +
 * tier crown. No pro-team crests are ever drawn for a user.
 */
import type { CSSProperties } from "react";

import { resolveCrownArt } from "@/lib/ranked/crowns";
import { isRankedRole, type RankedRole } from "@/lib/ranked-public/roles";

import type { ArenaEntrant } from "./contracts";

export interface EntrantAccent {
  /** Hex colour. */
  hex: string;
  /** "r g b" for `rgb(var(--ta-accent-rgb) / a)`. */
  rgb: string;
  name: string;
}

/** Eight accents that sit inside Mogzy's gold/navy room. */
export const ACCENTS: readonly EntrantAccent[] = [
  { hex: "#e3c66f", rgb: "227 198 111", name: "gold" },
  { hex: "#5cc8ea", rgb: "92 200 234", name: "tide" },
  { hex: "#ff8f63", rgb: "255 143 99", name: "ember" },
  { hex: "#b99cff", rgb: "185 156 255", name: "gale" },
  { hex: "#7ee8b0", rgb: "126 232 176", name: "grove" },
  { hex: "#ff7aa2", rgb: "255 122 162", name: "rose" },
  { hex: "#f4d35e", rgb: "244 211 94", name: "sun" },
  { hex: "#8fd3ff", rgb: "143 211 255", name: "frost" },
];

/** FNV-1a; stable across sessions and machines. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function accentFor(profileId: string): EntrantAccent {
  return ACCENTS[hashString(profileId) % ACCENTS.length];
}

export function accentStyle(profileId: string | null | undefined): CSSProperties {
  if (!profileId) return {};
  const a = accentFor(profileId);
  return { "--ta-accent": a.hex, "--ta-accent-rgb": a.rgb } as CSSProperties;
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s_\-.]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function entrantRole(e: Pick<ArenaEntrant, "role_emblem"> | null | undefined): RankedRole | null {
  const r = e?.role_emblem ?? null;
  return isRankedRole(r) ? r : null;
}

export function entrantCrown(e: Pick<ArenaEntrant, "tier"> | null | undefined): string | null {
  return resolveCrownArt(e?.tier ?? null);
}

export function entrantById(entrants: readonly ArenaEntrant[], id: string | null | undefined): ArenaEntrant | null {
  if (!id) return null;
  return entrants.find((e) => e.profile_id === id) ?? null;
}
