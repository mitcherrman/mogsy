// ---------------------------------------------------------------------------
// Academy Welcome (HI1) — the curated mode previews.
//
// Four, not six. The introduction's job is to make a new visitor think "there
// is a lot here" and know where to start; the full destination list is the hub
// they land on next, and duplicating it here would just be a worse hub.
//
// TAXONOMY: Ranked is INSIDE Leaguecraft, not a peer of it. src/academy holds a
// finished `ranked.png` plate, and it is deliberately not used here — promoting
// it to the top level would tell a new visitor that Leaguecraft and Ranked are
// two separate products to choose between, which is wrong.
//
// NOT PREVIEWED — "Meta Reflex": as of this baseline the name survives only in
// two comments in LolHub.tsx and one test assertion. The hub subsection is
// switched off (SHOW_SWIPE_GAMES = false) and nothing user-facing is labelled
// "Meta Reflex" anywhere in the app — the /league-swipe games present
// themselves as "Favorite Champion", "Stat Duel" and so on. Previewing a mode a
// new visitor then cannot find would work directly against the point of the
// introduction, so Mogzy Archives — which IS in the hub, IS reachable, and has
// finished art — takes the fourth slot. `meta-reflex.png` is ready and waiting;
// when Meta Reflex has a real surface, restoring it here is a one-entry change.
// ---------------------------------------------------------------------------

import { BrainCircuit, FileText, Layers, Swords } from "lucide-react";

import leaguecraftArt from "@/academy/leaguecraft-studies.png";
import archivesArt from "@/academy/mogzy-archives.png";

export interface AcademyMode {
  /** Stable id — used as a React key and in analytics, never displayed. */
  id: string;
  /** Display name. Must match how the hub labels the same destination. */
  title: string;
  /** One concrete line. What the user actually does there, not a slogan. */
  description: string;
  /** Icon used by the fallback plate, and as the art's accessible stand-in. */
  Icon: React.ElementType;
  /**
   * Finished Academy plate for this mode, when one exists.
   *
   * These are individually cut and vary in size and aspect ratio (251×280,
   * 224×256, …) with the mode name engraved into the artwork itself, so the
   * card renders them with object-contain and does NOT print the title again
   * underneath. Modes without a plate get a composed fallback in the same
   * visual language — see AcademyModeCard.
   */
  art?: string;
}

export const ACADEMY_MODES: AcademyMode[] = [
  {
    id: "leaguecraft",
    title: "Leaguecraft",
    description:
      "Quiz yourself on champions, items and abilities — then take it into ranked duels.",
    Icon: BrainCircuit,
    art: leaguecraftArt,
  },
  {
    id: "combat-lab",
    title: "Combat Lab",
    description:
      "Simulate real fights. Pick two champions, build them, and see what actually wins.",
    Icon: Swords,
  },
  {
    id: "stat-check",
    title: "Stat Check",
    description: "Head-to-head build duels against the clock. Trust your game knowledge.",
    Icon: Layers,
  },
  {
    id: "archives",
    title: "Mogzy Archives",
    description: "Every champion, ability and patch change, documented and searchable.",
    Icon: FileText,
    art: archivesArt,
  },
];
