/**
 * PPQ2-B — the controller against an injected transport.
 *
 * Every server call is a deferred the test resolves by hand, so each case
 * states the exact order of events (a click, a lost response, a late reply)
 * and asserts what reached the server and what reached the view.
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ProPlayApiError,
  type ProPlayAnswerTurn,
  type ProPlayQuestion,
  type ProPlayTurn,
} from "../api";
import PRO_PLAY_SAMPLES, { type ProPlaySample } from "../__fixtures__/proPlaySamples";
import { useProPlayArenaController, type ProPlayArenaTransport } from "./useProPlayArenaController";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const SAMPLE = PRO_PLAY_SAMPLES.t1_lineage as ProPlaySample; // 4-choice ranking
const PAIR = PRO_PLAY_SAMPLES.nuguri_clear as ProPlaySample; // 2-choice

const withNumber = (q: ProPlayQuestion, n: number, total = 3): ProPlayQuestion =>
  ({ ...q, number: n, index: n - 1, total, question_id: `${q.question_id}-${n}` });
const Q1 = withNumber(SAMPLE.question, 1);
const Q2 = withNumber(PAIR.question, 2);
const Q3 = withNumber(SAMPLE.question, 3);
const session = (answered: number, score: number, complete = false, id = "s1") =>
  ({ session_id: id, total: 3, answered, score, complete });

const graded = (
  q: ProPlayQuestion, pick: string, correct: string, score: number,
  next: ProPlayQuestion | null, extra: Partial<ProPlayAnswerTurn> = {},
): ProPlayAnswerTurn => ({
  session: session(q.number, score, next === null),
  question: next,
  result: {
    is_correct: pick === correct, selected_answer: pick, correct_answer: correct,
    explanation: "server explanation", reveal: {}, evidence: SAMPLE.result.evidence,
  },
  ...extra,
});

/** A transport whose every call is queued until the test settles it. */
function harness() {
  const starts: Deferred<ProPlayTurn>[] = [];
  const gets: Deferred<ProPlayTurn>[] = [];
  const answers: { args: [string, string, string]; d: Deferred<ProPlayAnswerTurn> }[] = [];
  const transport: ProPlayArenaTransport = {
    start: vi.fn(() => { const d = deferred<ProPlayTurn>(); starts.push(d); return d.promise; }),
    getSession: vi.fn(() => { const d = deferred<ProPlayTurn>(); gets.push(d); return d.promise; }),
    answer: vi.fn((s: string, q: string, a: string) => {
      const d = deferred<ProPlayAnswerTurn>(); answers.push({ args: [s, q, a], d }); return d.promise;
    }),
  };
  const view = renderHook(() =>
    useProPlayArenaController({ transport, retryDelaysMs: [0, 0], sleep: () => Promise.resolve() }));
  return { transport, starts, gets, answers, view };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

async function startedHarness() {
  const h = harness();
  await act(async () => h.starts[0].resolve({ session: session(0, 0), question: Q1 }));
  return h;
}

describe("useProPlayArenaController", () => {
  it("starts a session on mount and projects the first question", async () => {
    const h = harness();
    expect(h.view.result.current.projection.phase).toBe("loading");
    expect(h.transport.start).toHaveBeenCalledTimes(1);
    await act(async () => h.starts[0].resolve({ session: session(0, 0), question: Q1 }));
    const p = h.view.result.current.projection;
    expect(p.phase).toBe("question");
    expect(p.surface!.question.options.map((o) => o.label)).toEqual(Q1.choices);
    expect(p.surface!.reveal).toBeNull();
  });

  it("answers by option with the question's id and the option's label, once", async () => {
    const h = await startedHarness();
    const option = h.view.result.current.projection.surface!.question.options[2];
    act(() => {
      h.view.result.current.selectOption(option);
      // A burst of clicks before React re-renders: the ref gate holds.
      h.view.result.current.selectOption(option);
      h.view.result.current.selectOption("0");
    });
    await flush();
    expect(h.transport.answer).toHaveBeenCalledTimes(1);
    expect(h.answers[0].args).toEqual(["s1", Q1.question_id, Q1.choices[2]]);
    expect(h.view.result.current.projection.surface!.selectedOptionId).toBe("2");
    expect(h.view.result.current.projection.surface!.inputOpen).toBe(false);
    expect(h.view.result.current.projection.surface!.reveal).toBeNull();
  });

  it("ignores an option id that does not exist", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("9"));
    act(() => h.view.result.current.selectOption("x"));
    await flush();
    expect(h.transport.answer).not.toHaveBeenCalled();
  });

  it("reveals a correct answer, then advances to the delivered question", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("2"));
    await flush();
    await act(async () => h.answers[0].d.resolve(graded(Q1, Q1.choices[2], Q1.choices[2], 1, Q2)));
    let p = h.view.result.current.projection;
    expect(p.phase).toBe("revealed");
    expect(p.surface!.reveal).toMatchObject({ revealed: true, isCorrect: true, correctOptionId: "2" });
    expect(p.run!.score).toBe(1);
    expect(p.run!.pips[0].state).toBe("correct");
    expect(p.next).toEqual({ label: "Next", enabled: true });
    // No further answer is possible on a graded question.
    act(() => h.view.result.current.selectOption("1"));
    await flush();
    expect(h.transport.answer).toHaveBeenCalledTimes(1);

    act(() => h.view.result.current.next());
    p = h.view.result.current.projection;
    expect(p.phase).toBe("question");
    expect(p.surface!.question.questionId).toBe(Q2.question_id);
    expect(p.surface!.reveal).toBeNull();
    expect(p.run!.pips.map((x) => x.state)).toEqual(["correct", "current", "upcoming"]);
  });

  it("reveals an incorrect answer with the server's correct option", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("0"));
    await flush();
    await act(async () => h.answers[0].d.resolve(graded(Q1, Q1.choices[0], Q1.choices[3], 0, Q2)));
    const p = h.view.result.current.projection;
    expect(p.surface!.reveal).toMatchObject({ isCorrect: false, correctOptionId: "3" });
    expect(p.surface!.selectedOptionId).toBe("0");
    expect(p.reveal!.explanation).toBe("server explanation");
    expect(p.run!.score).toBe(0);
    expect(p.timeline!.nodes[0].outcome).toBe("incorrect");
  });

  it("transport failure: resends the IDENTICAL request, and a replayed grade is recorded once", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("1"));
    await flush();
    // Three attempts (two automatic resends), all lost.
    for (let i = 0; i < 3; i += 1) {
      await act(async () => h.answers[i].d.reject(new ProPlayApiError("PP_NETWORK", "Pro Play is unavailable right now. Please try again.")));
      await flush();
    }
    expect(h.transport.answer).toHaveBeenCalledTimes(3);
    let p = h.view.result.current.projection;
    expect(p.error).toMatchObject({ action: "answer", enabled: true });
    expect(p.surface!.selectedOptionId).toBe("1");
    expect(p.surface!.inputOpen).toBe(false);
    // A different option cannot be sneaked in while the resend is pending.
    act(() => h.view.result.current.selectOption("2"));
    await flush();
    expect(h.transport.answer).toHaveBeenCalledTimes(3);

    act(() => {
      h.view.result.current.tryAgain();
      h.view.result.current.tryAgain();
    });
    await flush();
    expect(h.transport.answer).toHaveBeenCalledTimes(4);
    for (const a of h.answers) expect(a.args).toEqual(["s1", Q1.question_id, Q1.choices[1]]);
    await act(async () => h.answers[3].d.resolve(graded(Q1, Q1.choices[1], Q1.choices[1], 1, Q2, { replayed: true })));
    p = h.view.result.current.projection;
    expect(p.reveal).toMatchObject({ isCorrect: true, replayed: true });
    expect(p.run!.score).toBe(1);
    expect(p.run!.pips.filter((x) => x.state === "correct")).toHaveLength(1);
    expect(p.error).toBeNull();
  });

  it("503 after grading: the automatic resend replays the grade", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("3"));
    await flush();
    await act(async () => h.answers[0].d.reject(new ProPlayApiError("PP_NO_QUESTION_AVAILABLE", "x", 503)));
    await flush();
    expect(h.transport.answer).toHaveBeenCalledTimes(2);
    expect(h.answers[1].args).toEqual(h.answers[0].args);
    await act(async () => h.answers[1].d.resolve(graded(Q1, Q1.choices[3], Q1.choices[3], 1, Q2, { replayed: true })));
    expect(h.view.result.current.projection.phase).toBe("revealed");
    expect(h.view.result.current.projection.error).toBeNull();
  });

  it("409: resynchronizes from GET and never resends", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("0"));
    await flush();
    await act(async () => h.answers[0].d.reject(new ProPlayApiError("PP_QUESTION_MISMATCH", "x", 409)));
    await flush();
    expect(h.transport.getSession).toHaveBeenCalledWith("s1");
    await act(async () => h.gets[0].resolve({ session: session(1, 1), question: Q2 }));
    const p = h.view.result.current.projection;
    expect(h.transport.answer).toHaveBeenCalledTimes(1);
    expect(p.phase).toBe("question");
    expect(p.surface!.question.questionId).toBe(Q2.question_id);
    expect(p.surface!.inputOpen).toBe(true);
    expect(p.run!.score).toBe(1);
    // Q1's grade was never received: it is unobserved, not a guessed verdict.
    expect(p.run!.pips.map((x) => x.state)).toEqual(["unobserved", "current", "upcoming"]);
  });

  it("expiry: offers only a restart, which starts a fresh session", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("0"));
    await flush();
    await act(async () => h.answers[0].d.reject(new ProPlayApiError("PP_SESSION_NOT_FOUND", "Session expired", 404)));
    await flush();
    expect(h.view.result.current.projection.error).toMatchObject({ action: "restart", message: "Session expired" });
    expect(h.transport.answer).toHaveBeenCalledTimes(1);
    act(() => h.view.result.current.tryAgain());
    expect(h.transport.start).toHaveBeenCalledTimes(2);
    await act(async () => h.starts[1].resolve({ session: session(0, 0, false, "s2"), question: Q1 }));
    const p = h.view.result.current.projection;
    expect(p.run!.sessionId).toBe("s2");
    expect(p.error).toBeNull();
    expect(p.run!.pips.every((x) => x.state !== "correct" && x.state !== "incorrect")).toBe(true);
  });

  it("a restart mid-answer drops the stale response", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("1"));
    await flush();
    act(() => h.view.result.current.restart());
    await act(async () => h.starts[1].resolve({ session: session(0, 0, false, "s2"), question: Q3 }));
    // The old session's grade arrives late.
    await act(async () => h.answers[0].d.resolve(graded(Q1, Q1.choices[1], Q1.choices[1], 1, Q2)));
    const p = h.view.result.current.projection;
    expect(p.run!.sessionId).toBe("s2");
    expect(p.surface!.question.questionId).toBe(Q3.question_id);
    expect(p.reveal).toBeNull();
    expect(p.run!.score).toBe(0);
  });

  it("a restart while one is already starting sends one start", async () => {
    const h = harness();
    act(() => h.view.result.current.restart());
    expect(h.transport.start).toHaveBeenCalledTimes(1);
  });

  it("unmount drops responses still in flight", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("1"));
    await flush();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.view.unmount();
    await act(async () => h.answers[0].d.resolve(graded(Q1, Q1.choices[1], Q1.choices[1], 1, Q2)));
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("final summary: the server's score and total, after the last reveal", async () => {
    const h = harness();
    await act(async () => h.starts[0].resolve({ session: session(2, 1), question: Q3 }));
    act(() => h.view.result.current.selectOption("0"));
    await flush();
    await act(async () => h.answers[0].d.resolve(graded(Q3, Q3.choices[0], Q3.choices[0], 2, null)));
    let p = h.view.result.current.projection;
    expect(p.next!.label).toBe("See results");
    expect(p.terminal).toBeNull();
    act(() => h.view.result.current.next());
    p = h.view.result.current.projection;
    expect(p.phase).toBe("complete");
    expect(p.surface).toBeNull();
    expect(p.terminal).toMatchObject({ score: 2, total: 3, answered: 3 });
    expect(p.terminal!.pips.map((x) => x.state)).toEqual(["unobserved", "unobserved", "correct"]);
    expect(h.transport.getSession).not.toHaveBeenCalled();
  });

  it("Next on a mid-run reveal without a next question resyncs", async () => {
    const h = await startedHarness();
    act(() => h.view.result.current.selectOption("0"));
    await flush();
    await act(async () => h.answers[0].d.resolve(graded(Q1, Q1.choices[0], Q1.choices[0], 1, null, { session: session(1, 1) })));
    act(() => { h.view.result.current.next(); h.view.result.current.next(); });
    await flush();
    expect(h.transport.getSession).toHaveBeenCalledTimes(1);
    await act(async () => h.gets[0].resolve({ session: session(1, 1), question: Q2 }));
    expect(h.view.result.current.projection.surface!.question.questionId).toBe(Q2.question_id);
    // The verdict received before the resync survives it.
    expect(h.view.result.current.projection.run!.pips[0].state).toBe("correct");
  });
});
