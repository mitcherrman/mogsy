/**
 * PPQ2-INT — the assembled Pro Play Arena: the REAL PPQ2-B controller, the
 * PPQ2-C pieces and the canonical arena, driven end to end through the
 * deterministic fixture server (real frozen production payloads).
 *
 * What these hold is the integration, not the pieces (each piece has its own
 * suite): one answer path, exactly-once submission, a reveal that waits for
 * Next, the arena as the ONE report publisher, recovery, and completion.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));
vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return { ...actual, useChampionAssets: () => ({ data: null }) };
});

import { TooltipProvider } from "@/components/ui/tooltip";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import {
  useProPlayArenaController,
  type ProPlayArenaController,
  type ProPlayArenaTransport,
} from "@/lib/pro-play/arena";
import {
  ReportableQuestionProvider,
  useReportableQuestion,
} from "@/lib/feedback/reportable-question";
import type { ReportableQuestionSnapshot } from "@/lib/feedback/report-context";
import { createFixtureTransport, DEFAULT_FIXTURE_SET, type FixtureFault } from "@/pages/dev/pro-play-arena/fixtureTransport";
import { readArenaDevParams } from "@/pages/dev/pro-play-arena/ProPlayArenaDev";
import ProPlayArenaRun from "./ProPlayArenaRun";

afterEach(cleanup);

const ROOT = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

type Calls = { start: number; answer: Array<[string, string, string]>; getSession: number };

function spyTransport(inner: ProPlayArenaTransport, calls: Calls): ProPlayArenaTransport {
  return {
    start: () => { calls.start += 1; return inner.start(); },
    getSession: (id) => { calls.getSession += 1; return inner.getSession(id); },
    answer: (id, q, a) => { calls.answer.push([id, q, a]); return inner.answer(id, q, a); },
  };
}

function setup(opts: { keys?: string[]; fault?: FixtureFault } = {}) {
  const calls: Calls = { start: 0, answer: [], getSession: 0 };
  const transport = spyTransport(
    createFixtureTransport({ keys: opts.keys, latencyMs: 0, fault: opts.fault }),
    calls,
  );
  const reports: Array<ReportableQuestionSnapshot | null> = [];
  let controller: ProPlayArenaController | null = null;
  function Sink() {
    reports.push(useReportableQuestion());
    return null;
  }
  function Harness() {
    const c = useProPlayArenaController({ transport, retryDelaysMs: [0, 0], sleep: async () => {} });
    controller = c;
    return <ProPlayArenaRun controller={c} />;
  }
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ReportableQuestionProvider>
          <Harness />
          <Sink />
        </ReportableQuestionProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
  return { calls, reports, controller: () => controller!, lastReport: () => reports[reports.length - 1] ?? null };
}

const phase = () => screen.getByTestId("pro-play-arena").dataset.proPlayPhase;
const tablets = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"));
const states = () => tablets().map((t) => t.dataset.choiceState);
const correctIndex = (key: string) =>
  PRO_PLAY_SAMPLES[key].question.choices.indexOf(PRO_PLAY_SAMPLES[key].result.correct_answer);

async function onQuestion(n: number) {
  await waitFor(() => {
    expect(phase()).toBe("question");
    expect(screen.getByTestId("ranked-header-title").textContent).toContain(`Question ${n} /`);
  });
}

describe("the assembled arena", () => {
  it("puts every PPQ2-C piece in its arena region around the canonical grid", async () => {
    setup();
    await onQuestion(1);
    const stage = screen.getByTestId("ranked-question");
    // Media region: the anchor plate, not the default band.
    const media = stage.querySelector('[data-surface-region="media"]')!;
    expect(media.querySelector("[data-pro-play-plate]")).not.toBeNull();
    // Answers: the canonical buttons, each carrying the PPQ2-C content.
    const first = PRO_PLAY_SAMPLES[DEFAULT_FIXTURE_SET[0]].question;
    expect(tablets()).toHaveLength(first.choices.length);
    tablets().forEach((t, i) => {
      expect(t.querySelector("[data-option-content]"), `tablet ${i}`).not.toBeNull();
      expect(t.getAttribute("aria-label")).toBe(`${String.fromCharCode(65 + i)}. ${first.choices[i]}`);
    });
    // Two choices: a pair with the VS seam.
    expect(stage.querySelector('[data-answer-layout="pair"]')).not.toBeNull();
    expect(stage.querySelector("[data-pair-divider]")).not.toBeNull();
    // Flanks: dossier left, session right (desktop-only by the arena's rule).
    expect(screen.getByTestId("pro-play-question-dossier")).toBeTruthy();
    expect(screen.getByTestId("pro-play-session-panel")).toBeTruthy();
    // Header: the plan position, no score before any answer.
    expect(screen.getByTestId("ranked-header-title").textContent).toBe("Question 1 / 10");
    expect(screen.queryByTestId("ranked-header-title-detail")).toBeNull();
  });

  it("draws a four-choice question as the 2-up grid of the same canonical tablets", async () => {
    setup({ keys: ["t1_lineage"] });
    await onQuestion(1);
    expect(tablets()).toHaveLength(4);
    expect(document.querySelector('[data-answer-layout="grid"]')).not.toBeNull();
    expect(document.querySelector("[data-pair-divider]")).toBeNull();
    for (const t of tablets()) expect(t.querySelector("[data-option-content]")).not.toBeNull();
  });

  it("has exactly one answer-rendering path: the canonical grid's buttons", async () => {
    setup();
    await onQuestion(1);
    const answers = document.querySelector('[data-surface-region="answers"]')!;
    const buttons = answers.querySelectorAll("button");
    expect(buttons.length).toBe(tablets().length);
    for (const b of buttons) expect(b.hasAttribute("data-quiz-choice")).toBe(true);
    // Nothing interactive inside a tablet.
    for (const t of tablets()) expect(t.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });
});

describe("answer safety and exactly-once submission", () => {
  it("discloses nothing before the server grades", async () => {
    const { lastReport } = setup();
    await onQuestion(1);
    expect(new Set(states())).toEqual(new Set(["idle"]));
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
    expect(screen.queryByTestId("pro-play-next")).toBeNull();
    // The HUD slot is held by an invisible reserve, not a control.
    const reserve = document.querySelector("[data-pro-play-action-reserve]")!;
    expect(reserve.getAttribute("aria-hidden")).toBe("true");
    expect(reserve.className).toContain("invisible");
    expect(lastReport()?.canonicalAnswer ?? null).toBeNull();
  });

  it("sends ONE answer for a burst of clicks, naming the question it answers", async () => {
    const { calls, controller } = setup();
    await onQuestion(1);
    const [a, b] = tablets();
    act(() => {
      fireEvent.click(a);
      fireEvent.click(a);
      fireEvent.click(b);
    });
    await waitFor(() => expect(phase()).toBe("revealed"));
    expect(calls.answer).toHaveLength(1);
    const q = controller().state.question!;
    expect(calls.answer[0]).toEqual([controller().state.session!.session_id, q.question_id, q.choices[0]]);
  });

  it("keeps the reveal on the stage until Next, then mounts the next question clean", async () => {
    const { calls } = setup();
    await onQuestion(1);
    const right = correctIndex(DEFAULT_FIXTURE_SET[0]);
    const wrong = (right + 1) % tablets().length;
    fireEvent.click(tablets()[wrong]);
    await waitFor(() => expect(phase()).toBe("revealed"));
    expect(states()[right]).toBe("correct");
    expect(states()[wrong]).toBe("incorrect-selected");
    const pick = screen.getByTestId("answer-your-pick");
    expect(tablets()[wrong].contains(pick)).toBe(true);
    // The reveal waits: nothing advances on its own.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(phase()).toBe("revealed");
    expect(screen.getByTestId("ranked-header-title").textContent).toContain("Question 1 / 10");
    // The phone-only score detail is the server's.
    const detail = screen.getByTestId("ranked-header-title-detail");
    expect(detail.textContent).toContain("0 correct");
    expect(detail.className).toContain("lg:hidden");
    const next = screen.getByTestId("pro-play-next");
    expect(next.textContent).toBe("Next");
    expect(document.activeElement).toBe(next);
    fireEvent.click(next);
    await onQuestion(2);
    expect(new Set(states())).toEqual(new Set(["idle"]));
    expect(screen.queryByTestId("pro-play-next")).toBeNull();
    expect(calls.answer).toHaveLength(1);
  });
});

describe("report publishing: the arena is the one publisher", () => {
  it("publishes the question on stage with its server identity, and the answer only after grading", async () => {
    const { lastReport, controller } = setup();
    await onQuestion(1);
    const pre = lastReport()!;
    expect(pre.mode).toBe("Pro Play Quiz");
    expect(pre.category).toBe("Leaguecraft");
    expect(pre.sessionId).toBe(controller().state.session!.session_id);
    expect(pre.roundNumber).toBe(1);
    expect(pre.runtimeQuestionId).toBe(controller().state.question!.question_id);
    expect(pre.canonicalAnswer ?? null).toBeNull();
    fireEvent.click(tablets()[0]);
    await waitFor(() => expect(phase()).toBe("revealed"));
    const first = PRO_PLAY_SAMPLES[DEFAULT_FIXTURE_SET[0]];
    expect(lastReport()!.canonicalAnswer).toBe(first.result.correct_answer);
    fireEvent.click(screen.getByTestId("pro-play-next"));
    await onQuestion(2);
    expect(lastReport()!.roundNumber).toBe(2);
    expect(lastReport()!.canonicalAnswer ?? null).toBeNull();
  });

  it("no assembly or dev-route file publishes a report itself", () => {
    for (const rel of [
      "components/pro-play/arena-run/ProPlayArenaRun.tsx",
      "components/pro-play/arena-run/composeProPlayArenaStage.tsx",
      "pages/dev/pro-play-arena/ProPlayArenaDev.tsx",
      "pages/dev/pro-play-arena/fixtureTransport.ts",
    ]) {
      expect(codeOnly(read(rel)), rel).not.toMatch(/usePublishReportableQuestion|ReportableQuestionProvider/);
    }
  });
});

describe("recovery and completion", () => {
  it("shows Try again over the question when the answer fails, and recovers with the identical request", async () => {
    const { calls } = setup({ fault: "answer" });
    await onQuestion(1);
    fireEvent.click(tablets()[0]);
    const retry = await screen.findByTestId("pro-play-try-again");
    // One call plus the two automatic resends, all identical.
    expect(calls.answer).toHaveLength(3);
    expect(new Set(calls.answer.map((c) => c.join("|"))).size).toBe(1);
    expect(screen.getByTestId("submission-status").textContent).toMatch(/unavailable/i);
    expect(screen.queryByTestId("pro-play-next")).toBeNull();
    expect(new Set(states())).not.toContain("correct");
    fireEvent.click(retry);
    await waitFor(() => expect(phase()).toBe("revealed"));
    expect(calls.answer).toHaveLength(4);
    expect(calls.answer[3]).toEqual(calls.answer[0]);
  });

  it("shows a frame-level Try again when the run cannot start, and starts on retry", async () => {
    const { calls } = setup({ fault: "start" });
    const retry = await screen.findByTestId("pro-play-try-again");
    expect(screen.getByTestId("pro-play-error").textContent).toMatch(/unavailable/i);
    fireEvent.click(retry);
    await onQuestion(1);
    expect(calls.start).toBe(2);
  });

  it("ends on the server's score with received verdicts only, and Play again starts a new run", async () => {
    const keys = ["champion_player", "t1_lineage"];
    const { calls } = setup({ keys });
    await onQuestion(1);
    fireEvent.click(tablets()[correctIndex(keys[0])]);
    await waitFor(() => expect(phase()).toBe("revealed"));
    fireEvent.click(screen.getByTestId("pro-play-next"));
    await onQuestion(2);
    fireEvent.click(tablets()[(correctIndex(keys[1]) + 1) % 4]);
    await waitFor(() => expect(phase()).toBe("revealed"));
    const seeResults = screen.getByTestId("pro-play-next");
    expect(seeResults.textContent).toBe("See results");
    fireEvent.click(seeResults);
    const summary = await screen.findByTestId("pro-play-summary");
    expect(within(summary).getByTestId("pro-play-final-score").textContent).toBe("1 / 2");
    const pips = Array.from(summary.querySelectorAll<HTMLElement>("[data-pip-state]")).map((p) => p.dataset.pipState);
    expect(pips).toEqual(["correct", "incorrect"]);
    // No Ranked vocabulary on the end panel.
    expect(summary.textContent ?? "").not.toMatch(/victory|defeat|opponent|rating|elo|forfeit/i);
    fireEvent.click(within(summary).getByTestId("pro-play-restart"));
    await onQuestion(1);
    expect(calls.start).toBe(2);
  });
});

describe("the fixture server keeps the server's contract", () => {
  it("replays an identical repeat without grading again, and refuses another question's id", async () => {
    const t = createFixtureTransport({ keys: ["champion_player", "t1_lineage"], latencyMs: 0 });
    const turn = await t.start();
    const q = turn.question!;
    const first = await t.answer(turn.session.session_id, q.question_id, q.choices[0]);
    const again = await t.answer(turn.session.session_id, q.question_id, q.choices[0]);
    expect(again.replayed).toBe(true);
    expect(again.result).toEqual(first.result);
    expect(again.session).toEqual(first.session);
    await expect(t.answer(turn.session.session_id, "not-this-one", q.choices[0]))
      .rejects.toMatchObject({ status: 409, code: "PP_QUESTION_MISMATCH" });
    await expect(t.answer("nope", q.question_id, q.choices[0]))
      .rejects.toMatchObject({ status: 404, code: "PP_SESSION_NOT_FOUND" });
  });

  it("serves unique question ids per position and the plan's own numbering", async () => {
    const t = createFixtureTransport({ latencyMs: 0 });
    const turn = await t.start();
    expect(turn.session.total).toBe(DEFAULT_FIXTURE_SET.length);
    expect(turn.question!.number).toBe(1);
    expect(turn.question!.total).toBe(DEFAULT_FIXTURE_SET.length);
  });
});

describe("the DEV route", () => {
  it("defaults to the live API and names fixture mode only when asked", () => {
    expect(readArenaDevParams("").source).toBe("live");
    expect(readArenaDevParams("?source=fixture&fault=answer").fault).toBe("answer");
    expect(readArenaDevParams("?source=fixture&set=four").keys).toHaveLength(5);
  });

  it("is registered only in development, in the LoL section, with the arena's full-bleed frame", () => {
    const app = read("App.tsx");
    expect(app).toMatch(/const ProPlayArenaDev = import\.meta\.env\.DEV\s*\?\s*lazy\(/);
    expect(app).toContain('path="/lol/dev/pro-play-arena"');
    expect(read("components/Layout.tsx")).toContain('pathname === "/lol/dev/pro-play-arena"');
    // The production route is not switched by this pass.
    expect(app).toMatch(/path="\/lol\/pro-play\/quiz" element=\{<Suspense fallback=\{<RouteFallback \/>\}><ProPlayQuiz \/>/);
  });
});
