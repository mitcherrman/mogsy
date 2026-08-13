// ---------------------------------------------------------------------------
// Academy Welcome (HI1) — the curated mode previews.
//
// Four, not six. The introduction's job is to make a new visitor think "there
// is a lot here" and know where to start; the full destination list is the hub
// they land on next, and duplicating it here would just be a worse hub.
//
// PRESENTATION (HI1-2): one mode is FEATURED at a time in a large exhibit, and
// the four names sit beneath it as uniform selectors. This replaced a row of
// four equal cards, which had two problems: it read as a generic feature grid,
// and it exposed the fact that only two of the four modes have finished Academy
// artwork — the other two were visibly icon placeholders sitting next to
// finished plates. Giving each mode the whole exhibit in turn means each one is
// composed on its own terms, and the selectors stay deliberately uniform so no
// mode can look less finished than its neighbour.
//
// TAXONOMY: Ranked is INSIDE Leaguecraft, not a peer of it. src/academy holds a
// finished `ranked.png` plate, and it is deliberately not used here — promoting
// it to the top level would tell a new visitor that Leaguecraft and Ranked are
// two separate products to choose between, which is wrong. It appears instead
// as one of Leaguecraft's own highlights.
//
// NOT PREVIEWED — "Meta Reflex": the name still survives only in two comments in
// LolHub.tsx and one test assertion. The hub subsection is switched off
// (SHOW_SWIPE_GAMES = false) and nothing user-facing is labelled "Meta Reflex" —
// the /league-swipe games present themselves as "Favorite Champion", "Stat Duel"
// and so on. Previewing a mode a new visitor then cannot find would work against
// the point of the introduction. `meta-reflex.png` is ready; adding it back is
// one entry in this list plus one `visual` case.
// ---------------------------------------------------------------------------

import { BrainCircuit, FileText, Layers, Swords } from "lucide-react";

import leaguecraftArt from "@/academy/leaguecraft-studies.png";
import archivesArt from "@/academy/mogzy-archives.png";

/**
 * How a mode's featured exhibit is drawn. A discriminated union rather than an
 * optional image, because the four exhibits are genuinely different objects —
 * two are painted Academy plates, one is a duel, one is a card socket — and
 * pretending they are all "an image" is what produced the flat card grid.
 */
export type AcademyModeVisual =
  /**
   * A finished Academy plate, shown emblem-only.
   *
   * `emblemFocus` is the object-position used to frame the painted emblem and
   * push the artwork's ENGRAVED title out of the crop. That title is baked into
   * the pixels and, for Leaguecraft, reads "Leaguecraft Studies" — which is not
   * the approved product name. Cropping is not a workaround for the wording: the
   * exhibit prints the real name in real text underneath either way, and doing
   * that under a second painted name looked like a bug. A corrected asset can be
   * dropped in and the focus value simply re-tuned or removed.
   */
  | { kind: "plate"; src: string; emblemFocus: string }
  /** Two combatants facing off — what the Combat Lab actually stages. */
  | { kind: "duel" }
  /** The real Stat Check card socket, holding a stat to compare. */
  | { kind: "socket" };

export interface AcademyMode {
  /** Stable id — React key, tab ids, never displayed. */
  id: string;
  /**
   * Display name. Must match how the hub labels the same destination — hence
   * "Leaguecraft", not the artwork's engraved "Leaguecraft Studies".
   */
  title: string;
  /** One concrete line: what the user does there, not a slogan. */
  description: string;
  /** Three short highlights. Answers "why is this interesting?" at a glance. */
  highlights: string[];
  /** Icon for the uniform selector row. */
  Icon: React.ElementType;
  /** How the featured exhibit is composed. */
  visual: AcademyModeVisual;
}

export const ACADEMY_MODES: AcademyMode[] = [
  {
    id: "leaguecraft",
    title: "Leaguecraft",
    description:
      "Test what you know about champions, items and abilities — then put it on the line in ranked duels.",
    highlights: ["Quizzes", "Mastery", "Ranked"],
    Icon: BrainCircuit,
    // 251×280 plate; the engraved name sits in the bottom fifth.
    visual: { kind: "plate", src: leaguecraftArt, emblemFocus: "center 32%" },
  },
  {
    id: "combat-lab",
    title: "Combat Lab",
    description:
      "Put two champions in a room, build them however you like, and find out what actually wins.",
    highlights: ["Any matchup", "Real formulas", "Full damage breakdown"],
    Icon: Swords,
    visual: { kind: "duel" },
  },
  {
    id: "stat-check",
    title: "Stat Check",
    description:
      "A duel of pure game knowledge: which champion wins on the stat, and by how much?",
    highlights: ["Head to head", "Against the clock", "Play a friend"],
    Icon: Layers,
    visual: { kind: "socket" },
  },
  {
    id: "archives",
    title: "Mogzy Archives",
    description:
      "The reference shelf — every champion, ability, cooldown and patch change, written down.",
    highlights: ["Champions", "Abilities", "Patch history"],
    Icon: FileText,
    // 224×256 plate; same engraved-name band as above.
    visual: { kind: "plate", src: archivesArt, emblemFocus: "center 34%" },
  },
];
