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

/** Every `.ranked-question-stage { … }` body on the WIDTH LADDER — unguarded or
 *  guarded by `(min-width: N)` alone — with that `min-width` (0 when
 *  unguarded), in source order.
 *
 *  VISCONT1: this used to be one regex that only recognised a guard written
 *  directly before the rule, so a rule inside `(min-width: 1600px) and
 *  (min-height: 780px)` read as UNGUARDED and its tokens leaked into every
 *  width, phones included. It now asks the block-aware parser below
 *  (`stageTokenRules`), and the height-gated tiers are evaluated where they
 *  belong — `tokensAtViewport`, in the VISCONT1 block at the end. */
function stageRules(): { minWidth: number; body: string }[] {
  return stageTokenRules()
    .filter((r) => r.selector === ".ranked-question-stage"
      && r.preludes.every((p) => /^\(min-width:\s*\d+px\)$/.test(p)))
    .map((r) => ({
      minWidth: Math.max(0, ...r.preludes.map((p) => Number(/(\d+)px/.exec(p)![1]))),
      body: r.body,
    }));
}

/** The tokens in force at `width`, applied in source order the way the cascade
 *  would apply them. */
function tokensAt(width: number): Record<string, string> {
  const tokens: Record<string, string> = {};
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
 * THE BUDGET IS GONE, AND THAT IS THE POINT.
 *
 * This file used to parse `--ranked-chrome-h` — a measured CONSTANT standing
 * in for the height of every band that is not the Question Stage — and check
 * that the stage's reserve plus that constant fitted the viewport. It closed
 * most of the overrun and could not close the rest, because a constant is a
 * guess about a height only the browser knows, and the media band's own
 * `min-height: 8rem` was a 56px error the arithmetic could not see.
 *
 * The arena is now LOCKED rather than estimated: the frame takes exactly
 * `--ranked-stage-h`, every band between it and the stage carries `min-h-0`,
 * and the stage takes what is actually left. There is no sum left to check —
 * so what this file checks instead is the mechanism, below.
 */

const TALL = 1600;

const stageHeightAt = (width: number) => px(stageExpression(), tokensAt(width));
const tokenPx = (width: number, name: string) => {
  const v = tokensAt(width)[name];
  return v === undefined ? null : px(v, tokensAt(width));
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
//
// VISCONT1 re-measured the two text regions after QV1 Step 3B stepped the
// prompt to 19px from `lg`. The ARENA1 figures (149 / 124 at 1024 / 1280) were
// taken at 18px, and the step made the RA7 Combat Calculation prompt (192
// characters) five lines at 1024 — 156.7px, over the 152px reserve — and the
// bank's 188-character maximum four lines from 1280 — 129.2px, over 124. A
// prompt that overflows its region moves the answer grid, so both reserves
// were raised to what the browser measures (prompt: category + lines; answers:
// two rows with option media and one wrapped label, the RCP1 item card).
// ───────────────────────────────────────────────────────────────────────────
//
// VISCONT1's second pass ("content adapts to the arena") changed what the
// two text regions have to hold: long text now TIGHTENS into its box
// (`textDensity`) instead of the box being sized for the longest text at full
// size. So `prompt` is the tallest prompt any tier draws (four 19px lines +
// category; over 150 characters takes 16px at 1024) and `answers` the tallest
// grid any tier draws (the dense tier's four 12px lines in the 1024 column,
// three from 1280). The 1024 tier moved 28px from its prompt box to its
// answer box; its stage is unchanged.
const MEASURED = {
  1024: { band: 199, prompt: 130, answers: 156, stage: 618 },
  1280: { band: 256, prompt: 130, answers: 124, stage: 580 },
  1512: { band: 256, prompt: 111, answers: 124, stage: 586 },
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
// ───────────────────────────────────────────────────────────────────────────
// RM1 — THE ARENA IS LOCKED TO THE VIEWPORT.
//
// No arithmetic here, because the fix removed the arithmetic. What makes the
// Ranked shell unable to scroll the document is a MECHANISM, and these are its
// four parts: a definite height at the top, `min-h-0` all the way down so a
// flex child may actually shrink, a stage capped by the box it was given, and
// exactly one region inside it that yields. Remove any one and the shell can
// grow past the viewport again, which is what each of these fails on.
// ───────────────────────────────────────────────────────────────────────────
describe("the Ranked shell is locked to the viewport, not estimated", () => {
  const lgStageRule = () => {
    const css = stripComments(CSS);
    const re = /@media\s*\(min-width:\s*1024px\)\s*\{\s*\.ranked-question-stage\s*\{([^}]*)\}/g;
    const bodies: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) bodies.push(m[1]);
    return bodies.join("\n");
  };

  it("takes a definite height at the top of the chain", () => {
    const shell = read("components/ranked-arena/ArenaShell.tsx");
    expect(shell).toContain("lg:h-[var(--ranked-stage-h)]");
    // The floor is GONE. While it was a `min-h` the frame could be taller than
    // the viewport by however much its content wanted, which is a document
    // scrollbar by definition.
    expect(shell).not.toContain("lg:min-h-[var(--ranked-stage-h)]");
  });

  it("lets every band between the frame and the stage actually shrink", () => {
    // `min-height: auto` is a flex item's default and it refuses to go below
    // its content. One band without `min-h-0` pins the whole column open, so
    // this is asserted at every link rather than at the ends.
    const shell = read("components/ranked-arena/ArenaShell.tsx");
    expect(shell).toContain('className="flex flex-1 flex-col lg:min-h-0"');
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    for (const link of [
      "ranked-shell flex flex-col gap-3 lg:flex-1 lg:gap-1.5 lg:min-h-0", // match column
      "grid grid-cols-2 gap-3 lg:min-h-0 lg:flex-1",                      // arena grid
      "lg:col-start-2 lg:row-start-1 lg:min-h-0",                         // centre column
      "lg:flex lg:flex-1 lg:flex-col lg:min-h-0",                         // stage + body
    ]) {
      expect(arena, `missing min-h-0 link: ${link}`).toContain(link);
    }
  });

  it("caps the stage at the box the lock actually left it", () => {
    const lg = lgStageRule();
    // The reserve became a PREFERENCE: `min()` of what the stage wants and
    // 100% of what it was given. The percentage resolves only because the
    // height chain above is definite — which is the previous two tests.
    expect(lg).toMatch(/min-height:\s*min\(calc\([\s\S]*?\),\s*100%\)/);
    expect(lg).toMatch(/max-height:\s*100%/);
    // And no constant survives anywhere: a budget that has to be re-measured
    // whenever a band changes is the thing this replaced.
    const css = stripComments(CSS);
    expect(css).not.toContain("--ranked-chrome-h");
    expect(css).not.toContain("--qs-avail");
    expect(css).not.toContain("--ranked-dock-h");
  });

  it("yields ART, and only art — never the prompt or the answers", () => {
    // The compression order, as CSS. The media region may shrink to nothing;
    // the two text regions may not shrink at all. A test that only checked
    // "the stage fits" would pass just as happily on a stage that had crushed
    // the question, which is the one outcome that is not allowed.
    const css = stripComments(CSS);
    const media = /\.ranked-question-stage \.question-surface-stack > \[data-surface-region="media"\] \{([^}]*)\}/
      .exec(css)?.[1] ?? "";
    expect(media).toMatch(/flex:\s*0 1 auto/);
    expect(media).toMatch(/min-height:\s*0/);
    const text = /\[data-surface-region="prompt"\],\s*\.ranked-question-stage \.question-surface-stack > \[data-surface-region="answers"\] \{([^}]*)\}/
      .exec(css)?.[1] ?? "";
    expect(text).toMatch(/flex:\s*0 0 auto/);
  });

  it("stops the band's own floor from outranking the box it sits in", () => {
    // THE LAST FEW PIXELS. `ScenarioMediaBand` carries `minHeight: 8rem` as a
    // legibility floor, and as a bare minimum it also outranked the stage's
    // reserved media region — a 128px floor inside a region the lock had sized
    // smaller is a shell that is taller than the viewport no matter what the
    // stage reserved. Both bounds are now clamped to the region.
    const band = read("components/question-surface/ScenarioMediaBand.tsx");
    expect(band).toContain("minHeight: `min(${bandMinHeight}, 100%)`");
    expect(band).toContain("maxHeight: `min(var(--qs-media-max, ${bandMaxHeight}), 100%)`");
  });

  it("keeps the Module Rail mounted and out of the flex distribution", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toContain('<RoundTimeline timeline={timeline} className="lg:shrink-0" />');
    // Unconditional on the timeline's presence, never on the viewport's size:
    // "it fits because the rail is gone" is not fitting.
    expect(arena).toContain("{timeline && <RoundTimeline");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// RM1 — STATE MAY ANIMATE, GEOMETRY MAY NOT MOVE.
// ───────────────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────────────
// RM1 — THE MATCH HEADER'S HIERARCHY, AND ITS FIXED WINDOWS.
// ───────────────────────────────────────────────────────────────────────────
describe("the Match Header says three things on the left and one on the right", () => {
  const arenaSrc = () => read("components/ranked-arena/CanonicalArena.tsx");

  it("has retired OPPONENT CONNECTED entirely", () => {
    // The header's one permanently-true line: nothing a player could act on,
    // present for the whole of every healthy match. The ABNORMAL presence
    // states survive, because a duel whose opponent has dropped is a different
    // match and the player has to be told.
    const views = read("pages/quiz-ranked/rankedViews.ts");
    expect(views).not.toContain('"Opponent connected"');
    expect(views).toContain('case "connected": return null;');
    expect(views).toContain('"Opponent disconnected"');
    expect(views).toContain('"Opponent forfeited"');
  });

  it("stacks mode, opponent and progress as the left block", () => {
    const src = arenaSrc();
    const left = src.slice(src.indexOf("LEFT — the match's own hierarchy"),
      src.indexOf("CENTRE — the display"));
    // Three lines, in this order: what this is, who it is against, how far in.
    expect(left.indexOf("header.eyebrow")).toBeLessThan(left.indexOf("ranked-presence"));
    expect(left.indexOf("ranked-presence")).toBeLessThan(left.indexOf("ranked-header-title"));
    // And the mode's name stopped carrying the opponent on its back.
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain('eyebrow: host ? "" : "Ranked Duel"');
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("opponentVersusLabel");
  });

  it("drops the word MODULE from the progress figure", () => {
    // Third line of a block whose first two lines are the mode and the
    // opponent — the position already says what the number is, so the word was
    // a label on a label.
    // The denominator is the stage's PLAN (`plannedRoundTotal`), not the raw
    // frozen length — a rapid-recall stage's is a candidate ceiling. The
    // figure's shape is unchanged: "n / total", never "Module n".
    const views = read("pages/quiz-ranked/rankedViews.ts");
    expect(views).toContain("`${scoring.moduleNumber} / ${total}`");
    expect(views).not.toContain("`Module ${scoring.moduleNumber}");
  });

  it("owns progress in ONE place — the right side no longer repeats it", () => {
    const src = arenaSrc();
    const right = src.slice(src.indexOf("RIGHT — the previous module's record"));
    expect(right).not.toContain("header.title");
    // Exactly one rendering of the figure in the whole header.
    expect(src.match(/ranked-header-title/g) ?? []).toHaveLength(1);
  });

  it("mirrors the ARENA's tracks, so each zone sits over its own object", () => {
    const src = arenaSrc();
    // The arena is 23 / 54 / 23, not thirds. A header that merely spread its
    // three children across the strip put nothing in particular above anything
    // in particular; the registration is the same track expression and the
    // same gap, so the left block is over the left Player Column, the display
    // is over the Question Stage and the record is over the right column.
    const TRACKS = "lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)]";
    const header = src.slice(src.indexOf('data-testid="ranked-header"'),
      src.indexOf("LEFT — the match's own hierarchy"));
    const grid = src.slice(src.indexOf('className="grid grid-cols-2'));
    expect(header).toContain(TRACKS);
    expect(grid).toContain(TRACKS.replace("lg:grid-cols-", "lg:grid-cols-"));
    // Same gutters, or the tracks resolve to different widths.
    expect(header).toContain("lg:gap-3");
    expect(header).toContain("min-[1500px]:gap-4");
    // And the strip's own inline padding has to go with it: padding here would
    // inset the tracks relative to the arena's and put every zone off by a few
    // pixels from the thing it is over.
    expect(header).toContain("lg:px-0");
  });

  it("centres each header zone inside its own track", () => {
    const src = arenaSrc();
    // Three zones, three `justify-self-center` — the grid decides the track,
    // this decides where the block sits in it.
    expect(src.match(/lg:justify-self-center/g) ?? []).toHaveLength(3);
  });

  it("keeps the header's height untouched by the registration", () => {
    // Registration is a horizontal change. The strip reserves what it did.
    expect(arenaSrc()).toContain('min-h-[4.25rem]');
  });

  it("gives the previous-result record a FIXED window", () => {
    // "TIMED OUT +0 | R1" and "CORRECT +2 | R2" are different lengths, and a
    // box sized to whichever was current nudged the strip's right end on every
    // settlement.
    const src = arenaSrc();
    expect(src).toContain('data-testid="ranked-record-window"');
    expect(src).toContain("ranked-record-window flex h-10 w-[11.5rem] shrink-0 items-center");
    expect(src).toContain("min-[1500px]:w-[13rem]");
  });

  it("lightens the record plate without touching its fixed geometry", () => {
    // The window stays; what goes is the tinted fill that made a badge read as
    // a form field once it was alone in a 184px frame. The verdict is still
    // coloured — the tone moves to the border, keyed off the `data-kind` the
    // plate already publishes.
    const css = stripComments(CSS);
    const first = css.indexOf(".ranked-record-window .ranked-result-beat");
    // RR1 added the record window's FIT rules right after this colour block;
    // they are geometry by design and are pinned in RecordWindow.fit.test.
    // This guard keeps its original scope: the lightening block, colour only.
    const fit = css.indexOf("width: calc(100% - 0.5rem)", first);
    const end = Math.min(css.indexOf("@keyframes", first),
      fit === -1 ? Infinity : css.lastIndexOf(".ranked-record-window .ranked-result-beat {", fit));
    const scoped = css.slice(first, end);
    expect(scoped).toMatch(/background:\s*rgba\(255,255,255,0\.025\)/);
    expect(scoped).toMatch(/border-color:\s*rgba\(255,255,255,0\.12\)/);
    expect(scoped).toMatch(/data-kind="correct"/);
    expect(scoped).toMatch(/data-kind="timed-out"/);
    // Colour only: nothing here may resize the plate.
    for (const geometry of [/(^|[\s;])width:/, /(^|[\s;])height:/, /(^|[\s;])padding/,
      /(^|[\s;])margin/, /border-width/, /border-radius/]) {
      expect(scoped).not.toMatch(geometry);
    }
  });

  it("holds the module title long enough to read it", () => {
    // 900ms spent 340 of them in the shared entrance flip, leaving ~560ms of
    // actual hold — less than it takes to read a word and register it.
    const src = read("lib/ranked-core/centralStage.ts");
    expect(src).toContain("export const MODULE_TITLE_MS = 1400;");
    // The flip is unchanged and still shared, so no other state slowed down.
    expect(stripComments(CSS)).toMatch(/\.ranked-stage-face \{[^}]*340ms/);
  });

  it("keeps the plate's depth paint-only, so the strip's geometry is untouched", () => {
    const css = stripComments(CSS);
    const plate = /\.ranked-academy \.ranked-header-plate \{([^}]*)\}/.exec(css)?.[1] ?? "";
    // Shading, and nothing that occupies space: no height, no padding, no
    // margin, no border-width — the strip is the same box it was.
    expect(plate).toMatch(/background-image:/);
    expect(plate).toMatch(/box-shadow:/);
    expect(plate).not.toMatch(/(^|[\s;])height:/);
    expect(plate).not.toMatch(/(^|[\s;])padding/);
    expect(plate).not.toMatch(/(^|[\s;])margin/);
    expect(plate).not.toMatch(/border-width/);
  });
});

describe("answering begins at the server's boundary", () => {
  it("shuts input until the round is answerable", () => {
    const mode = read("pages/quiz-ranked/QuizRankedMatch.tsx");
    // A round is created in the future while the client is still playing the
    // previous result and this module's title. Until `started_at` the question
    // may be on screen, but it is not answerable — and the backend agrees,
    // because `DuelRound.submit_answer` refuses a receipt earlier than the
    // round's own start. Offering input here would be offering something the
    // server would reject.
    expect(mode).toContain("msUntilAnswerable(m.publicRound.activeRound.startedAt");
    expect(mode).toContain("!m.revealHold && !answerablePending");
  });

  it("keeps the boundary the SERVER's, never a local constant's", () => {
    // `MODULE_TITLE_MS` sequences the animation. It may not decide when
    // answering starts, or the two would drift the moment either was tuned.
    const views = read("pages/quiz-ranked/rankedViews.ts");
    expect(views).toContain("Math.min(\n    active.durationSeconds,");
    expect(views).not.toContain("MODULE_TITLE_MS");
    const mode = read("pages/quiz-ranked/QuizRankedMatch.tsx");
    expect(mode).not.toMatch(/inputOpen[^\n]*MODULE_TITLE_MS/);
  });
});

describe("transient state cannot change Match Shell geometry", () => {
  it("has retired the PLAYTEST · PLACEHOLDER notice from Ranked", () => {
    const mode = read("pages/quiz-ranked/QuizRankedMatch.tsx");
    // A build-state fact about the content pipeline, not match news, and the
    // only thing in the strip a player could do nothing with. Ranked publishes
    // none, so the conditional slot renders nothing and costs no height.
    expect(mode).not.toContain("Playtest · Placeholder");
    expect(mode).toContain("playtestNote: null");
    // The SLOT survives on the arena (a mode-supplied, optional line).
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toContain("header.playtestNote");
  });

  it("gives Meta Reflex ONE reserved box for every phase of a block", () => {
    const mr = read("lib/ranked-core/modules/metaReflexModule.tsx");
    // "Starting…" is two lines, a live card is a header + prompt + a 12rem
    // card row + a note, the wait is a settled card and a sentence. Each used
    // to be exactly as tall as it happened to be, so the intro snapped into
    // the first card and the last card snapped into the wait. One reserve,
    // sized to the tallest phase, and every phase centres inside it.
    expect(mr).toContain('data-testid="mr-surface"');
    expect(mr).toContain("flex flex-col justify-center space-y-3 lg:min-h-[18.5rem]");
  });

  it("sizes Meta Reflex card art by its slot, never by the asset", () => {
    const mr = read("lib/ranked-core/modules/metaReflexModule.tsx");
    // A 64x64 icon and a 512x512 render must produce the same box. The slot is
    // a fixed square per breakpoint and the image fills it with `object-contain`,
    // so intrinsic dimensions never reach layout and a late-loading asset
    // cannot move what is around it.
    expect(mr).toContain("h-24 w-24 sm:h-28 sm:w-28 lg:h-36 lg:w-36");
    expect(mr).toContain("h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20");
    expect(mr).toContain('className="h-full w-full object-contain"');
    // The error fallback renders INSIDE the same slot, so a broken asset is
    // the same size as a working one.
    expect(mr).toContain('data-testid="mr-card-art-fallback"');
  });

  it("reserves the media band's box before the asset decides anything", () => {
    const band = read("components/question-surface/ScenarioMediaBand.tsx");
    // The band's height comes from a declared aspect ratio plus explicit
    // bounds — never from the intrinsic size of what it is showing. A 64x64
    // and a 1920x1080 asset produce the same box, and it exists before either
    // has loaded.
    //
    // QV1 Step 3B made the ratio a TOKEN with the preset as its fallback, so
    // the Ranked desktop can widen the competitive band without widening it on
    // a phone. The PROPERTY this asserts is unchanged and is the one that
    // matters: the box is declared, it names this preset, and nothing about it
    // is derived from the asset. A caller that sets no token still gets
    // `BAND_ASPECT[aspect]` exactly.
    expect(band).toContain("aspectRatio: `var(--qs-band-aspect-${aspect}, ${BAND_ASPECT[aspect]})`");
    expect(band).toContain("containerType: \"size\"");
    expect(band).toContain("overflow-hidden");
  });
});

describe("nothing inside the card was made smaller to fit it", () => {
  it("caps the cinematic band at the region, bounded by the region's box", () => {
    // `--qs-media-max` is still the ONLY thing the stage says to the band, and
    // it still says the region's own reserved height — 16rem, the tallest that
    // band reaches at any supported width, unchanged. What it now also says is
    // "and never more than the box you are in", which is what lets the band
    // scale down with the locked region instead of pinning it open.
    for (const width of [1024, 1280, 1512]) {
      expect(tokensAt(width)["--qs-media-h"], `at ${width}px`).toBe("16rem");
      expect(tokensAt(width)["--qs-media-max"], `at ${width}px`)
        .toBe("min(16rem, 100%)");
    }
  });

  it("keeps the prompt's own type scale, and steps it only by width", () => {
    // THE INVARIANT: the reserve is a box, and it never restyles what goes in
    // it. The prompt's size is declared here, on its own, by WIDTH — never
    // derived from a reserve, a viewport height, or what the round contains.
    //
    // QV1 Step 3B added one step to that ladder (19px from `lg`, 21px on the
    // wide stage) and left the base alone, which is why the base assertion is
    // untouched: the base is the PHONE's size as well, and a phone must keep
    // the type it had. `line-height` stays the unitless ratio so the leading
    // follows the type instead of being re-declared per step.
    expect(CSS).toMatch(
      /\[data-testid="scenario-surface"\] > header h2 \{\s*font-size: 1\.125rem;\s*line-height: 1\.45;/);
    expect(CSS).toMatch(
      /min-width: 1024px\)\s*\{[\s\S]{0,220}> header h2 \{\s*font-size: 1\.1875rem;/);
    expect(CSS).toMatch(/min-width: 1500px[\s\S]{0,220}> header h2 \{\s*font-size: 1\.3125rem;/);
    // And no step may be keyed on HEIGHT: a prompt that changed size when the
    // window got shorter would be the arena re-flowing the question to fit,
    // which is the one thing the lock's compression order forbids.
    const ladder = [...CSS.matchAll(
      /@media ([^{]*)\{\s*\.ranked-academy \.ranked-folio \[data-testid="scenario-surface"\] > header h2/g)];
    expect(ladder.length).toBeGreaterThan(0);
    for (const m of ladder) expect(m[1]).not.toMatch(/height/);
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
    // The 2-up rule is a statement about CONTENT SHAPE, and that is what this
    // pins: a label-length bound every option must satisfy, plus a minimum
    // option count. The stage reserves room for the grid; it does not
    // rearrange it, and it never selects a layout per question id or family.
    //
    // QV1 Step 2B moved the bound 44 -> 56. It is not frozen here as a number
    // for its own sake — the number is measured, and the measurement is in the
    // component's own note — but the SHAPE of the rule is frozen: one
    // `every(...)` over label length, and nothing question-specific.
    expect(surface).toMatch(/o\.label\.length <= \d+/);
    expect(surface).toContain("o.label.length <= 56");
    expect(surface).toContain("question.options.length >= 4");
    // No identity may reach this decision.
    const rule = surface.slice(surface.indexOf("const wideTwoColumn"),
      surface.indexOf("return (", surface.indexOf("const wideTwoColumn")));
    expect(rule).not.toMatch(/questionId|category|question_key|family/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QV1 — WIDE-DESKTOP TIER, AS RE-CUT BY VISCONT1.
//
// QV1 gave very wide, tall-enough desktops ((min-width: 1600px) and
// (min-height: 780px)) bigger art, a bigger prompt and more answer air. The
// art was addressed to the RICH band profiles only — a 19rem media region for
// cinematic/family, 16rem for compact — and that is exactly what made two
// consecutive rounds at 1880x900 put their prompt and answers in different
// places inside an unmoving card (measured: −27.6px art top, +20.4px prompt
// and answers, rich vs compact). VISCONT1 keeps every QV1 number and moves the
// media one to where it belongs: the stage's own allocation, the same for
// every round at this viewport.
// ───────────────────────────────────────────────────────────────────────────
describe("the wide-desktop tier is one allocation for every round", () => {
  const css = () => stripComments(CSS);

  const wideBlock = () => {
    const src = css();
    const re = /@media\s*\(min-width:\s*1600px\)\s*and\s*\(min-height:\s*780px\)\s*\{([\s\S]*?)\n\}/;
    const m = re.exec(src);
    expect(m, "the (min-width: 1600px) and (min-height: 780px) media query is missing").not.toBeNull();
    return m![1];
  };

  it("declares the (min-width: 1600px) and (min-height: 780px) media query", () => {
    expect(wideBlock().length).toBeGreaterThan(0);
  });

  it("names no band profile — the allocation is the viewport's, not the round's", () => {
    expect(wideBlock()).not.toMatch(/data-band=/);
  });

  it("keeps QV1's 19rem of art, as the stage's media allocation", () => {
    // The owner-approved 19rem is unchanged; it is now the RESERVE every round
    // gets, and the band's ceiling (what the band reads) moves with it.
    const body = wideBlock();
    const stage = /(?:^|\})\s*\.ranked-question-stage\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
    expect(stage).toMatch(/--qs-media-h:\s*19rem/);
    expect(stage).toMatch(/--qs-media-max:\s*min\(19rem,\s*100%\)/);
    // And re-asserts the hero ceiling above the <=860px compaction cap.
    expect(body).toMatch(/\[data-testid="scenario-hero"\]\s*\{\s*max-height:\s*min\(19rem,\s*100%\)\s*!important/);
  });

  it("gives the 861px tier its 17.25rem the same way", () => {
    const src = css();
    const re = /@media\s*\(min-width:\s*1024px\)\s*and\s*\(min-height:\s*861px\)\s*\{([\s\S]*?)\n\}/g;
    let body: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m[1].includes("--qs-media-h")) { body = m[1]; break; }
    }
    expect(body, "the (min-width: 1024px) and (min-height: 861px) media allocation is missing").not.toBeNull();
    expect(body).not.toMatch(/data-band=/);
    expect(body).toMatch(/--qs-media-h:\s*17\.25rem/);
    expect(body).toMatch(/--qs-media-max:\s*min\(17\.25rem,\s*100%\)/);
  });

  it("pays for its type and air in the reserves it spends them in", () => {
    // QV1's wide design steps the prompt to 1.5rem/1.35 and gives the tablets
    // 1.125rem of vertical padding. Both are kept. What changed is that they
    // are now PAID FOR: four lines of 24px prompt (the bank's 188-character
    // maximum and the RA7 fixture both take four here) are 148.6px with the
    // category line, against an inherited 136px reserve, and a 2x2 grid of
    // option-media tablets at 18px is 142px against 120px. A prompt or a grid
    // that outgrows its region moves what is below it, so the tier sets its own.
    const body = wideBlock();
    expect(body).toMatch(/header h2\s*\{\s*font-size:\s*1\.5rem;\s*line-height:\s*1\.35;\s*\}/);
    expect(body.match(/font-size/g)).toHaveLength(1);
    expect(body).toMatch(/\[data-quiz-choice\]\s*\{\s*padding-top:\s*1\.125rem;\s*padding-bottom:\s*1\.125rem;\s*\}/);
    const stage = /(?:^|\})\s*\.ranked-question-stage\s*\{([^}]*)\}/.exec(body)?.[1] ?? "";
    const rem = (name: string) => Number(new RegExp(`${name}:\\s*([\\d.]+)rem`).exec(stage)?.[1]) * 16;
    expect(rem("--qs-prompt-h"), "four 24px prompt lines + the category line").toBeGreaterThanOrEqual(148.6);
    expect(rem("--qs-answers-h"), "a 2x2 option-media grid at 18px padding").toBeGreaterThanOrEqual(142);
    // Still tokens, never region rules: the regions read the tokens.
    expect(body).not.toMatch(/data-surface-region="prompt"/);
    expect(body).not.toMatch(/data-surface-region="answers"/);
  });
});

describe("the stage reserves, and never clips or scrolls", () => {
  const block = () => {
    const css = stripComments(CSS);
    const start = css.indexOf(".ranked-question-stage");
    const end = css.indexOf('[data-surface-region="answers"]');
    return css.slice(start, css.indexOf("}", end) + 1);
  };

  it("keeps the three regions as reserves, and never scrolls one", () => {
    // The arena's standing rule is that no surface inside it scrolls
    // internally. That is unchanged and is what `overflow` is checked for.
    //
    // What DID change: the media region now also declares a `height` under the
    // lock, and that is not the hard `height` this test was written against.
    // It is paired with `min-height: 0`, which is what makes it a SHRINKABLE
    // preferred size rather than a fixed box — the region gives its height
    // back to the locked stage instead of pinning it open. The two text
    // regions keep their floors and are not shrinkable at all.
    const src = block();
    expect(src).toContain("min-height: var(--qs-media-h, 0px)");
    expect(src).toContain("min-height: var(--qs-prompt-h, 0px)");
    expect(src).toContain("min-height: var(--qs-answers-h, 0px)");
    expect(src).not.toMatch(/overflow/);
    const css = stripComments(CSS);
    const media = /\.ranked-question-stage \.question-surface-stack > \[data-surface-region="media"\] \{([^}]*)\}/
      .exec(css)?.[1] ?? "";
    expect(media).toMatch(/height:\s*var\(--qs-media-h, 0px\)/);
    expect(media).toMatch(/min-height:\s*0/);
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
            latest_resolved_round: null, result: null },
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

// DCMOD integration: the DC2 Daily adapter these two suites were built on is
// retired — every Daily stage is now a hosted canonical Ranked match, so the
// Daily inherits the stage by BEING a Ranked match. Meta Reflex's footprint is
// covered through QuizRankedMatch (bottomInvariant / metaReflex suites).

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

  it("the status line charges NO idle height, and still cannot move anything", () => {
    // THE RESERVE IS GONE, AND SO IS THE REASON FOR IT.
    // A two-line box was held for the whole match so a transient string could
    // never move the arena when it appeared. Right instinct, wrong price: the
    // box was empty for most of every round, and on a shell locked to the
    // viewport an always-empty box is height taken from the question.
    //
    // Out of flow buys the same property for nothing: an absolutely positioned
    // line cannot move a sibling whether it is empty, one line or two.
    const src = arena();
    expect(src).not.toContain("min-h-[2rem]");
    expect(src).toContain("pointer-events-none absolute left-0 right-28 top-0 line-clamp-2");
    // The row that carries it is still mounted for the whole match — it holds
    // the quiet control — so the overlay always has a stable anchor.
    expect(src).toContain('<div className="relative flex items-start justify-end gap-3 px-1">');
    // And the idle copy is gone: the tablets are the only interactive thing on
    // screen, so an instruction to click one was telling a player what they
    // were already doing.
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx"))
      .not.toContain("Choose an answer to lock it in.");
  });

  it("the round-resolution beat still cannot grow the strip", () => {
    // It is `hidden md:flex` and a fixed plate; a wrapping beat used to push
    // everything below it down by a row.
    expect(arena()).toContain('className="hidden md:flex"');
  });

  it("the timeline is still the arena's floor, mounted unconditionally", () => {
    // RG1 made the timeline one of the shell's three `shrink-0` chrome bands,
    // so it carries a class now. It is still mounted unconditionally, which is
    // the property this pins.
    expect(arena()).toContain(
      '{timeline && <RoundTimeline timeline={timeline} className="lg:shrink-0" />}');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE SHRINK CHAIN — the lock's constraint has to REACH the art.
//
// The viewport lock gives `.ranked-question-stage` a definite height and asks
// one region, the media, to absorb whatever the screen cannot pay for. That is
// a chain, and a chain is only as good as its weakest link: every element
// between the stage and the surface has to pass the constraint down.
//
// It broke exactly once, and silently. The `my-auto` centring wrapper was a
// plain block with `min-height: auto`, so (a) the surface inside it was not a
// flex item and the `flex: 1 1 auto; min-height: 0` the stylesheet gives
// `.question-surface-stack` was inert, and (b) as a flex item itself it refused
// to shrink below its content's automatic minimum — which, because the prompt
// and answers are deliberately `flex: 0 0 auto`, was the whole un-shrunk card.
// The wrapper therefore held its intrinsic height inside a stage that had
// already been locked shorter, and `.ranked-panel`'s `overflow: hidden` cut the
// difference off the bottom. Measured at 1280x720: stage 433px, wrapper 540px,
// and all four answer tablets outside the card. `pageScroll` was 0 throughout,
// which is why nothing that watched for scrolling noticed.
//
// jsdom performs no layout, so this cannot be asserted as a pixel here (the
// real-browser measurement lives in `e2e/ranked-arena-fit.spec.ts`). What CAN
// be asserted, and is the thing a future edit would actually get wrong, is the
// STRUCTURE: no element on the path from the stage to the question may be a
// plain block, and none may keep its automatic minimum height.
// ───────────────────────────────────────────────────────────────────────────

describe("the lock's constraint reaches the region that yields", () => {
  const arenaSrc = () => read("components/ranked-arena/CanonicalArena.tsx");

  /** Every `className` on the path from the locked stage down to `<Viewport`. */
  function wrappersBetweenStageAndQuestion(): string[] {
    const src = arenaSrc();
    const start = src.indexOf("ranked-question-stage");
    expect(start, "the stage class is gone from CanonicalArena").toBeGreaterThan(-1);
    const end = src.indexOf("<Viewport", start);
    expect(end, "the Viewport is no longer inside the stage").toBeGreaterThan(start);
    const slice = src.slice(start, end);
    // Both spellings the file uses: className="…" and className={`…`}.
    return [
      ...[...slice.matchAll(/className="([^"]*)"/g)].map((m) => m[1]),
      ...[...slice.matchAll(/className=\{`([^`]*)`/g)].map((m) => m[1]),
    ];
  }

  it("gives every wrapper between the stage and the question a flex display", () => {
    // A plain block in this chain is not a flex CONTAINER, so whatever it
    // holds stops being a flex item — and the stylesheet's instruction to the
    // surface stops applying. This is half of the original defect.
    for (const cls of wrappersBetweenStageAndQuestion()) {
      expect(cls, `a wrapper inside the locked stage is not a flex container: "${cls}"`)
        .toMatch(/\blg:(flex|grid)\b/);
    }
  });

  it("lets every wrapper between the stage and the question shrink", () => {
    // `min-height: auto` is a flex item's automatic minimum size — its content's
    // min-content height. The prompt and the answers are `flex: 0 0 auto` by
    // design, so that minimum is the entire un-shrunk card and the item simply
    // refuses to yield. This is the other half.
    for (const cls of wrappersBetweenStageAndQuestion()) {
      expect(cls, `a wrapper inside the locked stage cannot shrink: "${cls}"`)
        .toMatch(/\blg:min-h-0\b/);
    }
  });

  it("keeps the centring an auto MARGIN, not a grown box", () => {
    // `my-auto` is what centres a question in a card taller than it, and it is
    // load-bearing precisely because auto margins resolve to zero the instant
    // there is no free space — which is the state a short viewport is in. A
    // wrapper that GREW instead (`flex-1`) would fill the card and strand the
    // question at the top of it, and `justify-center` would push the first
    // lines of a long prompt out of the top of the card rather than the last
    // answers out of the bottom. Neither is an improvement on the other.
    const chain = wrappersBetweenStageAndQuestion();
    const centring = chain.filter((c) => /\blg:my-auto\b/.test(c));
    expect(centring, "nothing centres the question inside the card any more")
      .toHaveLength(1);
    expect(centring[0]).not.toMatch(/\blg:flex-1\b/);
    expect(centring[0]).not.toMatch(/justify-center/);
  });

  it("still asks the MEDIA to yield, and only the media", () => {
    // The compression order, restated where the chain is checked: if a future
    // edit made the prompt or the answers shrinkable, the chain would "work"
    // and the question would get smaller instead of the art. That is the one
    // outcome the lock exists to prevent.
    const block = stripComments(CSS);
    const media = /\.ranked-question-stage \.question-surface-stack > \[data-surface-region="media"\]\s*\{([^}]*)\}/
      .exec(block)?.[1] ?? "";
    expect(media).toMatch(/flex:\s*0\s+1\s+auto/);
    expect(media).toMatch(/min-height:\s*0/);
    const text = /\.ranked-question-stage \.question-surface-stack > \[data-surface-region="prompt"\],\s*\.ranked-question-stage \.question-surface-stack > \[data-surface-region="answers"\]\s*\{([^}]*)\}/
      .exec(block)?.[1] ?? "";
    expect(text, "the prompt and the answers must not be shrinkable").toMatch(/flex:\s*0\s+0\s+auto/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QV1 Step 3B — the enlargement, and the two things that keep it honest.
//
// The card was made modestly larger: a wider cinematic ratio, one more pixel
// on the prompt and the answer label, and two more on the tablet's padding.
// Two properties make that safe rather than merely bigger, and neither is
// visible in a screenshot, so both are pinned here.
//
//   1. IT IS ONE ALLOCATION PER VIEWPORT (VISCONT1). QV1 addressed the extra
//      media height to `data-band` — cinematic and family — so that a compact
//      plate would not grow with it. That bought a sparse card 0px and cost
//      the arena its continuity: the rich region was 48px taller than the
//      compact one at 1880x900, so the prompt and the answers sat in a
//      different place on every rich/compact change (−27.6px art top, +20.4px
//      prompt and answers) inside a card and a rail that never moved, which is
//      all ARENA1's test could see. The extra height is now the stage's own
//      `--qs-media-h` for every round at that viewport; the rich art keeps all
//      of it, and the compact plate fills the same box (it always grew into
//      its region — RR1). The guard below is the structural half: no rule
//      keyed on a band profile may size anything.
//   2. THE AIR IS GATED ON HEIGHT. Padding costs the media region directly, and
//      on a short screen the region is already the thing paying for the fit.
//      Measured at 1024x768 on the tallest real answer block, ungated padding
//      drove the band from 68px to 19px — no clipping, no scroll, just a card
//      that quietly stopped having a picture.
// ───────────────────────────────────────────────────────────────────────────

// A media PRELUDE, evaluated. The rules below are not all `min-width and up`
// any more, so a regex can pin the text but cannot pin the BEHAVIOUR — and the
// behaviour is what the product decision was about. This is the smallest
// evaluator that covers the two features these rules use (`min-width`,
// `min-height`) and the comma that ORs a list together.
function mediaListMatches(prelude: string, width: number, height: number): boolean {
  return prelude.split(",").some((arm) => {
    const features = [...arm.matchAll(/\(\s*(min-width|min-height)\s*:\s*(\d+)px\s*\)/g)];
    if (features.length === 0) return false;
    return features.every(([, feature, px]) =>
      feature === "min-width" ? width >= Number(px) : height >= Number(px));
  });
}

/** The prelude guarding the Ranked answer label's font-size step, or null. */
function answerFontPrelude(): string | null {
  const m = /@media ([^{]*)\{\s*\.ranked-academy \[data-answers-state\] \[data-quiz-choice\]\s*\{\s*font-size:\s*0\.9375rem/
    .exec(stripComments(CSS));
  return m ? m[1] : null;
}

/** Every prelude guarding a QV1 type step — the prompt's and the answer's. */
function typeStepPreludes(): string[] {
  const css = stripComments(CSS);
  const re = /@media ([^{]*)\{\s*\.ranked-academy (?:\.ranked-folio \[data-testid="scenario-surface"\] > header h2|\[data-answers-state\] \[data-quiz-choice\]\s*\{\s*font-size)/g;
  return [...css.matchAll(re)].map((m) => m[1]);
}

describe("QV1 Step 3B — the enlargement, as one allocation per viewport", () => {
  const css = () => stripComments(CSS);

  it("addresses the extra media height to the reserve, never to a band profile", () => {
    // The width ladder is unchanged — 16rem from `lg` …
    for (const width of [1024, 1280, 1512]) {
      expect(tokensAt(width)["--qs-media-h"], `at ${width}px`).toBe("16rem");
    }
    // … and the height-gated steps raise the SAME token, on the stage.
    expect(css()).toMatch(
      /@media \(min-width: 1024px\) and \(min-height: 861px\)\s*\{\s*\.ranked-question-stage\s*\{[^}]*--qs-media-h:\s*17\.25rem/);
    // The QV1 mechanism is gone: no token of its own, no per-profile height.
    expect(css()).not.toContain("--qs-media-rich");
  });

  it("lets no rule keyed on a band profile size anything (VISCONT1 guard)", () => {
    // THE STRUCTURAL HALF OF THE CONTINUITY CONTRACT. `data-band` says WHICH
    // presentation a round drew; a rule that reads it to set a size is a rule
    // that makes two consecutive rounds different heights inside the card —
    // which is exactly the defect VISCONT1 removed. Anything a profile may
    // legitimately change (the RS2 sliver suppression is a size CONTAINER, not
    // a size) has to be expressed without a box property.
    const BOX = /(?:^|[\s;{])(?:(?:min-|max-)?(?:height|width)|flex(?:-basis|-grow|-shrink)?|padding[\w-]*|margin[\w-]*|gap|--qs-[\w-]+|inset|top|bottom)\s*:/;
    const rules = [...css().matchAll(/([^{}]*\[data-band=[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length, "the guard found nothing to check").toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      expect(body, `"${selector.trim()}" sizes a band profile`).not.toMatch(BOX);
    }
  });

  it("never names the compact profile in a sizing rule", () => {
    // The negative half of the same rule, and the one a future edit would get
    // wrong: a sparse plate must not be enlarged by anything QV1 does.
    const sizing = [...css().matchAll(/\[data-band="compact"\][^{]*\{([^}]*)\}/g)];
    for (const m of sizing) {
      expect(m[1], "a compact band is being sized by a QV1 rule")
        .not.toMatch(/height|font-size|padding/);
    }
  });

  it("gates the rich media step and the answer padding on the same height seam", () => {
    // Both steps are spent out of the same budget, so they arrive together or
    // not at all — and 861px is the far side of the RG1 compaction's own
    // `max-height: 860px`, so the two can never both apply.
    const rich = /@media \(min-width: 1024px\) and \(min-height: 861px\)\s*\{[\s\S]*?--qs-media-h/
      .exec(css());
    expect(rich, "the media step is not height-gated").not.toBeNull();
    const pad = /@media \(min-width: 1024px\) and \(min-height: 861px\)\s*\{\s*\.ranked-academy \[data-answers-state\] \[data-quiz-choice\]\s*\{([^}]*)\}/
      .exec(css());
    expect(pad, "the answer padding step is not height-gated").not.toBeNull();
    expect(pad![1]).toMatch(/padding-top:\s*0\.875rem/);
    expect(pad![1]).toMatch(/padding-bottom:\s*0\.875rem/);
  });

  it("keeps every type step behind `lg`, so a phone is untouched", () => {
    // Below `lg` the arena stacks into a column that already scrolls; growing
    // its type buys nothing and costs scroll length. Measured ungated: +10px of
    // band and +25 to +73px of page on a phone.
    //
    // The answer label's own gate is stricter than `lg` and is pinned in the
    // test below; all that is asserted here is the floor every step shares.
    for (const prelude of typeStepPreludes()) {
      expect(prelude, "a QV1 type step reaches below `lg`").toMatch(/min-width:\s*(?:10[2-9]\d|1[1-9]\d\d|[2-9]\d{3})px/);
    }
    // The band's ratio override likewise.
    expect(css()).toMatch(
      /@media \(min-width: 1024px\)\s*\{\s*\.ranked-question-stage \{ --qs-band-aspect-band: 16 \/ 7\.5; \}/);
  });

  it("spends the answer label's extra pixel only where a stage can afford it", () => {
    // THE RULE, EXACTLY. 15px is not simply `lg and up`. 1024x768 is the one
    // supported desktop that is both the narrowest stage AND a short one, so
    // a 60-character answer goes single-column — four tall tablets — at the
    // same moment the media region is the only term still yielding. Measured
    // there, the pixel alone (padding already gated off) took the cinematic
    // band from 68px to 35px. So the step is spent on a stage wide enough to
    // keep a long answer 2-up, OR tall enough that media is not paying last.
    const prelude = answerFontPrelude();
    expect(prelude, "the answer type rule is gone").not.toBeNull();
    // Two arms, comma-joined: a width arm, and the same height seam the
    // padding step uses. Neither arm may drop below `lg`.
    expect(prelude!.replace(/\s+/g, " ").trim())
      .toBe("(min-width: 1200px), (min-width: 1024px) and (min-height: 861px)");

    // And the behaviour that rule is FOR, evaluated at the measured matrix.
    // 1024x768 is the only entry that must come back to the 14px it had.
    const at = (w: number, h: number) => (mediaListMatches(prelude!, w, h) ? 15 : 14);
    expect(at(1920, 1080)).toBe(15);
    expect(at(1440, 900)).toBe(15);
    expect(at(1366, 768)).toBe(15);   // width arm
    expect(at(1280, 720)).toBe(15);   // width arm
    expect(at(1280, 600)).toBe(15);   // width arm
    expect(at(1024, 900)).toBe(15);   // height arm
    expect(at(1024, 768)).toBe(14);   // neither arm — the picture keeps its 68px
    expect(at(390, 844)).toBe(14);    // a phone is never in scope
  });

  it("leaves the tablet's own box in the component, unchanged", () => {
    // The Ranked-only steps are stylesheet-side on purpose: the shared grid is
    // still the plain quiz grid for every other caller, and QV1 must not have
    // reached into it.
    const grid = read("components/quiz/QuizAnswerOptions.tsx");
    expect(grid).toContain("py-3 px-4");
    expect(grid).toContain("whitespace-normal");
    expect(grid).toContain("text-sm leading-relaxed");
    // Nothing Ranked-shaped leaked into the shared component.
    expect(grid).not.toMatch(/ranked-academy|--qs-/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VISCONT1 — THE RESERVE IS WHAT IS SEATED, NOT THE CONTENT.
//
// Locking the outer card (ARENA1) did not lock what is inside it. The question
// was centred in the card with `my-auto`, i.e. on its CONTENT height, so every
// round whose content was a different height — a taller media region, an
// option-media grid, a four-line prompt, the reveal's evidence line — moved
// the art, the prompt and the answers by half the difference while the folio
// and the Module Rail stood still. The contract this block pins:
//
//   * one media allocation per viewport (`--qs-media-h`), for every profile;
//   * the stack is seated by its RESERVE: a spacer of
//     `(body − --qs-stack-h) / 2` above it, so content that outgrows a region
//     extends downward into the room below instead of re-centring the card;
//   * the reveal's evidence line has a reserved slot (the SC-RENAME3 pattern);
//   * the phone, which centres the question in a screen-tall folio (RMOB2),
//     gets the smallest allocation that makes that centring constant.
//
// The browser half is `e2e/ranked-visual-continuity.spec.ts`.
// ───────────────────────────────────────────────────────────────────────────

/** Every `.ranked-question-stage` token rule with the @media preludes around it. */
function stageTokenRules(): { preludes: string[]; selector: string; body: string }[] {
  const css = stripComments(CSS);
  const out: { preludes: string[]; selector: string; body: string }[] = [];
  const stack: string[] = [];
  let head = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      const prelude = css.slice(head, i).trim();
      if (prelude.startsWith("@media")) {
        stack.push(prelude.slice(6).trim());
      } else if (prelude.startsWith("@")) {
        stack.push("(min-width: 0px)"); // @supports/@keyframes/@container: transparent here
      } else {
        const close = css.indexOf("}", i);
        if (/^(?:\.ranked-academy\s+)?\.ranked-question-stage$/.test(prelude)) {
          out.push({ preludes: [...stack], selector: prelude, body: css.slice(i + 1, close) });
        }
        i = close;
      }
      head = i + 1;
    } else if (c === "}") {
      stack.pop();
      head = i + 1;
    } else if (c === ";" && stack.length === 0) {
      head = i + 1;
    }
  }
  return out;
}

/** `mediaListMatches`, plus the two `max-` features the compaction uses. */
function mediaMatches(prelude: string, width: number, height: number): boolean {
  return prelude.split(",").some((arm) => {
    const features = [...arm.matchAll(/\(\s*(min-width|min-height|max-width|max-height)\s*:\s*([\d.]+)px\s*\)/g)];
    if (features.length === 0) return false;
    return features.every(([, f, v]) => {
      const n = Number(v);
      return f === "min-width" ? width >= n : f === "min-height" ? height >= n
        : f === "max-width" ? width <= n : height <= n;
    });
  });
}

/** The cascade's answer for the Ranked stage at a viewport (source order). */
function tokensAtViewport(width: number, height: number): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const rule of stageTokenRules()) {
    if (!rule.preludes.every((p) => mediaMatches(p, width, height))) continue;
    for (const decl of rule.body.split(";")) {
      const colon = decl.indexOf(":");
      const prop = decl.slice(0, colon).trim();
      if (prop.startsWith("--qs-")) tokens[prop] = decl.slice(colon + 1).trim();
    }
  }
  return tokens;
}

/**
 * The tallest text each tier DRAWS, measured in Chromium through
 * `/dev/ranked-shell-probe?q=shape` and the shipped fixtures (VISCONT1, second
 * pass). Long text no longer outgrows these boxes — it tightens into them
 * (`textDensity`) — so `prompt` is the tallest prompt block any tier draws at
 * that viewport (four 19px lines + category at the long tier; the dense tier
 * is shorter), and `answers` is the tallest grid any tier draws: normal
 * option-media tablets, the long tier's two-or-three-line 2x2, or the dense
 * tier's three-or-four-line 2x2 for the bank's 76-character labels.
 */
const TIER_MEASURED = [
  { vp: [1024, 768], prompt: 129.2, answers: 155.3 },
  { vp: [1024, 900], prompt: 129.2, answers: 167.5 },
  { vp: [1280, 800], prompt: 129.2, answers: 124 },
  { vp: [1366, 768], prompt: 129.2, answers: 124 },
  { vp: [1440, 900], prompt: 129.2, answers: 126 },
  { vp: [1520, 800], prompt: 110.3, answers: 124 },
  { vp: [1520, 900], prompt: 110.3, answers: 126 },
  { vp: [1600, 780], prompt: 148.6, answers: 142 },
  { vp: [1880, 900], prompt: 148.6, answers: 142 },
] as const;

describe("VISCONT1 — one allocation per viewport, seated by its reserve", () => {
  const css = () => stripComments(CSS);
  const at = (w: number, h: number, name: string) => {
    const t = tokensAtViewport(w, h);
    return t[name] === undefined ? null : px(t[name], t);
  };

  it.each(TIER_MEASURED.map((r) => [`${r.vp[0]}x${r.vp[1]}`, r] as const))(
    "at %s the prompt and answer reserves hold the tallest text any tier draws",
    (_name, r) => {
      const [w, h] = r.vp;
      expect(at(w, h, "--qs-prompt-h")!, "a prompt that outgrows its region moves the answers")
        .toBeGreaterThanOrEqual(r.prompt);
      expect(at(w, h, "--qs-answers-h")!, "ordinary answers outgrow their reserve")
        .toBeGreaterThanOrEqual(r.answers);
    },
  );

  it("gives every round the same media allocation at a viewport", () => {
    expect(at(1280, 800, "--qs-media-h")).toBe(256);
    expect(at(1440, 900, "--qs-media-h")).toBe(276);   // the 861px tier
    expect(at(1600, 779, "--qs-media-h")).toBe(256);   // one pixel short of the wide tier
    expect(at(1600, 780, "--qs-media-h")).toBe(304);   // QV1's 19rem, now for everyone
    expect(at(1880, 900, "--qs-media-h")).toBe(304);
    // The ceiling the band reads always says the allocation, never more.
    for (const [w, h] of [[1280, 800], [1440, 900], [1880, 900]] as const) {
      const t = tokensAtViewport(w, h);
      expect(t["--qs-media-max"], `at ${w}x${h}`).toBe(`min(${t["--qs-media-h"]}, 100%)`);
    }
    // And the region rule reads that token, unconditionally on profile.
    const region = /\.ranked-question-stage \.question-surface-stack > \[data-surface-region="media"\]\s*\{([^}]*)\}/
      .exec(css())?.[1] ?? "";
    expect(region).toMatch(/height:\s*var\(--qs-media-h, 0px\)/);
  });

  it("declares the stack reserve as exactly the regions, their gaps and the feedback slot", () => {
    for (const [w, h] of [[1280, 800], [1880, 900], [1024, 768]] as const) {
      const t = tokensAtViewport(w, h);
      const sum = at(w, h, "--qs-media-h")! + at(w, h, "--qs-prompt-h")!
        + at(w, h, "--qs-answers-h")! + 3 * px(t["--qs-stack-gap"], t)
        + px(t["--qs-feedback-h"], t);
      expect(at(w, h, "--qs-stack-h"), `at ${w}x${h}`).toBeCloseTo(sum, 5);
    }
    // The gap the reserve counts is the gap the stack draws, at every height.
    expect(at(1880, 900, "--qs-stack-gap")).toBe(12);
    expect(at(1280, 800, "--qs-stack-gap")).toBe(8);
    const short = /@media \(min-width: 1024px\) and \(max-height: 860px\)\s*\{[\s\S]*?\n\}/.exec(css())?.[0] ?? "";
    expect(short).toMatch(/\[data-testid="scenario-surface"\]\s*\{\s*gap:\s*0\.5rem;/);
    expect(short).toMatch(/\.ranked-academy \.ranked-question-stage\s*\{\s*--qs-stack-gap:\s*0\.5rem;/);
  });

  it("seats the RESERVE, so a taller round extends downward instead of re-centring", () => {
    const src = css();
    // The spacer: half of what the body has left over the reserve, never less
    // than nothing, and never shrinkable — the art yields first, the top stays.
    expect(src).toMatch(
      /\[data-testid="ranked-question-body"\]:has\(> \* > \.question-surface-stack\)::before\s*\{\s*content:\s*"";\s*flex:\s*0 0 max\(0px, calc\(\(100% - var\(--qs-stack-h\)\) \/ 2\)\);/);
    // The content-centring margin is switched off for the canonical stack only.
    expect(src).toMatch(
      /\[data-testid="ranked-question-body"\] > :has\(> \.question-surface-stack\)\s*\{\s*margin-top:\s*0;/);
    // `my-auto` itself is untouched in the arena: every OTHER viewport (Meta
    // Reflex, Order Forge, Mastery, Journey) still centres exactly as before.
    expect(read("components/ranked-arena/CanonicalArena.tsx"))
      .toContain('className="lg:my-auto lg:w-full lg:flex lg:min-h-0 lg:flex-col"');
  });

  it("holds the reveal's evidence slot while nothing fills it", () => {
    // The SC-RENAME3 pattern: a conditional line gets a fixed slot, so the
    // round settling cannot move what is above it — sized for the LONGEST
    // statement the beat carries (96 characters): two `text-xs leading-snug`
    // lines under 1500px wide, where 96 characters wrap, one from 1500.
    const src = css();
    expect(src).toMatch(/\.ranked-question-stage\s*\{\s*--qs-feedback-h:\s*calc\(0\.75rem \* 1\.375 \* 2\);/);
    expect(at(1280, 800, "--qs-feedback-h")).toBeCloseTo(33, 5);
    expect(at(1520, 800, "--qs-feedback-h")).toBeCloseTo(16.5, 5);
    // The line that replaces it takes exactly the slot, however many lines it
    // draws — a short statement must not shorten a centred phone card.
    expect(src).toMatch(
      /> \* > \.question-surface-stack > \[data-testid="answer-evidence"\]\s*\{\s*min-height:\s*var\(--qs-feedback-h\);/);
    // And it is never given back: the first pass's phone give-backs are gone.
    expect(src).not.toMatch(/question-surface-stack[^{]*::after\s*\{\s*display:\s*none/);
    expect(src).toMatch(
      /> \* > \.question-surface-stack:not\(:has\(> \[data-surface-region="answers"\] ~ :not\(\.question-motif-layer\)\)\)::after\s*\{\s*content:\s*"";\s*flex:\s*0 0 var\(--qs-feedback-h\);/);
    expect(read("components/question-feedback/EvidenceLine.tsx"))
      .toContain("text-xs font-semibold leading-snug");
  });

  it("reaches the canonical quiz stack only — never Journey, Meta Reflex or Mastery", () => {
    // Every VISCONT1 selector goes through `body > * > stack`, the depth at
    // which the quiz Viewport renders its surface. Journey's stack is inside
    // `.journey-viewport`, and Meta Reflex/Mastery render no three-region
    // stack, so none of them is matched; the Journey board keeps its own
    // top-anchored contract (JOURNEY-UI3).
    const selectors = [...css().matchAll(/([^{}]*ranked-question-body"\][^{}]*)\{/g)]
      .map((m) => m[1].trim())
      .filter((s) => s.includes("question-surface-stack"));
    // The seating, the slot and its evidence line, the reveal-icon edge, the
    // text-density tiers (desktop, the 1024 prompt step, phone) and the phone
    // allocation — every one through the canonical stack.
    expect(selectors.length).toBeGreaterThanOrEqual(15);
    for (const s of selectors) {
      expect(s).toMatch(/> \* > \.question-surface-stack|> :has\(> \.question-surface-stack\)/);
      expect(s).not.toMatch(/journey/);
    }
  });

  it("gives the phone the smallest allocation that makes its centring constant", () => {
    // RMOB2 centres the question in a screen-tall phone folio, on its content
    // height — so a 64px plate vs a 121px cinematic band, two vs four tablets,
    // or a one-line vs a four-line prompt each re-centred everything (measured
    // at 375x812: the answer grid ranged 361–466px). The fix is to make the
    // thing being centred a constant: the cinematic band's own height (16/5.75
    // capped at 7.5rem), a four-line prompt with its category line (the
    // bank's p95), and four single-line tablets. Set on the STACK, not the
    // folio, so the stage's `min-height` arithmetic below `lg` still sees no
    // tokens. FIXED on every phone: long text tightens inside these boxes
    // (see the text-density block below) instead of the boxes giving room back.
    const phone = /@media \(max-width: 1023\.98px\)\s*\{[\s\S]*?\.ranked-shell\[data-phone-arena="true"\] \[data-testid="ranked-question-body"\] > \* > \.question-surface-stack\s*\{([^}]*)\}/
      .exec(css())?.[1] ?? "";
    expect(phone).toMatch(/--qs-media-h:\s*7\.75rem/);
    expect(phone).toMatch(/--qs-prompt-h:\s*7\.75rem/);
    expect(phone).toMatch(/--qs-answers-h:\s*13\.125rem/);
    // 124 + 8 + 124 + 8 + 210 + 8 + 33 = 515px: inside the 360x740 folio
    // (~528px of content box), so a round still never scrolls the phone.
    expect(tokenPx(500, "--qs-media-h")).toBeNull();
    // No phone prompt step-down any more: one box on every phone.
    expect(css()).not.toMatch(/--qs-prompt-h:\s*6\.125rem/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VISCONT1 — TEXT DENSITY: CONTENT ADAPTS TO THE ARENA.
//
// The first pass left long text outgrowing fixed boxes (desktop p99/extreme
// labels −38px, phone prompts past four lines 25.7px, phone reveals ~12px).
// The second pass makes that text tighten INSIDE its box: `textDensity`
// classifies the prompt and the longest label before layout, from public text,
// and the canonical stage's stylesheet gives each tier its type. The browser
// half — every tier holding every anchor at zero — is the continuity spec.
// ───────────────────────────────────────────────────────────────────────────
describe("VISCONT1 — long text tightens inside its box", () => {
  const css = () => stripComments(CSS);
  const rulesFor = (attr: string) => [...css().matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter((m) => m[1].includes(attr));
  const remPx = (v: string) => (v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v));

  it("publishes both tiers from public text, before layout", () => {
    expect(read("components/ranked-arena/AnswerGrid.tsx"))
      .toContain("data-answer-density={answerDensity(options.map((o) => o.label))}");
    expect(read("components/question-surface/InteractiveScenarioSurface.tsx"))
      .toContain("data-prompt-density={promptDensity(question.prompt)}");
    // Content shape only: no measurement, no identity.
    const density = codeOnly(read("lib/question-surface/textDensity.ts"));
    expect(density).not.toMatch(/ResizeObserver|getBoundingClientRect|questionId|category|family/);
  });

  it("never draws a tier below its readable floor", () => {
    const answerRules = rulesFor('data-answer-density="');
    const promptRules = rulesFor('data-prompt-density="');
    expect(answerRules.length).toBeGreaterThanOrEqual(4);
    expect(promptRules.length).toBeGreaterThanOrEqual(3);
    for (const [, sel, body] of answerRules) {
      const fs = /font-size:\s*([\d.]+(?:rem|px))/.exec(body)?.[1];
      if (fs) expect(remPx(fs), `answer floor in "${sel.trim()}"`).toBeGreaterThanOrEqual(12);
    }
    for (const [, sel, body] of promptRules) {
      const fs = /font-size:\s*([\d.]+(?:rem|px))/.exec(body)?.[1];
      if (fs) expect(remPx(fs), `prompt floor in "${sel.trim()}"`).toBeGreaterThanOrEqual(15);
    }
  });

  it("scopes every tier to the canonical quiz stack — Journey keeps its tablets", () => {
    for (const [, sel] of [...rulesFor('data-answer-density="'), ...rulesFor('data-prompt-density="')]) {
      expect(sel).toMatch(/\[data-testid="ranked-question-body"\] > \* > \.question-surface-stack/);
      expect(sel).not.toMatch(/journey/);
    }
  });

  it("pays the 1024 tier's larger answer box out of its prompt box, not the art", () => {
    // Dense labels draw four lines in the 1024 column (154px), so the answer
    // box there is 166px; prompts over 150 characters tighten to 16px there,
    // which is what lets the prompt box come down from 158px to 130px. The
    // stage asks for exactly what the first pass asked for.
    expect(tokenPx(1024, "--qs-prompt-h")! + tokenPx(1024, "--qs-answers-h")!).toBe(158 + 138);
    expect(css()).toMatch(
      /@media \(min-width: 1024px\) and \(max-width: 1279\.98px\)\s*\{\s*[^{]*\[data-prompt-density="dense"\] > header h2\s*\{\s*font-size:\s*1rem;/);
  });

  it("draws the reveal's tablet icon out of flow, so a label keeps its width", () => {
    const src = css();
    expect(src).toMatch(/\[data-answers-state\] \[data-quiz-choice\] > svg\s*\{\s*position:\s*absolute;/);
    expect(src).toMatch(
      /> \* > \.question-surface-stack \[data-answers-state\] \[data-quiz-choice\]\s*\{\s*position:\s*relative;\s*padding-right:\s*1\.5rem;/);
  });
});
