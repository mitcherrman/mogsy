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
// WHAT IS IN THE SEQUENCE, AND WHY (HI1-C5 — five spreads, down from six).
//
//   1 Arrival        — what Mogzy is, in one breath.
//   2 Registration   — a name and a rank, written into the register. The one
//                      interactive spread, and the reason the introduction now
//                      hands the product a person rather than a guest. It sits
//                      second on purpose: after the visitor knows who is
//                      speaking to them, and before any of the tour, so that
//                      everything after it is addressed to someone.
//   3 Leaguecraft    — knowledge, quizzes, mastery, Ranked. Stat Check is folded
//                      in here as one of its ways to test yourself rather than
//                      taking a chapter: it is a knowledge duel, it lives under
//                      the same idea, and an extra beat would work against the
//                      pacing this redesign exists to fix.
//   4 Combat Lab     — simulate fights, compare builds. Named Combat Lab because
//                      that is what the hub, the route and the product call it;
//                      the chapter's own words carry the "combat sim" framing.
//   5 The record     — Pro Data, Esports, the Archives and Patch Reports as ONE
//                      spread, and the last page. See below.
//
// WHY THE LAST TWO INFORMATIONAL CHAPTERS ARE NOW ONE. Pro Data and Archives
// were separate spreads reading, in effect, "here are the numbers" and "here is
// where they are written down" — two beats for one idea, arriving at the point
// in the sequence where a reader's patience is thinnest. Merged, the spread
// splits the idea across the book's own two pages instead of across two page
// turns: the LEFT page is the live, statistical, competitive side (a triangular
// composition of three ink modules — see ChapterPlate), and the RIGHT page is
// the reference side, set as a ruled docket of things you can look up. Adding
// a page to the register cost a beat; merging these two gives back more than
// one, and the finale's exits move onto this spread so the sequence ends on a
// page that says something rather than on a page that only asks.
//
// NOT INCLUDED — Quiz History and Meta Reflex. Both are real hub destinations.
// Neither belongs in a first-run introduction: history is empty on a first
// visit, and Meta Reflex is another idea competing with stronger ones. The hub
// is one screen away and lists everything.
// ---------------------------------------------------------------------------

/**
 * How a chapter's illustration is drawn onto the page.
 *
 * A closed union rather than "an image URL", because these are genuinely
 * different objects — a painted Academy plate, a staged duel, the mascot, a
 * register card that fills in as the visitor types, and a triangular data
 * composition drawn stroke by stroke. Every one of them is rendered inside the
 * same inked-plate treatment (see ChapterPlate), which is what keeps them at
 * equal visual weight despite the uneven source art.
 */
export type ChapterArt =
  /** A painted Academy plate, framed as a medallion pressed into the page. */
  | { kind: "plate"; src: string; emblemFocus: string }
  /** Two combatants and a damage readout — what the Combat Lab stages. */
  | { kind: "duel" }
  /**
   * The Academy register: a card inked onto the page that fills in with the
   * visitor's own name and rank as they type them, and is sealed when both are
   * there. The one illustration that is a mirror rather than a picture.
   */
  | { kind: "register" }
  /**
   * Three data modules composed as a triangle — a strong apex over two
   * supporting studies, with the triangle itself ruled in behind them. Drawn in
   * ink rather than photographed, for the reason ChapterPlate's ChartArt gives:
   * this side of the product has no source artwork, and a fabricated screenshot
   * of a real surface is worse than an honest diagram.
   */
  | { kind: "triptych" }
  /**
   * Mogzy himself. `entrance` gives him the magical materialization — the
   * gathering glow, motes and condensing silhouette reserved for the moment
   * the visitor first meets him.
   */
  | { kind: "mascot"; entrance?: boolean };

/**
 * One line of the reference docket on the last spread's right page.
 *
 * Deliberately a label and a note rather than a link: the introduction promises
 * destinations, it does not navigate to them, and a page full of live links at
 * the moment of the final choice would compete with that choice.
 */
export interface DocketEntry {
  /** What it is called in the hub. Never invent a name here. */
  label: string;
  /** Four or five words on what is actually in it. */
  note: string;
}

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
  /**
   * The ruled reference block on the last spread's right page. Occupies the
   * same reveal slot marginalia would, and no chapter has both — it IS the
   * marginalia of a page whose subject is documents.
   */
  docket?: DocketEntry[];
  art: ChapterArt;
  /**
   * This chapter's forward control is a FORM, not the tome's Next. The
   * sequence's own advance is suppressed on it (see AcademyWelcomePage), so a
   * click on the scene, the arrow keys or an impatient tap can finish the
   * writing but can never turn past the register without answering it. The
   * rail's "Skip to the Academy" is untouched and remains a real exit from
   * this page as from every other — required is not the same as trapped.
   */
  registration?: boolean;
  /**
   * The last page. Renders the two real exits after its copy, and the sequence
   * never auto-advances past it.
   */
  finale?: boolean;
}

import leaguecraftArt from "@/academy/leaguecraft-studies.png";

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
    // The tone line is the HEADING, not the body: it is the shortest, most
    // human sentence in the introduction and it earns the largest type on the
    // page. "Academy Registration" then does what every other chapter's eyebrow
    // does — it names the chapter in gilt small caps above it.
    id: "registration",
    eyebrow: "Academy Registration",
    heading: "Every student needs a name.",
    lines: [
      "Choose what the Academy will call you, and tell us roughly where you play.",
    ],
    art: { kind: "register" },
    registration: true,
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
    // The merged final spread. Its two paragraphs are addressed to the two
    // pages in order: the first to the triangular data composition on the left,
    // the second to the docket on the right, so the reader's eye is sent across
    // the gutter by the copy rather than left to find its own way.
    //
    // Everything named here exists and is reachable: /lol/docs/pro (champions,
    // players, teams, seasons), /esports/live, /lol/docs ("Mogzy Archives" in
    // the hub) and /lol/patch-reports. GRAPH1 remains a dev route and is still
    // not promised.
    id: "the-record",
    eyebrow: "Chapter Three",
    heading: "Pro Data & the Archives",
    // Shorter than either chapter it replaces, deliberately. This page carries
    // a spread's worth of writing AND the two exits, and the copy is the only
    // part of that a rewrite can shorten — so it is written to the space rather
    // than trimmed to fit it afterwards.
    lines: [
      "Millions of professional games, charted — champions across seasons, players, teams, and live results as they land.",
      "Beside them, the reference shelf: every champion written down, every patch read through.",
    ],
    docket: [
      { label: "Mogzy Archives", note: "every champion, written down" },
      { label: "Abilities & items", note: "ratios, cooldowns, costs" },
      { label: "Patch reports", note: "each patch, read through" },
    ],
    art: { kind: "triptych" },
    finale: true,
  },
];

/** Index of the finale. Nothing auto-advances past it. */
export const FINALE_INDEX = ACADEMY_CHAPTERS.findIndex((c) => c.finale);

/** Index of the register. The one spread the sequence cannot turn by itself. */
export const REGISTRATION_INDEX = ACADEMY_CHAPTERS.findIndex((c) => c.registration);
