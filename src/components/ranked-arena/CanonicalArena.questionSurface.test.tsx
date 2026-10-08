/**
 * PPQ2-A — THE NEUTRAL QUESTION SURFACE.
 *
 * `ArenaSurfaceView` is a tagged union: the Ranked-transport module member
 * every existing producer draws, and `ArenaQuestionSurface` — one
 * server-authoritative question with no match around it. These tests hold the
 * new member to the three things it exists for:
 *
 *   1. it renders inside the SAME canonical stage (same section, same folio,
 *      same three-region footprint, same overlay) through the SAME surface
 *      component the quiz module mounts;
 *   2. it needs, and can carry, no Ranked state — no public round, player,
 *      winner, clock or result beat — and the arena invents none around it;
 *   3. it discloses nothing before the server has graded the question.
 *
 * The module member's own behaviour is held by every existing arena suite,
 * unchanged.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { CanonicalArena } from "./CanonicalArena";
import {
  ReportableQuestionProvider,
  useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
import type { ArenaQuestionSurface, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import {
  DEFAULT_PROBE,
  PROBE_REVEALED_OPTION,
  questionProbeView,
  type QuestionProbeParams,
} from "@/pages/dev/arena-question-probe/questionProbeView";

const ROOT = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const probe = (over: Partial<QuestionProbeParams> = {}, handlers = {}) =>
  questionProbeView({ ...DEFAULT_PROBE, ...over }, {
    leftPanel: <div data-testid="flank-left">left flank</div>,
    rightPanel: <div data-testid="flank-right">right flank</div>,
    ...handlers,
  });

const choiceStates = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-quiz-choice]"))
    .map((el) => el.dataset.choiceState);

describe("the question surface renders in the canonical stage", () => {
  it("mounts inside the one stage section, with its folio skin and footprint", () => {
    render(<CanonicalArena view={probe()} />);
    const stage = screen.getByTestId("ranked-question");
    expect(stage.className).toContain("ranked-panel");
    expect(stage.className).toContain("ranked-folio");
    expect(stage.className).toContain("ranked-question-stage");
    expect(stage.dataset.inputOpen).toBe("true");
    // The canonical three-region grammar the geometry reserves.
    for (const region of ["media", "prompt", "answers"]) {
      expect(stage.querySelector(`[data-surface-region="${region}"]`),
        `missing ${region} region`).not.toBeNull();
    }
    expect(within(stage).getByText(/Probe question:/)).toBeTruthy();
    expect(stage.querySelectorAll("[data-quiz-choice]")).toHaveLength(4);
  });

  it("draws the options in the order given", () => {
    render(<CanonicalArena view={probe({ options: 3 })} />);
    const labels = Array.from(document.querySelectorAll("[data-quiz-choice]"))
      .map((el) => el.textContent ?? "");
    expect(labels[0]).toContain("Probe option A");
    expect(labels[1]).toContain("Probe option B");
    expect(labels[2]).toContain("Probe option C");
  });

  it("hands the chosen option to the mode, and nothing else", () => {
    const onSelectOption = vi.fn();
    render(<CanonicalArena view={probe({}, { onSelectOption })} />);
    fireEvent.click(document.querySelectorAll("[data-quiz-choice]")[2]);
    expect(onSelectOption).toHaveBeenCalledTimes(1);
    expect(onSelectOption.mock.calls[0][0]).toMatchObject({ id: "2", index: 2 });
  });

  it("keeps the shell's status row, as on a quiz round", () => {
    render(<CanonicalArena view={probe()} />);
    expect(screen.getByTestId("submission-status")).toBeTruthy();
  });
});

describe("no Ranked state is required, carried or invented", () => {
  it("renders with no public round, no renderer and no players", () => {
    const view = probe();
    expect(view.surface.kind).toBe("question");
    expect("publicRound" in view.surface).toBe(false);
    expect("renderer" in view.surface).toBe(false);
    render(<CanonicalArena view={view} />);
    // The fail-closed panel is the MODULE member's state, not this one's.
    expect(screen.queryByTestId("ranked-unsupported-module")).toBeNull();
  });

  it("draws panel flanks as given, and no combatant anywhere", () => {
    render(<CanonicalArena view={probe()} />);
    expect(screen.getByTestId("flank-left")).toBeTruthy();
    expect(screen.getByTestId("flank-right")).toBeTruthy();
    expect(screen.queryByTestId("class-portrait")).toBeNull();
    expect(document.querySelector('[data-testid^="hp-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="score-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="mobile-combatant-"]')).toBeNull();
  });

  it("never uses the two-duelist phone composition for panel flanks", () => {
    render(<CanonicalArena view={probe()} />);
    expect(screen.getByTestId("ranked-match").dataset.phoneArena).toBeUndefined();
    expect(screen.queryByTestId("ranked-mobile-bottombar")).toBeNull();
    expect(screen.queryByTestId("mobile-clock")).toBeNull();
    // The header strip stays visible on a phone (no `max-lg:hidden`).
    expect(screen.getByTestId("ranked-header").className).not.toContain("max-lg:hidden");
  });

  it("marks the frame as a stacked phone arena, so its glow cannot overflow", () => {
    render(<CanonicalArena view={probe()} />);
    const frame = screen.getByTestId("quiz-ranked");
    expect(frame.dataset.phoneStacked).toBe("true");
    expect(frame.dataset.phoneArena).toBeUndefined();
    const css = read("index.css");
    const rule = css.indexOf('.ranked-academy[data-phone-stacked="true"]::before');
    expect(rule).toBeGreaterThan(-1);
    // Inside the phone query, next to the duel frame's identical rule.
    const query = css.lastIndexOf("@media (max-width: 1023.98px)", rule);
    expect(css.slice(query, rule)).toContain('.ranked-academy[data-phone-arena="true"]::before');
  });

  it("mounts a panel flank on desktop only", () => {
    render(<CanonicalArena view={probe()} />);
    for (const id of ["flank-left", "flank-right"]) {
      const cell = screen.getByTestId(id).parentElement!;
      expect(cell.className).toContain("hidden");
      expect(cell.className).toContain("lg:block");
    }
  });

  it("shows no clock and no PvP result beat", () => {
    render(<CanonicalArena view={probe({ state: "revealed-correct" })} />);
    expect(screen.queryByTestId("timer-display")).toBeNull();
    expect(screen.queryByTestId("central-result-verdict")).toBeNull();
    expect(screen.getByTestId("ranked-record-window").textContent).toBe("");
    expect(screen.getByTestId("ranked-header-title").textContent).toBe("Question 4 / 10");
  });

  it("reaches the canonical timeline with a known plan and mode-stated verdicts", () => {
    const view = probe();
    expect(view.timeline?.nodes.filter((n) => n.visible)).toHaveLength(10);
    expect(view.timeline?.nodes.slice(0, 3).map((n) => n.outcome))
      .toEqual(["correct", "incorrect", "correct"]);
    render(<CanonicalArena view={view} />);
    expect(screen.getByTestId("ranked-round-timeline")).toBeTruthy();
  });

  it("has no field for a round, a match or a player", () => {
    const surface: ArenaQuestionSurface = probe().surface as ArenaQuestionSurface;
    const withRound = {
      ...surface,
      // @ts-expect-error — the question member cannot be handed a public round.
      publicRound: {},
    } satisfies ArenaQuestionSurface;
    expect(withRound.kind).toBe("question");
  });
});

describe("answer safety", () => {
  it.each(["pre", "selected"] as const)("discloses no correct option before grading (%s)", (state) => {
    const view = probe({ state });
    expect((view.surface as ArenaQuestionSurface).reveal).toBeNull();
    render(<CanonicalArena view={view} />);
    const states = choiceStates();
    expect(states).not.toContain("correct");
    expect(states).not.toContain("incorrect-selected");
  });

  it("resolves the tablets only from the server's reveal", () => {
    render(<CanonicalArena view={probe({ state: "revealed-wrong" })} />);
    const states = choiceStates();
    expect(states[Number(PROBE_REVEALED_OPTION)]).toBe("correct");
    expect(states[0]).toBe("incorrect-selected");
  });
});

describe("the arena reports a question surface itself", () => {
  function Capture({ sink }: { sink: (s: ReportableQuestionSnapshot | null) => void }) {
    sink(useReportableQuestion());
    return null;
  }
  const reported = (view: ArenaViewModel) => {
    let last: ReportableQuestionSnapshot | null = null;
    render(
      <ReportableQuestionProvider>
        <CanonicalArena view={view} />
        <Capture sink={(s) => { last = s; }} />
      </ReportableQuestionProvider>,
    );
    return last as ReportableQuestionSnapshot | null;
  };
  const withReport = (state: QuestionProbeParams["state"]): ArenaViewModel => {
    const view = probe({ state });
    return {
      ...view,
      report: { mode: "Arena probe", category: "Leaguecraft" },
      surface: {
        ...(view.surface as ArenaQuestionSurface),
        reportRef: { sessionId: "probe-session", questionNumber: 4 },
      },
    };
  };

  it("publishes no canonical answer before grading", () => {
    const snap = reported(withReport("pre"));
    expect(snap?.mode).toBe("Arena probe");
    expect(snap?.canonicalAnswer).toBeUndefined();
    expect(snap?.sessionId).toBe("probe-session");
    expect(snap?.roundNumber).toBe(4);
    expect(snap?.matchId).toBeUndefined();
  });

  it("publishes the canonical answer once the server has revealed it", () => {
    const snap = reported(withReport("revealed-wrong"));
    expect(snap?.selectedAnswer).toBe("Probe option A");
    expect(snap?.canonicalAnswer).toBe("Probe option B");
  });

  it("publishes nothing without a report identity", () => {
    expect(reported(probe())).toBeNull();
  });
});

describe("source guards", () => {
  const arena = read("components/ranked-arena/CanonicalArena.tsx");

  it("the arena names no mode", () => {
    expect(arena).not.toMatch(/pro[- ]?play/i);
  });

  it("both surface members end in the same question component", () => {
    expect(arena).toContain("<InteractiveScenarioSurface");
    expect(read("lib/ranked-core/modules/quizModule.tsx")).toContain("<InteractiveScenarioSurface");
  });

  it("the question member's type carries no Ranked transport field", () => {
    const src = read("lib/ranked-core/arenaView.ts");
    const start = src.indexOf("export interface ArenaQuestionSurface");
    const body = src.slice(start, src.indexOf("\n}", start));
    for (const field of ["publicRound", "segmentState", "renderer", "matchId",
      "players", "skewMs", "actions", "winner"]) {
      expect(body, `ArenaQuestionSurface grew ${field}`).not.toMatch(new RegExp(`^\\s+${field}\\??:`, "m"));
    }
  });
});
