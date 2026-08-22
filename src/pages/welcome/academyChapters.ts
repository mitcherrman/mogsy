// ---------------------------------------------------------------------------
// Academy Welcome (HI1) — the cinematic sequence's content.
//
// The introduction is one continuous scene: a tome opens and reveals itself, a
// chapter at a time. This module is the SCRIPT for that scene — nothing here
// knows about timing, animation or layout, which live in cadence.ts,
// useRevealSequence and AcademyTome respectively. Rewriting the copy should
// never require touching a component.
//
// SHAPE OF A CHAPTER. Every chapter is the same object, and the tome renders
// them all identically: an illustration on the left page, words on the right,
// and — where the script asks for one — a single champion drawing faded into
// the paper behind either. Uniformity is the point: HI1-2 learned that any
// layout which lets chapters differ immediately exposes which ones have
// finished artwork and which do not.
//
// THE COPY IS SHORT ON PURPOSE (HI1 rewrite). Every chapter below was cut to
// the fewest words that still say the thing. The earlier script explained the
// product; this one introduces it and gets out of the way, because the page a
// visitor is fastest to leave is the page that talks longest. A chapter is a
// heading and two or three SHORT blocks, and the reveal releases those blocks
// whole rather than word by word (see cadence.ts).
//
// WHAT IS IN THE SEQUENCE, AND WHY — five spreads.
//
//   1 Arrival        — what this is, in two lines.
//   2 Registration   — a name and a rank, written into the register. The one
//                      interactive spread. It sits second on purpose: after the
//                      visitor knows who is speaking to them, and before any of
//                      the tour, so everything after it is addressed to someone.
//   3 Leaguecraft    — the quizzes.
//   4 Combat Lab     — the simulator.
//   5 The library    — everything Mogzy holds, and the two exits. The last
//                      page, and the only one that both says something and asks
//                      something.
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
 * register card that fills in as the visitor types, and a chart drawn stroke by
 * stroke. Every one of them is rendered inside the same inked-plate treatment
 * (see ChapterPlate), which is what keeps them at equal visual weight despite
 * the uneven source art.
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
   * A chart drawn stroke by stroke, as if ruled onto the page in ink — the
   * last spread's single visual. Restored verbatim from the pre-consolidation
   * Pro Data chapter (75d60da9); see ChapterPlate's ChartArt for why this side
   * of the product is DRAWN and never photographed.
   */
  | { kind: "chart" }
  /**
   * Mogzy himself. `entrance` gives him the magical materialization — the
   * gathering glow, motes and condensing silhouette reserved for the moment
   * the visitor first meets him.
   */
  | { kind: "mascot"; entrance?: boolean };

/**
 * A champion drawing faded into one page of the spread.
 *
 * ONE PER PAGE, NEVER TWO. The whole effect is "there is a drawing in this
 * paper"; two of them on one page is a collage, and a collage behind running
 * text is unreadable. The type enforces it structurally — a page slot holds a
 * single descriptor — and a test holds it at the rendered DOM as well.
 *
 * THE FILES ARE USED AS THEY ARE. `/images/{champion}.png` are the approved
 * pencil drawings: line art on a transparent ground, which is already the
 * register the rest of this book is drawn in. Nothing is masked, engraved,
 * recoloured or derived from splash art — the page prints them faintly and
 * lets the page box crop them. `strength` is the layer's opacity, and it is
 * lower behind running text than behind an illustration for the obvious
 * reason; see the contrast note in index.css.
 */
export interface ChampionBackdrop {
  /** Public path of the drawing. Served as-is; no derivative, no processing. */
  src: string;
  /** Layer opacity. Text pages stay at or below 0.15 — see the CSS note. */
  strength: number;
  /** `object-position` for the crop. The page box does the cropping. */
  focus?: string;
}

/** The champion drawings this introduction is allowed to print. */
export const CHAMPION_ART = {
  ahri: "/images/ahri.png",
  jinx: "/images/jinx.png",
  yasuo: "/images/yasuo.png",
} as const;

/**
 * The champion drawings on a chapter's two pages.
 *
 * `verso` is the illustration page (left on a spread), `recto` is the writing
 * page (right). A phone reads one sheet rather than a spread, so it prints
 * whichever of the two the chapter defines — one page, one champion, at every
 * viewport. See AcademyTome.
 */
export interface ChapterChampions {
  verso?: ChampionBackdrop;
  recto?: ChampionBackdrop;
}

export interface AcademyChapter {
  /** Stable id — React key and test hook. Never displayed. */
  id: string;
  /** Small caps line above the heading. Sets the chapter, not the topic. */
  eyebrow: string;
  /** The chapter heading. Must match how the hub names the destination. */
  heading: string;
  /**
   * The body, one BLOCK per entry — and a block is what the reveal releases
   * whole. Three at most, and short: this is a book being read aloud, not a
   * landing page.
   */
  lines: string[];
  art: ChapterArt;
  /** At most one faded champion drawing per page. Usually absent. */
  champions?: ChapterChampions;
  /**
   * This chapter's forward control is a FORM, not the tome's Next. The
   * sequence's own advance is suppressed on it (see AcademyWelcomePage), so a
   * click on the scene, the arrow keys or an impatient tap can finish the
   * reveal but can never turn past the register without answering it. The
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
      "Welcome to Mogzy's Academy.",
      "There's always more to learn about League. Let's see how far you can go.",
    ],
    art: { kind: "mascot", entrance: true },
    // The opening spread, and the only one with a champion on BOTH pages: Ahri
    // stands in the paper behind Mogzy, Jinx behind the words. He is still the
    // subject — his page's drawing is the fainter of the two under him and he
    // is drawn in full colour on top of it, while hers sits under running text
    // at the strength the contrast floor allows.
    champions: {
      verso: { src: CHAMPION_ART.ahri, strength: 0.16, focus: "center 34%" },
      recto: { src: CHAMPION_ART.jinx, strength: 0.13, focus: "center 38%" },
    },
  },
  {
    // The tone line is the HEADING, not the body: it is the shortest, most
    // human sentence in the introduction and it earns the largest type on the
    // page. "Academy Registration" then does what every other chapter's eyebrow
    // does — it names the chapter in gilt small caps above it.
    id: "registration",
    eyebrow: "Academy Registration",
    heading: "Every student needs a name.",
    lines: ["Choose your Academy Username.", "Select your League of Legends Rank."],
    art: { kind: "register" },
    registration: true,
  },
  {
    id: "leaguecraft",
    eyebrow: "Chapter One",
    heading: "Leaguecraft",
    lines: [
      "Quizzes designed to grow your game knowledge and test your limits.",
      "Prove you're the smartest.",
    ],
    // 251×280 plate; the engraved name sits in the bottom fifth, so the crop
    // frames the emblem and pushes it out. See ChapterPlate for why.
    art: { kind: "plate", src: leaguecraftArt, emblemFocus: "center 32%" },
  },
  {
    id: "combat-lab",
    eyebrow: "Chapter Two",
    heading: "Combat Lab",
    lines: ["Simulate any matchup.", "Calculate any situation.", "Master every detail of the Rift."],
    art: { kind: "duel" },
  },
  {
    // The last spread, and the one page in the book that is COMPOSED rather
    // than templated — see FinaleSpread for the whole of it. Its left page is
    // the title, what the library holds (with the four things it holds drawn
    // under the sentence that names them) and the restored Pro Data graph; its
    // right page is one line, one picture of Mogzy with a Teemo emote, and the
    // two exits. The copy below therefore crosses the gutter: blocks one and
    // two are written on the left page, block three opens the right one.
    //
    // Everything the copy names exists and is reachable: /lol/docs/pro
    // (champions, players, teams, seasons), /esports/live, /lol/docs and
    // /lol/patch-reports. GRAPH1 remains a dev route and is not promised.
    id: "library",
    eyebrow: "Chapter Three",
    heading: "The Complete League Library",
    lines: [
      "Mogzy brings together every champion, item, rune, system, and interaction in League of Legends.",
      "Explore pro data. Learn the history of League esports and your favorite players.",
      "Discover insights. Share what you find.",
    ],
    art: { kind: "chart" },
    // NO CHAMPION IN THE PAPER, on either page — the one spread in the book
    // that prints none. The left page already carries a heading, two
    // paragraphs, four drawn symbols and the animated chart; the right page's
    // entire job is to hold ONE picture. A faint figure behind either would be
    // a fifth thing competing on a page that has run out of room to compete on,
    // and the closing picture has to be the thing the eye lands on.
    finale: true,
  },
];

/** Index of the finale. Nothing auto-advances past it. */
export const FINALE_INDEX = ACADEMY_CHAPTERS.findIndex((c) => c.finale);

/** Index of the register. The one spread the sequence cannot turn by itself. */
export const REGISTRATION_INDEX = ACADEMY_CHAPTERS.findIndex((c) => c.registration);
