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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
import RankedTutorialPage from "@/pages/dev/ranked-tutorial/RankedTutorialPage";
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

/** rem/px arithmetic, with `var(--qs-*, fallback)` resolved from `tokens`. */
function evaluatePx(expression: string, tokens: Record<string, string>): number {
  const resolved = expression.replace(
    /var\(\s*(--qs-[a-z-]+)\s*,\s*([^)]*)\)/g,
    (_all, name: string, fallback: string) => tokens[name] ?? fallback,
  );
  if (/var\(/.test(resolved)) throw new Error(`unresolved var() in "${resolved}"`);
  let total = 0;
  for (const term of resolved.split("+")) {
    const t = term.trim();
    if (!t) continue;
    const rem = /^([\d.]+)rem$/.exec(t);
    const px = /^([\d.]+)px$/.exec(t);
    if (rem) { total += Number(rem[1]) * 16; continue; }
    if (px) { total += Number(px[1]); continue; }
    throw new Error(`unexpected term "${t}" in the stage expression`);
  }
  return total;
}

const stageHeightAt = (width: number) => evaluatePx(stageExpression(), tokensAt(width));
const tokenPx = (width: number, name: string) => {
  const v = tokensAt(width)[name];
  return v === undefined ? null : evaluatePx(v, {});
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
    expect(grid).toContain('"w-full justify-start text-left h-auto py-3 px-4 whitespace-normal font-medium text-sm leading-relaxed"');
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
      join(ROOT, "pages", "dev", "ranked-tutorial"),
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

describe("the Tutorial inherits the stage", () => {
  afterEach(cleanup);

  it("draws its first scripted question on the canonical stage", async () => {
    render(
      <MemoryRouter initialEntries={["/dev/ranked-tutorial"]}>
        <RankedTutorialPage />
      </MemoryRouter>,
    );
    // Step 1 is the timer lesson and has no round at all; the first question
    // arrives on the step after it.
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    });
    await screen.findByTestId("ranked-question");
    stageSection();
    // And no tutorial-only height anywhere near it.
    expect(screen.getByTestId("ranked-question").getAttribute("style")).toBeNull();
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
    expect(arena()).toContain("min-h-[3.5rem]");
  });

  it("the status line keeps its reserved line box", () => {
    expect(arena()).toContain("line-clamp-2 min-h-[2.25rem]");
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
