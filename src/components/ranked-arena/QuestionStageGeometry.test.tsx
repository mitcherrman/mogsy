/**
 * THE CANONICAL QUESTION STAGE — the geometry contract (ARENA1 Phase 1).
 *
 * THE RULE THIS FILE DEFENDS
 * ──────────────────────────
 * Two consecutive rounds of the same match occupy the SAME physical space. A
 * one-line prompt with a 72px plate and a calculation prompt with a 256px
 * cinematic card produce one card height, one answer-tablet origin and one
 * round-timeline coordinate. Before this phase the card ran 272px to 526px at
 * 1440x900 and the timeline moved 186px between consecutive rounds.
 *
 * WHY IT IS WRITTEN LIKE THIS
 * ───────────────────────────
 * jsdom performs no layout, so there is no honest way to assert a pixel here —
 * and asserting a class name would be worthless, because a class name is not
 * what keeps the timeline still. What actually keeps it still is an ARITHMETIC
 * IDENTITY in one CSS block:
 *
 *     stage height  ==  border + padding + media + gap + prompt + gap + answers
 *
 * So this file parses that block out of `index.css`, resolves the tokens at
 * every breakpoint, and evaluates both sides. A future edit that grows one
 * reserve without paying for it in the total — the exact mistake that would let
 * the timeline start moving again — makes the identity false and fails here.
 *
 * Alongside it: the reserves are checked against the tallest content of each
 * kind MEASURED in a real browser on the shipped corpus (the table below), the
 * surface is checked to still emit the three regions the reserves land on, and
 * the mode layer is checked to declare no geometry of its own.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import * as RA7 from "@/lib/question-surface/familyLayoutFixtures";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";
import { CanonicalArena } from "./CanonicalArena";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import { dailyArenaView } from "@/pages/quiz-daily-challenge/dailyArenaView";
import { parseRun, rawRun } from "@/pages/quiz-daily-challenge/testFixtures";
import {
  metaReflexCards, metaReflexSegmentMeta, metaReflexState,
  privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";

const ROOT = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const CSS = read("index.css");

// ───────────────────────────────────────────────────────────────────────────
// The CSS block, parsed.
// ───────────────────────────────────────────────────────────────────────────

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Every `.ranked-question-stage { … }` body, with the `min-width` that guards
 *  it (0 for the unguarded one), in source order. */
function stageRules(): { minWidth: number; body: string }[] {
  const css = stripComments(CSS);
  const out: { minWidth: number; body: string }[] = [];
  const re = /(?:@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*)?\.ranked-question-stage\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out.push({ minWidth: m[1] ? Number(m[1]) : 0, body: m[2] });
  }
  return out;
}

/** The tokens in force at `width`, applied in source order the way the cascade
 *  would apply them. */
function tokensAt(
  width: number, viewportH: number = 1600, dock = false,
): Record<string, string> {
  // `--qs-avail` is inherited from `.ranked-shell`, not declared here, and it
  // is what the media reserve answers to. Supplying it is what lets this file
  // ask the question the RM1 hotfix exists for: does the Match Shell fit?
  const tokens: Record<string, string> = {
    "--qs-avail": `${viewportH - 4 - chromeHeightPx(dock)}px`,
  };
  for (const rule of stageRules()) {
    if (rule.minWidth > width) continue;
    for (const decl of rule.body.split(";")) {
      const [prop, value] = decl.split(":").map((p) => p?.trim());
      if (prop?.startsWith("--qs-")) tokens[prop] = value;
    }
  }
  return tokens;
}

/** The `min-height: calc(…)` expression, which lives on the unguarded rule. */
function stageExpression(): string {
  const base = stageRules().find((r) => r.minWidth === 0);
  const m = /min-height:\s*calc\(([\s\S]*?)\);/.exec(base?.body ?? "");
  if (!m) throw new Error("`.ranked-question-stage` declares no min-height calc()");
  return m[1];
}

/**
 * A LENGTH EVALUATOR, not a regex.
 *
 * The stage's tokens stopped being sums of constants when the RM1 hotfix gave
 * the media reserve a viewport budget to answer to: it is now
 * `clamp(9rem, <what the viewport can pay>, 16rem)`. A parser that only knew
 * how to add rem terms would have had to be replaced by a weaker assertion,
 * and the arithmetic identity below is the whole value of this file — so the
 * evaluator grew instead. It understands `calc`/`min`/`max`/`clamp`, `+ - * /`,
 * `rem` and `px`, and `var(--name, fallback)` resolved from `tokens`.
 */
function px(expression: string, tokens: Record<string, string>): number {
  let depth = 0;
  const resolve = (expr: string): string => {
    if (depth++ > 32) throw new Error(`var() cycle in "${expression}"`);
    const out = expr.replace(
      /var\(\s*(--[a-z-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g,
      (_all, name: string, fallback: string | undefined) => {
        const v = tokens[name] ?? fallback;
        if (v === undefined) throw new Error(`unresolved ${name} in "${expression}"`);
        return `(${resolve(v)})`;
      },
    );
    depth--;
    return out;
  };

  // A tiny recursive-descent pass over the resolved string: the INNERMOST
  // bracket group each time round, function or plain, reduced to a px number
  // and substituted back. That is what keeps nesting honest — an earlier draft
  // stripped plain parentheses first and quietly tore the `(…)` off a
  // `calc(…)` it had not looked at yet.
  const reduce = (src: string): number => {
    let s = src.trim();
    for (;;) {
      const m = /(calc|min|max|clamp)?\(([^()]*)\)/.exec(s);
      if (!m) break;
      const fn = m[1];
      const args = m[2].split(",").map((a) => plain(a));
      const value = !fn || fn === "calc" ? args[0]
        : fn === "min" ? Math.min(...args)
        : fn === "max" ? Math.max(...args)
        : Math.min(Math.max(args[0], args[1]), args[2]); // clamp(min, val, max)
      s = s.slice(0, m.index) + `${value}px` + s.slice(m.index + m[0].length);
    }
    return plain(s);
  };

  /** Infix `+`/`-` over bracket-free terms. */
  const plain = (src: string): number => {
    // Split on the `+`/`-` that separate terms. Never a sign inside a number:
    // a separator is spaced on both sides, and the stylesheet writes it so.
    const terms = src.trim().split(/(?<=[\dA-Za-z%])\s+([+-])\s+/);
    let total = term(terms[0]);
    for (let i = 1; i < terms.length; i += 2) {
      total += terms[i] === "-" ? -term(terms[i + 1]) : term(terms[i + 1]);
    }
    return total;
  };

  const term = (src: string): number => {
    const t = src.trim();
    const mul = /^(.+?)\s*([*/])\s*([\d.]+)$/.exec(t);
    if (mul) {
      const base = term(mul[1]);
      return mul[2] === "*" ? base * Number(mul[3]) : base / Number(mul[3]);
    }
    const rem = /^(-?[\d.]+)rem$/.exec(t);
    if (rem) return Number(rem[1]) * 16;
    const pxm = /^(-?[\d.]+)px$/.exec(t);
    if (pxm) return Number(pxm[1]);
    const bare = /^(-?[\d.]+)$/.exec(t);
    if (bare) return Number(bare[1]);
    throw new Error(`unexpected term "${t}" in the stage expression`);
  };

  return reduce(resolve(expression));
}

/**
 * THE ARENA'S CHROME BUDGET — every band of the Match Shell that is NOT the
 * Question Stage, as `.ranked-shell` declares it. Parsed rather than restated,
 * because the point of the token is that one place says what the chrome costs.
 *
 * `dock` is the ability dock, the one band that is not always mounted: the
 * arena renders it only for a mode that publishes an `abilityHud`, and states
 * which it is on `data-ability-dock`. A budget that charged for it either way
 * was wrong for whichever match it guessed against.
 */
function chromeHeightPx(dock = false): number {
  const css = stripComments(CSS);
  const m = /--ranked-chrome-h:\s*(calc\([\s\S]*?\));/.exec(css);
  if (!m) throw new Error("`.ranked-shell` declares no --ranked-chrome-h");
  const base = /\.ranked-shell\s*\{[^}]*?--ranked-dock-h:\s*([^;]+);/.exec(css);
  const on = /\.ranked-shell\[data-ability-dock="true"\]\s*\{\s*--ranked-dock-h:\s*([^;]+);/
    .exec(css);
  if (!base || !on) throw new Error("the ability dock's budget term is not declared");
  return px(m[1], { "--ranked-dock-h": dock ? on[1] : base[1] });
}

/**
 * The height the stage is offered on a viewport `viewportH` tall.
 * `--ranked-stage-h` is `100dvh - 0.25rem - --bottom-nav-clearance`, and the
 * clearance is `0px` on this route.
 */
const availAt = (viewportH: number, dock = false) =>
  viewportH - 4 - chromeHeightPx(dock);

const TALL = 1600;

const stageHeightAt = (width: number, viewportH: number = TALL, dock = false) =>
  px(stageExpression(), tokensAt(width, viewportH, dock));
const tokenPx = (width: number, name: string, viewportH: number = TALL, dock = false) => {
  const v = tokensAt(width, viewportH, dock)[name];
  return v === undefined ? null : px(v, tokensAt(width, viewportH, dock));
};

// ───────────────────────────────────────────────────────────────────────────
// What the shipped corpus actually measures.
//
// Recorded from the real arena in a real browser (Chromium) over the shipped
// question bank and the shipped Daily fixtures — the compact plate, the family
// band, the cinematic Broadcast card, one-line to five-line prompts, and answer
// tablets with and without option media. These are the numbers the reserves
// exist to cover, and they are what makes the reserve assertions below a real
// check rather than a restatement of the CSS.
// ───────────────────────────────────────────────────────────────────────────
const MEASURED = {
  1024: { band: 199, prompt: 149, answers: 136, stage: 610 },
  1280: { band: 256, prompt: 124, answers: 118, stage: 566 },
  1512: { band: 256, prompt: 135, answers: 118, stage: 578 },
} as const;

describe("the stage height IS the sum of its reserved regions", () => {
  it.each(Object.keys(MEASURED).map(Number))(
    "at %ipx the declared stage equals border + padding + the three reserves",
    (width) => {
      const media = tokenPx(width, "--qs-media-h")!;
      const prompt = tokenPx(width, "--qs-prompt-h")!;
      const answers = tokenPx(width, "--qs-answers-h")!;
      // 2px is `.ranked-panel`'s border (min-height is a border-box length
      // here); 40px is `sm:p-5` top and bottom; 12px is each `gap-3`.
      expect(
        stageHeightAt(width),
        "the stage height and its three regions have drifted apart — one of"
        + " them was changed without the other, which is what lets a taller"
        + " question start pushing the timeline down again",
      ).toBe(2 + 40 + media + 12 + prompt + 12 + answers);
    },
  );

  it("reserves nothing at all below lg, so the narrow layout is intrinsic", () => {
    // The stacked layout puts the answers in one column and rewraps every
    // prompt, so a desktop-derived reserve there would be a large empty box on
    // a phone. No token is set, and what is left is the card's own chrome.
    expect(tokenPx(500, "--qs-media-h")).toBeNull();
    expect(tokenPx(500, "--qs-prompt-h")).toBeNull();
    expect(tokenPx(500, "--qs-answers-h")).toBeNull();
    expect(stageHeightAt(500)).toBe(2 + 40 + 12 + 12);
  });
});

describe("every reserve covers the tallest content of its kind", () => {
  it.each(Object.entries(MEASURED))(
    "at %spx no measured band, prompt or answer block overflows its region",
    (width, measured) => {
      const w = Number(width);
      expect(tokenPx(w, "--qs-media-h")!,
        "a cinematic band is taller than the media region, so a media round"
        + " would grow the card past the stage").toBeGreaterThanOrEqual(measured.band);
      expect(tokenPx(w, "--qs-prompt-h")!,
        "the longest prompt in the bank is taller than the prompt region")
        .toBeGreaterThanOrEqual(measured.prompt);
      expect(tokenPx(w, "--qs-answers-h")!,
        "an ordinary answer block is taller than the answer region, which is"
        + " the reserve that pins the tablets' origin")
        .toBeGreaterThanOrEqual(measured.answers);
    },
  );

  it("matches the stage height measured in the browser", () => {
    for (const [width, measured] of Object.entries(MEASURED)) {
      expect(stageHeightAt(Number(width)), `stage at ${width}px`).toBe(measured.stage);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RM1 HOTFIX — THE MATCH SHELL FITS ONE VIEWPORT.
//
// A Ranked match must never require document scrolling. That is not a property
// of the Question Stage alone: it is the Stage PLUS every fixed band around it
// — the Match Header, the arena grid's gaps, the HUD row and the Module Rail —
// measured against the viewport. `--ranked-chrome-h` is where the arena writes
// down what that chrome costs, and the stage's media reserve is what answers
// to what is left. This block asserts the two actually add up, which is the
// arithmetic nobody was doing when the shell shipped ~900px tall.
// ───────────────────────────────────────────────────────────────────────────
describe("the whole Match Shell fits the viewport it is given", () => {
  /** Every band of the shell, at `width` x `viewportH`. */
  const shellHeight = (width: number, viewportH: number, dock = false) =>
    chromeHeightPx(dock) + stageHeightAt(width, viewportH, dock);

  /**
   * THE SUPPORTED RANGE, and it is deliberately a GRID rather than a handful
   * of laptops. Picking a few popular resolutions is how you end up with a
   * layout tuned to those and broken between them — every `lg` width the
   * arena supports has to hold, at every height a desktop or tablet browser
   * actually reports.
   *
   * Width starts at 1024 because that is where the arena enters its `lg`
   * three-column layout; below it the columns stack deliberately into a page
   * taller than any phone, and a fit rule there would be a cap on a layout
   * meant to scroll.
   */
  const WIDTHS = [1024, 1152, 1280, 1366, 1440, 1512, 1680, 1920, 2560];
  const POINTS_HEIGHTS = [660, 678, 700, 720, 768, 800, 864, 900, 1080, 1440];
  const DOCK_HEIGHTS = [746, 768, 800, 864, 900, 1080, 1440];

  describe("a Ranked points match — the RM1 shell, no ability dock", () => {
    it.each(WIDTHS)("at %ipx wide, every supported height fits", (width) => {
      for (const viewportH of POINTS_HEIGHTS) {
        expect(
          shellHeight(width, viewportH),
          `at ${width}x${viewportH} the Match Header, both Player Columns, the`
          + " Question Stage and the Module Rail no longer fit one viewport —"
          + " a Ranked match has started scrolling the document again",
        ).toBeLessThanOrEqual(viewportH - 4);
      }
    });
  });

  describe("a progression match — the same shell plus the ability dock", () => {
    it.each(WIDTHS)("at %ipx wide, every supported height fits", (width) => {
      for (const viewportH of DOCK_HEIGHTS) {
        expect(
          shellHeight(width, viewportH, true),
          `at ${width}x${viewportH} with the ability dock mounted the shell`
          + " overflows — the dock's term in --ranked-chrome-h and what the"
          + " stage yields have drifted apart",
        ).toBeLessThanOrEqual(viewportH - 4);
      }
    });
  });

  it("charges for the ability dock only when it is actually mounted", () => {
    // The bug this closes: the budget billed a Ranked points match 82px for a
    // dock that is not on its screen, which is most of why the shell still did
    // not fit at 1024. The arena states the fact on `data-ability-dock`.
    expect(chromeHeightPx(true) - chromeHeightPx(false)).toBe(82);
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toContain('data-ability-dock={abilityHud ? "true" : "false"}');
  });

  it("spends the whole viewport and no more — the stage takes the surplus", () => {
    // Not merely "fits". The stage is always the SMALLER of what it wants and
    // what is left: below the cross-over it is exactly the remaining height,
    // so the arena is as large as the screen allows and no question room is
    // left unspent; above it the stage is at its full declared size and the
    // surplus goes to the flanks, which is the pre-existing behaviour.
    for (const width of WIDTHS) {
      const full = stageHeightAt(width, TALL);
      for (const viewportH of [660, 720, 800, 864, 1080]) {
        expect(stageHeightAt(width, viewportH), `${width}x${viewportH}`)
          .toBe(Math.min(full, availAt(viewportH)));
      }
    }
  });

  it("changes nothing at all on a viewport tall enough to pay", () => {
    // The clamp is a floor-of-last-resort, not a new look. At any height that
    // could already seat the shell, the reserve is the declared 16rem maximum
    // and every measured stage height above is reproduced exactly.
    for (const [width, measured] of Object.entries(MEASURED)) {
      expect(tokenPx(Number(width), "--qs-media-h", 1400)).toBe(16 * 16);
      expect(stageHeightAt(Number(width), 1400)).toBe(measured.stage);
    }
  });

  it("never squeezes the prompt or the answers, at any viewport height", () => {
    // The media band is art with a declared aspect and a cap it already
    // honours. The other two regions are TEXT: shrinking them wraps a question
    // or moves the tablets' origin, which is the one coordinate the whole
    // stage exists to pin. They must be height-independent — every pixel this
    // fix recovered came from chrome or from reserved air, never from these.
    for (const width of [1024, 1280, 1512]) {
      for (const h of [640, 720, 800, 1400]) {
        for (const dock of [false, true]) {
          expect(tokenPx(width, "--qs-prompt-h", h, dock))
            .toBe(tokenPx(width, "--qs-prompt-h", 1400));
          expect(tokenPx(width, "--qs-answers-h", h, dock))
            .toBe(tokenPx(width, "--qs-answers-h", 1400));
        }
      }
    }
  });

  it("floors the band at the shortest band the corpus actually ships", () => {
    // 4.5rem = 72px = the compact plate's own intrinsic height. At the floor
    // the region is exactly the smallest REAL band, so it has stopped
    // reserving air without starting to crop anything — a taller band still
    // grows the card, the way every reserve in this block does.
    expect(tokenPx(1024, "--qs-media-h", 400)).toBe(72);
    expect(tokenPx(1920, "--qs-media-h", 400)).toBe(72);
  });

  it("still tells the band exactly one thing, and the same thing", () => {
    // The cap and the reserve stay the same expression at every height — a
    // band capped below its region would be shrunk art inside an empty box.
    for (const width of [1024, 1280, 1512]) {
      for (const h of [640, 800, 1400]) {
        expect(tokenPx(width, "--qs-media-max", h)).toBe(tokenPx(width, "--qs-media-h", h));
      }
    }
  });

  it("keeps the chrome budget honest about each band it charges for", () => {
    // The budget is a set of MEASURED constants, so a band that changes height
    // has to be paid for here. These are the two the fit pass moved, plus the
    // reserves that are the budget's biggest single terms.
    const shell = read("components/ranked-arena/ArenaShell.tsx");
    expect(shell).toContain("lg:min-h-7 lg:pl-14 lg:pr-56");      // 1.75rem term
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toContain("ranked-shell flex flex-col gap-3 lg:flex-1 lg:gap-1.5");
    const central = read("components/ranked-arena/CentralStage.tsx");
    // The display's reserved box. The TIMER's own scale is untouched and is
    // asserted alongside it, because shrinking the clock is the one way of
    // paying for this that was explicitly ruled out.
    expect(central).toContain("min-h-[3rem] min-w-[9rem]");
    expect(central).toContain("text-4xl font-black tabular-nums leading-none");
    expect(central).toContain("sm:text-5xl min-[1500px]:text-6xl");
  });
});

describe("nothing inside the card was made smaller to fit it", () => {
  it("caps the cinematic band at exactly the region it already fits", () => {
    // `--qs-media-max` is the ONLY thing the stage says to the band, and it
    // says the region's own height — which is the tallest that band reaches at
    // any supported width. Setting it lower would shrink shipped media, which
    // is the one thing this phase may not do.
    for (const width of [1024, 1280, 1512]) {
      expect(tokensAt(width)["--qs-media-max"], `at ${width}px`)
        .toBe(tokensAt(width)["--qs-media-h"]);
    }
  });

  it("keeps the prompt's own type scale", () => {
    // The reserve is a box; it never restyles what goes in it.
    expect(CSS).toMatch(
      /\[data-testid="scenario-surface"\] > header h2 \{\s*font-size: 1\.125rem;\s*line-height: 1\.45;/);
    expect(CSS).toMatch(/min-width: 1500px[\s\S]{0,220}> header h2 \{\s*font-size: 1\.25rem;/);
  });

  it("keeps the answer tablet's own box", () => {
    const grid = read("components/quiz/QuizAnswerOptions.tsx");
    // The tablet's padding and text size are what its height IS. A fixed card
    // must never be paid for out of these.
    // Asserted as the individual tokens rather than one frozen class string:
    // the answer-geometry pass added `h-full min-h-full` (sibling stretch) to
    // this list, which is precisely NOT a fixed card — it is the cell's own
    // content-derived height. What may never change is what follows.
    expect(grid).toContain("py-3 px-4");
    expect(grid).toContain("whitespace-normal");
    expect(grid).toContain("text-sm leading-relaxed");
    expect(grid).toContain("justify-start text-left");
    // No fixed tablet height — a wrapped answer must still grow. Asserted on
    // the tablet's OWN class expression, because the picture-choice branch of
    // this same file legitimately pins its ART (`h-20 w-20 md:h-24`), which is
    // media inside the tablet and not the tablet's box.
    const tabletBox = grid.slice(grid.indexOf('imgUrl\n                  ? "w-full'));
    const [imgBranch, textBranch] = tabletBox.split("\n").filter((l) => l.includes('"w-full'));
    for (const branch of [imgBranch, textBranch]) {
      expect(branch).toContain("h-full min-h-full");
      // `h-full`/`min-h-full` only; nothing numeric, nothing arbitrary.
      expect(branch).not.toMatch(/\bh-\[/);
      expect(branch).not.toMatch(/\bh-\d/);
    }
    expect(grid).toContain("gap-2.5");
    // And the border lock that pins every tablet STATE to one box.
    expect(CSS).toMatch(/\[data-answers-state\] \[data-quiz-choice\] \{[^}]*border-width: 1px/);
  });

  it("keeps the answers where they were — no per-question placement", () => {
    const surface = read("components/question-surface/InteractiveScenarioSurface.tsx");
    // The 2-up rule and its 44-character threshold are unchanged: the stage
    // reserves room for the grid, it does not rearrange it.
    expect(surface).toContain("o.label.length <= 44");
    expect(surface).toContain("question.options.length >= 4");
  });
});

describe("the stage reserves, and never clips or scrolls", () => {
  const block = () => {
    const css = stripComments(CSS);
    const start = css.indexOf(".ranked-question-stage");
    const end = css.indexOf('[data-surface-region="answers"]');
    return css.slice(start, css.indexOf("}", end) + 1);
  };

  it("uses min-height everywhere, so oversized content extends the card", () => {
    // The arena's standing rule is that no surface inside it scrolls
    // internally, and `.ranked-panel` is `overflow: hidden` — so a hard
    // `height` here would CUT a question off rather than let it overflow the
    // reserve. Content that does overflow is a content-review candidate.
    const src = block();
    expect(src).toContain("min-height: var(--qs-media-h, 0px)");
    expect(src).toContain("min-height: var(--qs-prompt-h, 0px)");
    expect(src).toContain("min-height: var(--qs-answers-h, 0px)");
    expect(src).not.toMatch(/(^|[\s;{])height:/);
    expect(src).not.toMatch(/overflow/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// The three regions the reserves land on.
// ───────────────────────────────────────────────────────────────────────────

const OPEN: InteractionPermissions = { ...NO_INTERACTIONS, canSelectAnswer: true };

const SHORT_Q: QuestionView = {
  questionId: "q-short", category: "items", prompt: "Which item grants Immolate?",
  options: [
    { id: "0", index: 0, label: "Sunfire Aegis" }, { id: "1", index: 1, label: "Heartsteel" },
    { id: "2", index: 2, label: "Thornmail" }, { id: "3", index: 3, label: "Randuin's Omen" },
  ],
};
const ITEM_SCENARIO = scenarioSourceFromPublicQuestion({
  questionId: SHORT_Q.questionId, prompt: SHORT_Q.prompt,
  options: SHORT_Q.options.map((o) => o.label), category: "items",
  presentation: {
    assets: { subject: { type: "item", name: "Sunfire Aegis", icon: "assets/items/3068.png" } },
    presentation: { scenario_type: "item", role: "context", timing: "question", spoiler: false },
  },
});

function regionsOf(node: HTMLElement): string[] {
  return [...node.children]
    .map((c) => c.getAttribute("data-surface-region"))
    .filter((r): r is string => r !== null);
}

describe("the surface emits exactly the regions the stage reserves", () => {
  const cases: [string, () => void][] = [
    ["compact", () => render(
      <InteractiveScenarioSurface question={SHORT_Q} selectedOptionId={null}
        permissions={OPEN} onSelectOption={() => {}} variant="competitive" />)],
    ["cinematic", () => render(
      <InteractiveScenarioSurface question={SHORT_Q} selectedOptionId={null}
        permissions={OPEN} onSelectOption={() => {}} variant="competitive"
        scenarioSource={ITEM_SCENARIO} />)],
    ["family", () => render(
      <InteractiveScenarioSurface question={RA7.PHYSICAL_DAMAGE_Q} selectedOptionId={null}
        permissions={OPEN} onSelectOption={() => {}} variant="competitive"
        scenarioSource={RA7.PHYSICAL_DAMAGE_SCENARIO} />)],
  ];

  it.each(cases)("%s bands land in the media region", (band, mount) => {
    mount();
    const surface = screen.getByTestId("scenario-surface");
    expect(surface.dataset.band).toBe(band);
    expect(surface.className).toContain("question-surface-stack");
    // Order matters: the reserves are declared per region, and a region that
    // moved out of this order would take its reserve to the wrong place.
    expect(regionsOf(surface)).toEqual(["media", "prompt", "answers"]);
    // Direct children, because the canonical rule is a CHILD selector — a
    // wrapper introduced between them would silently drop every reserve.
    for (const region of ["media", "prompt", "answers"]) {
      expect(surface.querySelector(`:scope > [data-surface-region="${region}"]`)).not.toBeNull();
    }
  });

  it("puts the band INSIDE the media region rather than beside it", () => {
    cases[1][1]();
    const media = screen.getByTestId("scenario-surface")
      .querySelector('[data-surface-region="media"]')!;
    expect(media.contains(screen.getByTestId("scenario-hero"))).toBe(true);
  });

  it("makes the answer region the grid's own wrapper, not an outer box", () => {
    // The answers reserve is what pins the tablets' origin. If it were a box
    // one level out, the grid could still float inside it and the origin would
    // move with the prompt again.
    cases[0][1]();
    const answers = screen.getByTestId("scenario-surface")
      .querySelector('[data-surface-region="answers"]')!;
    expect(answers.getAttribute("role")).toBe("group");
    expect(answers.querySelector("[data-quiz-answer-options]")).not.toBeNull();
  });

  it("omits the media region entirely for a text-only surface", () => {
    // `mediaScale: "none"` has no band, and reserving room for one would be a
    // large empty box above the prompt.
    render(
      <InteractiveScenarioSurface question={SHORT_Q} selectedOptionId={null}
        permissions={OPEN} onSelectOption={() => {}} variant="speed" />);
    const surface = screen.getByTestId("scenario-surface");
    expect(surface.dataset.band).toBe("none");
    expect(regionsOf(surface)).toEqual(["prompt", "answers"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// One owner, and no mode may have a second.
// ───────────────────────────────────────────────────────────────────────────

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("the arena owns the footprint, and it owns it once", () => {
  it("declares the stage on the question section, and nowhere else", () => {
    const arena = codeOnly(read("components/ranked-arena/CanonicalArena.tsx"));
    expect(arena).toContain("ranked-panel ranked-folio ranked-question-stage");
    expect(arena.match(/ranked-question-stage/g)).toHaveLength(1);
  });

  it("is applied by the arena alone — no mode carries the class", () => {
    const others = sourceFiles(ROOT)
      .filter((f) => /ranked-question-stage/.test(codeOnly(readFileSync(f, "utf8"))))
      .map((f) => f.slice(ROOT.length + 1))
      .filter((f) => f !== "index.css")
      .sort();
    expect(others).toEqual(["components/ranked-arena/CanonicalArena.tsx"]);
  });

  it("lets no mode set a height on its question card", () => {
    // The whole point of Step 3–5 was one renderer. A mode that pins its own
    // card height re-forks the arena in the one dimension this phase fixed.
    const MODE_DIRS = [
      join(ROOT, "pages", "quiz-ranked"),
      join(ROOT, "pages", "quiz-daily-challenge"),
      join(ROOT, "lib", "daily-challenge"),
    ];
    for (const dir of MODE_DIRS) {
      for (const file of sourceFiles(dir)) {
        const src = codeOnly(readFileSync(file, "utf8"));
        const name = file.slice(ROOT.length + 1);
        expect(src, `${name} declares a question-card height of its own`)
          .not.toMatch(/ranked-folio[^"'`]*(?:min-)?h-\[/);
        expect(src, `${name} sets a canonical stage token of its own`)
          .not.toMatch(/--qs-/);
      }
    }
  });

  it("keeps the arena's own no-scroll rule in the file that grew the stage", () => {
    const arena = codeOnly(read("components/ranked-arena/CanonicalArena.tsx"));
    expect(arena).not.toMatch(/overflow-y-auto|overflow-auto|overflow-y-scroll/);
    expect(arena).not.toMatch(/h-\[var\(--app-viewport-h\)\]/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Three modes, one stage. Rendered, not scanned.
// ───────────────────────────────────────────────────────────────────────────

/** The one thing every mode must be handed by the arena, and nothing else. */
function stageSection(): HTMLElement {
  const section = screen.getByTestId("ranked-question");
  expect(section.className).toContain("ranked-question-stage");
  // The regions the reserves land on, in the arena's own card.
  expect(regionsOf(screen.getByTestId("scenario-surface")))
    .toEqual(["media", "prompt", "answers"]);
  return section;
}

describe("Ranked inherits the stage", () => {
  const json = (body: unknown) => new Response(JSON.stringify(body), {
    status: 200, headers: { "Content-Type": "application/json" } });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url);
      if (u.endsWith("/resume")) {
        return json({
          schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", round_number: 1, server_time: "2026-08-23T12:00:00+00:00",
          payload: { match_status: "active", match_over: false,
            public: publicRoundV2(), private: privatePlayerV2("userA"),
            progression_pending_players: [], latest_resolved_round: null, result: null },
        });
      }
      if (u.endsWith("/private")) return json(privatePlayerV2("userA"));
      if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
      if (/\/matches\/m1$/.test(u)) return json(publicRoundV2());
      return json({});
    }) as unknown as typeof fetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

  it("draws its live round on the canonical stage", async () => {
    render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
    await screen.findByTestId("ranked-match");
    await screen.findByTestId("ranked-question");
    stageSection();
  });
});

describe("the Daily inherits the stage", () => {
  afterEach(cleanup);

  /** The Daily's OWN adapter, unmodified, on the arena. */
  function dailyView(kind: "open" | "learning") {
    const run = parseRun(rawRun({
      cards: [{
        sequence: 1, prompt: "Which item grants Immolate?",
        scoreLocked: kind === "learning",
        scoreOutcome: kind === "learning" ? "wrong_answer" : null,
        eliminated: kind === "learning" ? [1] : [],
        attemptCount: kind === "learning" ? 1 : 0,
      }],
    }));
    return dailyArenaView({
      run, today: null, card: run.cards[0], held: false, beat: null,
      busy: false, error: null, timer: null, skewMs: 0, displayName: "Challenger",
      targetPanel: <div>target</div>, onAnswer: () => {},
    });
  }

  it.each(["open", "learning"] as const)(
    "draws a %s card on the canonical stage", (kind) => {
      render(<CanonicalArena view={dailyView(kind)} />);
      stageSection();
      // The Daily's own seams are live inside the shared regions rather than
      // beside them: the retry surface is the canonical grid.
      expect(screen.getByTestId("answer-grid")).toBeInTheDocument();
      if (kind === "learning") {
        expect(screen.getByTestId("answer-grid")
          .querySelector('[data-choice-state="eliminated"]')).not.toBeNull();
      }
    });

  it("keeps the reserved answer region when the retry seam strikes an option", () => {
    // Elimination is the one thing that changes the tablets between two views
    // of the SAME card, and it must not change the region they sit in.
    const open = render(<CanonicalArena view={dailyView("open")} />);
    const before = regionsOf(screen.getByTestId("scenario-surface"));
    open.unmount();
    render(<CanonicalArena view={dailyView("learning")} />);
    expect(regionsOf(screen.getByTestId("scenario-surface"))).toEqual(before);
  });
});

describe("Meta Reflex keeps the same outer footprint", () => {
  afterEach(cleanup);

  /** A live v4 block, read through the REAL reader and the REAL viewport. */
  function metaReflexView() {
    const raw = publicRoundV2();
    const payload = raw.payload as Record<string, unknown>;
    const pub = readPublicRound({
      ...raw,
      payload: {
        ...payload, question: null, segment: metaReflexSegmentMeta(),
        segment_state: { ...metaReflexState(0), block: { cards: metaReflexCards() } },
      },
    });
    const base = dailyArenaView({
      run: parseRun(rawRun({ cards: [{ sequence: 1 }] })), today: null,
      card: null, held: false, beat: null, busy: false, error: null,
      timer: null, skewMs: 0, displayName: "You",
      targetPanel: <div>target</div>, onAnswer: () => {},
    });
    return {
      ...base,
      surface: {
        ...base.surface, renderer: rendererForSegment(pub.segment),
        publicRound: pub, segmentState: pub.segmentState,
        ownsSubmission: true, hasContent: true,
      },
    };
  }

  it("renders its block INSIDE the same stage an ordinary round gets", () => {
    render(<CanonicalArena view={metaReflexView()} />);
    const section = screen.getByTestId("ranked-question");
    // The SAME section, with the SAME class: the block's outer footprint is the
    // arena's, so a match that alternates ordinary rounds and blocks keeps one
    // card size. What the block does INSIDE it is the block's own business —
    // it composes two choice cards, not a band/prompt/answers stack, so it has
    // no `data-surface-region` and needs none.
    expect(section.className).toContain("ranked-question-stage");
    expect(screen.getByTestId("mr-block")).toBeInTheDocument();
    expect(section.querySelectorAll("[data-surface-region]")).toHaveLength(0);
    // The stage is a FLOOR, so a block shorter than it is given room rather
    // than stretched, and a longer one would extend the card rather than clip.
    expect(section.getAttribute("style")).toBeNull();
  });

  it("is the one viewport the arena's HUD row is withheld from", () => {
    // Documented exception, and it PREDATES this phase: a block owns its own
    // submission, so the arena renders no ability tray and no status line
    // beside it — which puts the timeline one HUD row higher than an ordinary
    // round's. The card footprint above it is identical either way.
    render(<CanonicalArena view={metaReflexView()} />);
    expect(screen.queryByTestId("submission-status")).toBeNull();
    expect(screen.getByTestId("ranked-round-timeline")).toBeInTheDocument();
  });
});

describe("every term between the card and the timeline is still reserved", () => {
  // The timeline's Y is the SUM of the reserved boxes above it. The stage is
  // the term this phase added; these are the ones that were already there, and
  // the invariant needs all of them.
  const arena = () => codeOnly(read("components/ranked-arena/CanonicalArena.tsx"));

  it("the header strip keeps its reserved minimum", () => {
    // RM1 Pass 2B raised it from 3.5rem: the strip's centre now carries the
    // focal display, which is deliberately the largest thing in the header.
    // The INVARIANT is unchanged and is the only thing this asserts — the
    // strip reserves a fixed minimum, so a face turning inside it (clock →
    // result → module name) cannot move the timeline below.
    expect(arena()).toContain("min-h-[4.25rem]");
  });

  it("the status line keeps its reserved line box", () => {
    // 2rem, not the 2.25rem it reserved before the RM1 hotfix: the box is a
    // `line-clamp-2` of `text-xs`, which is exactly two 16px lines, so the
    // extra 4px was air a status string could never reach into. The RESERVE
    // is what matters and it is still here — the line box cannot change height
    // when one status replaces another.
    expect(arena()).toContain("line-clamp-2 min-h-[2rem]");
  });

  it("the round-resolution beat still cannot grow the strip", () => {
    // It is `hidden md:flex` and a fixed plate; a wrapping beat used to push
    // everything below it down by a row.
    expect(arena()).toContain('className="hidden md:flex"');
  });

  it("the level-2 choice is still overlaid rather than inserted", () => {
    expect(arena()).toContain('className={hasSurface ? "absolute inset-x-0 top-0 z-20" : ""}');
  });

  it("the timeline is still the arena's floor, mounted unconditionally", () => {
    // RG1 made the timeline one of the shell's three `shrink-0` chrome bands,
    // so it carries a class now. It is still mounted unconditionally, which is
    // the property this pins.
    expect(arena()).toContain(
      '{timeline && <RoundTimeline timeline={timeline} className="lg:shrink-0" />}');
  });
});
