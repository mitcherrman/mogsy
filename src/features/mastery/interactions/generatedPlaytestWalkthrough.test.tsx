/**
 * Realistic multi-question walkthroughs of both generated Mastery prototypes.
 *
 * These render the REAL live player (`MasteryPlayerLive`) — the same component
 * the dev launcher mounts — over `fetch` responses that are verbatim captured
 * backend payloads (`capturedPlaytestPayloads.ts`). Nothing is stubbed between
 * the wire and the screen: the real `live/api` parsers run, the real interaction
 * dispatcher routes, and the real renderers draw.
 *
 * That matters because the previous 252 mastery tests all passed while the
 * matchup prototype could not render a single question in a browser. Every one
 * of them used a hand-written fixture, and the hand-written matchup fixture
 * carried a `matchup_identity.focus` field the real backend did not emit — so
 * the parse failure that broke the real set was invisible to the whole suite.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { MasteryPlayerLive } from "../live/MasteryPlayerLive";
import { startGeneratedPlaytestSession } from "../live/api";
import {
  CAPTURED_CHAMPION_RUN,
  CAPTURED_MATCHUP_RUN,
  type CapturedRun,
} from "./capturedPlaytestPayloads";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({}),
}));

/** A fake backend that replays one captured run over the real HTTP client. */
function installFakeBackend(run: CapturedRun) {
  let index = 0;
  let revealed = false;
  const sessionId = String(run.session.session_id);
  const total = run.steps.length;

  const sessionEnvelope = () => ({
    session: {
      ...run.session,
      current_sequence_index: Math.min(index, total - 1),
      completed: index >= total,
    },
    question: index < total
      ? { projection_type: "mastery_player_question",
          schema_version: "mastery-player-question.v1",
          data: run.steps[index].question }
      : null,
    reveal: revealed && index < total
      ? { projection_type: "mastery_player_reveal",
          schema_version: "mastery-player-reveal.v1",
          data: run.steps[index].reveal }
      : null,
    summary: index >= total
      ? { session_id: sessionId, total_steps: total, answered_count: total,
          correct_count: total, completed: true }
      : null,
  });

  const json = (body: unknown) => Promise.resolve({
    ok: true, status: 200, json: async () => body,
  } as unknown as Response);

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/dev/generated-playtest-session")) {
      // Assert the launcher asks for a FRESH session, never a resumed one.
      expect(JSON.parse(String(init?.body))).toMatchObject({ resume: false });
      index = 0;
      revealed = false;
      return json(sessionEnvelope());
    }
    if (url.endsWith("/current")) return json(sessionEnvelope());
    if (url.endsWith("/answer")) {
      const body = JSON.parse(String(init?.body));
      expect(body.sequence_index).toBe(index);
      revealed = true;
      return json({ projection_type: "mastery_player_reveal",
                    schema_version: "mastery-player-reveal.v1",
                    data: run.steps[index].reveal });
    }
    if (url.endsWith("/advance")) {
      index += 1;
      revealed = false;
      return json(sessionEnvelope());
    }
    throw new Error(`unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, currentIndex: () => index };
}

function mount(run: CapturedRun) {
  return render(
    <MasteryPlayerLive
      masterySetId={String(run.session.mastery_set_id)}
      startSessionFn={startGeneratedPlaytestSession}
    />,
  );
}

async function click(testId: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Answer the question on screen with its backend-authoritative answer. */
async function answerCurrentStep(run: CapturedRun, index: number) {
  const step = run.steps[index];
  const answerType = step.question.answer_type as string;
  if (answerType === "single_choice") {
    const correct = String(step.reveal.correct_answer);
    const options = step.question.answer_options as string[];
    expect(options, `correct answer ${correct} must be one of the options`)
      .toContain(correct);
    expect(screen.getAllByTestId(/^choice-/)).toHaveLength(options.length);
    fireEvent.click(screen.getByTestId(`choice-${correct}`));
  } else {
    fireEvent.change(screen.getByTestId("mastery-numeric-input"),
                     { target: { value: String(step.reveal.correct_answer) } });
  }
  await click("mastery-submit-button");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Ahri Champion Mastery ───────────────────────────────────────────────────

describe("Ahri Champion Mastery — generated playtest", () => {
  it("opens on question 1, not partway through a resumed session", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    const progress = await screen.findByTestId("mastery-progress");
    expect(progress).toHaveTextContent(`1`);
    expect(progress).toHaveTextContent(String(CAPTURED_CHAMPION_RUN.steps.length));
  });

  it("renders atomic recall as multiple choice, never a decimal text entry", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    await screen.findByTestId("mastery-atomic-recall-question");
    expect(screen.getAllByTestId(/^choice-/)).toHaveLength(4);
    expect(screen.queryByTestId("mastery-numeric-input")).toBeNull();
  });

  it("offers four unique, clean numeric options with no duplicates", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    await screen.findByTestId("mastery-atomic-recall-question");
    const labels = screen.getAllByTestId(/^choice-/)
      .map((r) => r.parentElement?.textContent?.trim() ?? "");
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/^\d+(\.\d+)?$/);
    }
  });

  it("walks the first five questions: numbering, submit, reveal, advance", async () => {
    const backend = installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    const total = CAPTURED_CHAMPION_RUN.steps.length;

    for (let i = 0; i < 5; i += 1) {
      await screen.findByTestId("mastery-atomic-recall-question");
      // The displayed question number is i+1 — proved from the screen, not
      // from a label we control.
      expect(await screen.findByTestId("mastery-progress"))
        .toHaveTextContent(new RegExp(`\\b${i + 1}\\b`));

      await answerCurrentStep(CAPTURED_CHAMPION_RUN, i);

      const reveal = await screen.findByTestId("mastery-atomic-recall-reveal");
      expect(within(reveal).getByTestId("mastery-correctness"))
        .toHaveAttribute("data-correct", "true");
      expect(within(reveal).getByTestId("mastery-explanation").textContent)
        .toBe(String(CAPTURED_CHAMPION_RUN.steps[i].reveal.explanation));

      await click("mastery-next-button");
      await waitFor(() => expect(backend.currentIndex()).toBe(i + 1));
    }
    expect(backend.currentIndex()).toBe(5);
    expect(total).toBeGreaterThan(5);
  });

  it("shows the canonical decimal in the reveal where the option was rounded", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);

    const roundedIndex = CAPTURED_CHAMPION_RUN.steps.findIndex(
      (s) => String(s.reveal.explanation).includes("rounds to"));
    expect(roundedIndex, "a derived-stat step must be present").toBeGreaterThan(-1);

    for (let i = 0; i <= roundedIndex; i += 1) {
      await screen.findByTestId("mastery-atomic-recall-question");
      await answerCurrentStep(CAPTURED_CHAMPION_RUN, i);
      const reveal = await screen.findByTestId("mastery-atomic-recall-reveal");
      if (i === roundedIndex) {
        const text = within(reveal).getByTestId("mastery-explanation").textContent ?? "";
        expect(text).toMatch(/\d+\.\d+/);          // the canonical decimal
        expect(text).toContain("rounds to");        // and it says so
        // The graded/displayed answer is the clean whole number.
        expect(within(reveal).getByTestId("mastery-correct-answer").textContent?.trim())
          .toBe(String(CAPTURED_CHAMPION_RUN.steps[i].reveal.correct_answer));
        break;
      }
      await click("mastery-next-button");
    }
  });

  it("never renders an opponent card or a combat state panel", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    await screen.findByTestId("mastery-atomic-recall-question");
    expect(screen.queryByTestId("mastery-matchup-header")).toBeNull();
    expect(screen.queryByTestId("mastery-state-panel")).toBeNull();
    expect(screen.queryByTestId("mastery-player-error")).toBeNull();
  });

  it("plays every question through to completion", async () => {
    installFakeBackend(CAPTURED_CHAMPION_RUN);
    mount(CAPTURED_CHAMPION_RUN);
    for (let i = 0; i < CAPTURED_CHAMPION_RUN.steps.length; i += 1) {
      await screen.findByTestId("mastery-atomic-recall-question");
      await answerCurrentStep(CAPTURED_CHAMPION_RUN, i);
      const reveal = await screen.findByTestId("mastery-atomic-recall-reveal");
      await click("mastery-next-button");
    }
    await screen.findByTestId("mastery-player-completion");
  }, 30000);
});

// ── Ahri vs Syndra Matchup Mastery ─────────────────────────────────────────

describe("Ahri vs Syndra Matchup Mastery — generated playtest", () => {
  it("renders its first question instead of the player error state", async () => {
    installFakeBackend(CAPTURED_MATCHUP_RUN);
    mount(CAPTURED_MATCHUP_RUN);
    await screen.findByTestId("mastery-player-live");
    expect(screen.queryByTestId("mastery-player-error")).toBeNull();
    expect(await screen.findByTestId("mastery-progress")).toHaveTextContent("1");
  });

  it("parses the real matchup_identity — the exact reported blocker", async () => {
    // The backend adapter omitted `focus`; `readMatchup` requires it, so every
    // matchup question failed to parse and the player showed "Could not load
    // the mastery set". These payloads are captured from the fixed backend.
    for (const step of CAPTURED_MATCHUP_RUN.steps) {
      const identity = step.question.matchup_identity as Record<string, unknown>;
      expect(identity).not.toBeNull();
      expect(typeof identity.focus).toBe("string");
    }
    installFakeBackend(CAPTURED_MATCHUP_RUN);
    mount(CAPTURED_MATCHUP_RUN);
    expect(await screen.findByTestId("mastery-progress")).toBeInTheDocument();
    expect(screen.queryByTestId("mastery-player-error")).toBeNull();
  });

  it("walks recall, a champion-A win, a champion-B win and the tie", async () => {
    installFakeBackend(CAPTURED_MATCHUP_RUN);
    mount(CAPTURED_MATCHUP_RUN);

    const seenKinds = new Set<string>();
    const seenWinners = new Set<string>();

    for (let i = 0; i < CAPTURED_MATCHUP_RUN.steps.length; i += 1) {
      const step = CAPTURED_MATCHUP_RUN.steps[i];
      const kind = String(step.question.interaction_kind);
      seenKinds.add(kind);

      const testid = kind === "comparison_left_right"
        ? "mastery-comparison-question"
        : "mastery-atomic-recall-question";
      await screen.findByTestId(testid);
      expect(await screen.findByTestId("mastery-progress"))
        .toHaveTextContent(new RegExp(`\\b${i + 1}\\b`));

      await answerCurrentStep(CAPTURED_MATCHUP_RUN, i);

      const revealTestid = kind === "comparison_left_right"
        ? "mastery-comparison-reveal"
        : "mastery-atomic-recall-reveal";
      const reveal = await screen.findByTestId(revealTestid);
      expect(within(reveal).getByTestId("mastery-correctness"))
        .toHaveAttribute("data-correct", "true");
      expect(within(reveal).getByTestId("mastery-explanation").textContent)
        .toBe(String(step.reveal.explanation));
      if (kind === "comparison_left_right") {
        seenWinners.add(String(step.reveal.correct_answer));
      }
      await click("mastery-next-button");
    }

    await screen.findByTestId("mastery-player-completion");
    expect(seenKinds).toEqual(new Set(["atomic_recall", "comparison_left_right"]));
    const identity = CAPTURED_MATCHUP_RUN.steps[0].question
      .matchup_identity as Record<string, string>;
    expect(seenWinners.has(identity.champion_a.toLowerCase()))
      .toBe(true);
    expect(seenWinners.has(identity.champion_b.toLowerCase()))
      .toBe(true);
    expect(seenWinners.has("tie")).toBe(true);
  }, 40000);

  it("offers champion A, champion B and Tie on every comparison", async () => {
    installFakeBackend(CAPTURED_MATCHUP_RUN);
    mount(CAPTURED_MATCHUP_RUN);
    for (const step of CAPTURED_MATCHUP_RUN.steps) {
      if (step.question.interaction_kind !== "comparison_left_right") continue;
      expect(step.question.answer_options).toHaveLength(3);
      expect((step.question.answer_options as string[])[2]).toBe("tie");
    }
  });

  it("never leaks a comparison's values or winner before submission", async () => {
    for (const step of CAPTURED_MATCHUP_RUN.steps) {
      const semantics = step.question.comparison_semantics as Record<string, unknown> | null;
      if (!semantics) continue;
      for (const leak of ["value_a", "value_b", "winner", "tie_state", "answer", "delta"]) {
        expect(semantics).not.toHaveProperty(leak);
      }
    }
  });
});
