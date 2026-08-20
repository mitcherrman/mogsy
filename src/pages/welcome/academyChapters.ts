// ---------------------------------------------------------------------------
// Academy Welcome (HI1-C) — the cinematic sequence's content.
//
// The introduction is one continuous scene: a tome opens and writes itself, a
// chapter at a time. This module is the SCRIPT for that scene — nothing here
// knows about timing, animation or layout, which live in useRevealSequence and
// AcademyTome respectively. Rewriting the copy should never require touching a
// component.
//
// SHAPE OF A CHAPTER. Every chapter is the same object, and the tome renders
// them all identically: an illustration inked onto the left page, and words
// written onto the right. Uniformity is the point — HI1-2 learned that any
// layout which lets chapters differ immediately exposes which ones have
// finished artwork and which do not. Here the art gap is absorbed by the
// composition rather than displayed by it.
//
// WHAT IS IN THE SEQUENCE, AND WHY.
//
//   1 Arrival        — what Mogzy is, in one breath.
//   2 Leaguecraft    — knowledge, quizzes, mastery, Ranked. Stat Check is folded
//                      in here as one of its ways to test yourself rather than
//                      taking a chapter: it is a knowledge duel, it lives under
//                      the same idea, and a sixth beat would work against the
//                      pacing this redesign exists to fix.
//   3 Combat Lab     — simulate fights, compare builds. Named Combat Lab because
//                      that is what the hub, the route and the product call it;
//                      the chapter's own words carry the "combat sim" framing.
//   4 Pro Data       — the data/graphs beat, GROUNDED. There is no user-facing
//                      "League Graphs" product in this repo: GRAPH1 is a dev
//                      route (/dev/graph1) and its exports are a broadcast
//                      pipeline, not a destination. What genuinely ships is the
//                      pro-match explorer under /lol/docs/pro (champions,
//                      players, teams, seasons) and the live esports viewer at
//                      /esports/live. The chapter promises those, so a visitor
//                      who goes looking for it finds it.
//   5 Archives       — the reference shelf: Mogzy Archives plus Patch Reports,
//                      bridged into one "look it up" idea because that is how a
//                      newcomer experiences them.
//   6 Beginning      — the two real exits. Not a chapter of copy; the finale.
//
// NOT INCLUDED — Quiz History and Meta Reflex. Both are real hub destinations.
// Neither belongs in a first-run introduction: history is empty on a first
// visit, and Meta Reflex is a fifth idea competing with four stronger ones. The
// hub is one screen away and lists everything.
// ---------------------------------------------------------------------------

/**
 * How a chapter's illustration is drawn onto the page.
 *
 * A closed union rather than "an image URL", because these are genuinely
 * different objects — two are painted Academy plates, one is a staged duel, one
 * is a chart inked stroke by stroke, one is the mascot. Every one of them is
 * rendered inside the same inked-plate treatment (see ChapterPlate), which is
 * what keeps them at equal visual weight despite the uneven source art.
 */
export type ChapterArt =
  /** A painted Academy plate, framed as a medallion pressed into the page. */
  | { kind: "plate"; src: string; emblemFocus: string }
  /** Two combatants and a damage readout — what the Combat Lab stages. */
  | { kind: "duel" }
  /** A chart drawn stroke by stroke, as if ruled onto the page in ink. */
  | { kind: "chart" }
  /**
   * Mogzy himself. `entrance` gives him the magical materialization — the
   * gathering glow, motes and condensing silhouette reserved for the moment
   * the visitor first meets him. The finale reuses the mascot without it: an
   * apparition is an arrival, and he has already arrived.
   */
  | { kind: "mascot"; entrance?: boolean };

export interface AcademyChapter {
  /** Stable id — React key and test hook. Never displayed. */
  id: string;
  /** Small caps line above the heading. Sets the chapter, not the topic. */
  eyebrow: string;
  /** The chapter heading. Must match how the hub names the destination. */
  heading: string;
  /**
   * Body copy, one short paragraph per entry. Two at most, and the second is
   * always the shorter — this is a book being written, not a landing page.
   */
  lines: string[];
  /** Three words at most each. Answers "what is actually in there?". */
  marginalia?: string[];
  art: ChapterArt;
  /**
   * The finale renders the two real exits instead of body copy, and the
   * sequence never auto-advances past it.
   */
  finale?: boolean;
}

import leaguecraftArt from "@/academy/leaguecraft-studies.png";
import archivesArt from "@/academy/mogzy-archives.png";

export const ACADEMY_CHAPTERS: AcademyChapter[] = [
  {
    id: "arrival",
    eyebrow: "The Academy",
    heading: "Welcome, Summoner",
    lines: [
      "This is Mogzy's Academy — a place to learn League, test what you already know, and take apart the systems underneath it.",
      "Let me show you what is here.",
    ],
    art: { kind: "mascot", entrance: true },
  },
  {
    id: "leaguecraft",
    eyebrow: "Chapter One",
    heading: "Leaguecraft",
    lines: [
      "Champions, items, abilities, numbers. Quizzes that teach as you play, mastery tracks that go deeper, and Ranked duels when you want it to count.",
      "Stat Check lives here too — pure knowledge, head to head.",
    ],
    marginalia: ["Quizzes", "Mastery", "Ranked", "Stat Check"],
    // 251×280 plate; the engraved name sits in the bottom fifth, so the crop
    // frames the emblem and pushes it out. See ChapterPlate for why.
    art: { kind: "plate", src: leaguecraftArt, emblemFocus: "center 32%" },
  },
  {
    id: "combat-lab",
    eyebrow: "Chapter Two",
    heading: "Combat Lab",
    lines: [
      "Put two champions in a room and simulate the fight. Build them however you like, run it, and read exactly where every point of damage came from.",
      "Real formulas, not estimates.",
    ],
    marginalia: ["Any matchup", "Any build", "Full breakdown"],
    art: { kind: "duel" },
  },
  {
    id: "pro-data",
    eyebrow: "Chapter Three",
    heading: "Pro Data & Esports",
    lines: [
      "Millions of professional games, charted. Compare champions across seasons, follow players and teams, and watch patterns move patch by patch.",
      "Live esports results land here as they happen.",
    ],
    marginalia: ["Champions", "Players & teams", "Live results"],
    art: { kind: "chart" },
  },
  {
    id: "archives",
    eyebrow: "Chapter Four",
    heading: "Archives & Patch Reports",
    lines: [
      "The reference shelf. Every champion, ability and cooldown written down — and every patch, read through and explained rather than pasted.",
      "For when you need to look something up.",
    ],
    marginalia: ["Champions", "Abilities", "Patch history"],
    // 224×256 plate; same engraved-name band as Leaguecraft.
    art: { kind: "plate", src: archivesArt, emblemFocus: "center 34%" },
  },
  {
    id: "beginning",
    eyebrow: "The Last Page",
    heading: "How would you like to begin?",
    lines: [],
    art: { kind: "mascot" },
    finale: true,
  },
];

/** Index of the finale. Nothing auto-advances past it. */
export const FINALE_INDEX = ACADEMY_CHAPTERS.findIndex((c) => c.finale);
