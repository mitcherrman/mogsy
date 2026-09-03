/**
 * Standalone Mastery — the persisted question/reveal/completed state machine
 * under per-question reveal.
 *
 * The reveal PHASE is still persisted server-side and is deliberately left
 * alone; what changed is that the client no longer waits for a click to leave
 * it. These tests drive the real `MasteryPlayerLive` over a fake session API
 * and pin the two things that persistence buys: a reload landing directly in
 * the reveal renders it and advances itself, and it does so without ever
 * re-answering or double-advancing.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MasteryPlayerLive } from "./MasteryPlayerLive";
import { MASTERY_REVEAL_DURATION_MS } from "../interactions/revealState";
import { CAPTURED_CHAMPION_RUN } from "../interactions/capturedPlaytestPayloads";
import { startGeneratedPlaytestSession } from "./api";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({}),
}));

const RUN = CAPTURED_CHAMPION_RUN;

interface Counts { answers: number; advances: number; }

/**
 * A fake backend that can START mid-reveal, which is exactly what a reload
 * during the persisted reveal phase looks like to the client.
 */
function installBackend(startIndex = 0, startRevealed = false) {
  let index = startIndex;
  let revealed = startRevealed;
  const counts: Counts = { answers: 0, advances: 0 };
  const total = RUN.steps.length;

  const envelope = () => ({
    session: {
      ...RUN.session,
      current_sequence_index: Math.min(index, total - 1),
      completed: index >= total,
    },
    question: index < total
      ? { projection_type: "mastery_player_question",
          schema_version: "mastery-player-question.v1",
          data: RUN.steps[index].question }
      : null,
    reveal: revealed && index < total
      ? { projection_type: "mastery_player_reveal",
          schema_version: "mastery-player-reveal.v1",
          data: RUN.steps[index].reveal }
      : null,
    summary: index >= total
      ? { session_id: String(RUN.session.session_id), total_steps: total,
          answered_count: total, correct_count: total, completed: true }
      : null,
  });

  const json = (body: unknown) => Promise.resolve({
    ok: true, status: 200, json: async () => body,
  } as unknown as Response);

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/dev/generated-playtest-session")) return json(envelope());
    if (url.endsWith("/current")) return json(envelope());
    if (url.endsWith("/answer")) {
      counts.answers += 1;
      revealed = true;
      return json({ projection_type: "mastery_player_reveal",
                    schema_version: "mastery-player-reveal.v1",
                    data: RUN.steps[index].reveal });
    }
    if (url.endsWith("/advance")) {
      counts.advances += 1;
      index += 1;
      revealed = false;
      return json(envelope());
    }
    throw new Error(`unexpected request: ${url}`);
  }));
  return { counts, currentIndex: () => index };
}

function mount() {
  return render(
    <MasteryPlayerLive
      masterySetId={String(RUN.session.mastery_set_id)}
      startSessionFn={startGeneratedPlaytestSession}
    />,
  );
}

async function tick(ms = MASTERY_REVEAL_DURATION_MS) {
  await act(async () => { vi.advanceTimersByTime(ms); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("standalone Mastery — reload during the persisted reveal", () => {
  it("renders the persisted reveal on boot instead of a blank question", async () => {
    installBackend(1, true);
    mount();
    // The QUESTION is on screen, in its reveal state — persistence is intact
    // and nothing was re-answered to get here.
    await screen.findByTestId("mastery-atomic-recall-question");
    expect(await screen.findByTestId("mastery-inline-reveal")).toBeTruthy();
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();
  });

  it("auto-advances after mounting, without resubmitting the answer", async () => {
    const backend = installBackend(1, true);
    mount();
    await screen.findByTestId("mastery-inline-reveal");
    expect(backend.counts.answers).toBe(0);

    await tick();
    await waitFor(() => expect(backend.currentIndex()).toBe(2));
    expect(backend.counts.answers).toBe(0);   // no double answer
    expect(backend.counts.advances).toBe(1);  // no double advance
  });

  it("does not advance twice if the clock keeps running", async () => {
    const backend = installBackend(1, true);
    mount();
    await screen.findByTestId("mastery-inline-reveal");
    await tick();
    await tick(MASTERY_REVEAL_DURATION_MS * 3);
    expect(backend.counts.advances).toBe(1);
  });
});

describe("standalone Mastery — the modern answer flow", () => {
  it("locks the input and reveals in place with no manual Next", async () => {
    const backend = installBackend();
    mount();
    await screen.findByTestId("mastery-atomic-recall-question");
    const correct = String(RUN.steps[0].reveal.correct_answer);
    await act(async () => {
      fireEvent.click(screen.getByTestId(`choice-${correct}`));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mastery-submit-button"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await screen.findByTestId("mastery-inline-reveal");
    expect(screen.getByTestId("mastery-choice-input"))
      .toHaveAttribute("data-revealing", "true");
    expect(screen.getByTestId(`mastery-choice-row-${correct}`))
      .toHaveAttribute("data-tone", "correct");
    expect(screen.queryByTestId("mastery-next-button")).toBeNull();
    expect(screen.queryByTestId("mastery-submit-button")).toBeNull();

    await tick();
    await waitFor(() => expect(backend.currentIndex()).toBe(1));
    expect(backend.counts.answers).toBe(1);
  });

  it("completes from the final question with no extra interaction", async () => {
    const total = RUN.steps.length;
    const backend = installBackend(total - 1, true);
    mount();
    await screen.findByTestId("mastery-inline-reveal");
    await tick();
    await screen.findByTestId("mastery-player-completion");
    expect(backend.counts.advances).toBe(1);
  });
});
