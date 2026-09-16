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
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain('eyebrow: "Ranked Duel"');
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("opponentVersusLabel");
  });

  it("drops the word MODULE from the progress figure", () => {
    // Third line of a block whose first two lines are the mode and the
    // opponent — the position already says what the number is, so the word was
    // a label on a label.
    const views = read("pages/quiz-ranked/rankedViews.ts");
    expect(views).toContain("`${scoring.moduleNumber} / ${scoring.matchLength}`");
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
    const scoped = css.slice(first, css.indexOf("@keyframes", first));
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

describe("transient state cannot change Match Shell geometry", () => {
  it("has retired the PLAYTEST · PLACEHOLDER notice from Ranked", () => {
    const mode = read("pages/quiz-ranked/QuizRankedMatch.tsx");
    // A build-state fact about the content pipeline, not match news, and the
    // only thing in the strip a player could do nothing with. Ranked publishes
    // none, so the conditional slot renders nothing and costs no height.
    expect(mode).not.toContain("Playtest · Placeholder");
    expect(mode).toContain("playtestNote: null");
    // The SLOT survives, because the Daily Challenge uses it for its theme —
    // deleting it would have taken a real line off another mode's header.
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toContain("header.playtestNote");
    expect(read("pages/quiz-daily-challenge/dailyArenaView.ts")).toContain("playtestNote:");
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
// QV1 — WIDE-DESKTOP MEDIA EXCEPTION.
//
// An additive, media-only exception for very wide desktops: at
// (min-width: 1600px) and (min-height: 780px) the rich media height and
// ceiling (17.25rem, via --qs-media-rich) apply to the cinematic and family
// bands — never compact — in a SEPARATE block from the existing 861px rule,
// which must stay intact and untouched.
// ───────────────────────────────────────────────────────────────────────────
describe("the wide-desktop media exception is additive, not a replacement", () => {
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

  it("targets only the cinematic and family bands, never compact", () => {
    const body = wideBlock();
    expect(body).toContain('data-band="cinematic"');
    expect(body).toContain('data-band="family"');
    expect(body).not.toContain('data-band="compact"');
  });

  it("uses the rich media height, 17.25rem, via --qs-media-rich", () => {
    const body = wideBlock();
    expect(body).toMatch(/height:\s*var\(--qs-media-rich,\s*17\.25rem\)/);
    expect(body).toMatch(/--qs-media-max:\s*min\(var\(--qs-media-rich,\s*17\.25rem\),\s*100%\)/);
  });

  it("leaves the existing 861px rich-media rule fully intact", () => {
    const src = css();
    // There are multiple `(min-width: 1024px) and (min-height: 861px)` blocks
    // in the stylesheet; the one this test defends is specifically the one
    // that carries `--qs-media-rich`, so it is matched by content rather than
    // by taking the first occurrence of the media-query header.
    const re = /@media\s*\(min-width:\s*1024px\)\s*and\s*\(min-height:\s*861px\)\s*\{([\s\S]*?)\n\}/g;
    let body: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m[1].includes("--qs-media-rich")) { body = m[1]; break; }
    }
    expect(body, "the (min-width: 1024px) and (min-height: 861px) rich-media rule is missing").not.toBeNull();
    expect(body).toContain('data-band="cinematic"');
    expect(body).toContain('data-band="family"');
    expect(body).toMatch(/height:\s*var\(--qs-media-rich,\s*17\.25rem\)/);
    expect(body).toMatch(/--qs-media-max:\s*min\(var\(--qs-media-rich,\s*17\.25rem\),\s*100%\)/);
  });

  it("changes no prompt or answer sizing rule", () => {
    // The exception is media-only: it must not appear anywhere near a prompt
    // or answers font-size/padding declaration, and those ladders keep the
    // exact values pinned earlier in this file.
    const body = wideBlock();
    expect(body).not.toMatch(/font-size/);
    expect(body).not.toMatch(/padding/);
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
//   1. IT CANNOT REACH A SPARSE CARD. The extra media height is addressed to
//      `data-band` — cinematic and family — and never to the reserve, because
//      the reserve is also the box a compact plate grows into. Measured on a
//      global token instead: the sparse plate gained 20px at 1920 AND 1440
//      while the cinematic band at 1440 gained nothing at all.
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

describe("QV1 Step 3B — the enlargement reaches rich cards only", () => {
  const css = () => stripComments(CSS);

  it("addresses the extra media height to the band profile, never the reserve", () => {
    // The reserve stays exactly what it was — that is what keeps the footprint.
    for (const width of [1024, 1280, 1512]) {
      expect(tokensAt(width)["--qs-media-h"], `at ${width}px`).toBe("16rem");
    }
    // And the rich allocation names the two profiles that draw real art.
    const rich = /\.question-surface-stack\[data-band="cinematic"\] > \[data-surface-region="media"\],\s*\.ranked-question-stage \.question-surface-stack\[data-band="family"\] > \[data-surface-region="media"\]\s*\{([^}]*)\}/
      .exec(css());
    expect(rich, "the rich media allocation is gone").not.toBeNull();
    expect(rich![1]).toMatch(/height:\s*var\(--qs-media-rich/);
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
    const rich = /@media \(min-width: 1024px\) and \(min-height: 861px\)\s*\{[\s\S]*?--qs-media-rich/
      .exec(css());
    expect(rich, "the rich media step is not height-gated").not.toBeNull();
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
