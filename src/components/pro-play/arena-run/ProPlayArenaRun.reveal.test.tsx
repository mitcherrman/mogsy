/**
 * PPQ2-INT — PPQ2-D's statistical reveal in the assembled arena.
 *
 * End to end through the real controller and the fixture server (real frozen
 * production payloads): values appear INSIDE the canonical tablets only after
 * the server's grade, verbatim and in server order; the footer takes the HUD
 * row with Next in it; the row's height is held before the grade; evidence
 * that is missing or partial degrades without inventing anything.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { ProPlayArenaTransport } from "@/lib/pro-play/arena";
import { useProPlayArenaController } from "@/lib/pro-play/arena";
import { ReportableQuestionProvider } from "@/lib/feedback/reportable-question";
import { createFixtureTransport } from "@/pages/dev/pro-play-arena/fixtureTransport";
import ProPlayArenaRun from "./ProPlayArenaRun";
import { REVEAL_FOOTER_MIN_H } from "./composeProPlayArenaStage";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
});

type Evidence = { subjects: Array<{ label: string; display: string | null }> };
const ALL = Object.keys(PRO_PLAY_SAMPLES);

/** The fixture server, optionally rewriting the evidence it returns. */
function transportFor(keys: string[], evidence?: (e: Evidence) => Evidence | undefined): ProPlayArenaTransport {
  const inner = createFixtureTransport({ keys, latencyMs: 0 });
  if (!evidence) return inner;
  return {
    ...inner,
    answer: async (s, q, a) => {
      const turn = await inner.answer(s, q, a);
      const next = evidence(structuredClone(turn.result.evidence) as Evidence);
      return { ...turn, result: { ...turn.result, evidence: next } };
    },
  };
}

function setup(keys: string[], evidence?: (e: Evidence) => Evidence | undefined) {
  const transport = transportFor(keys, evidence);
  function Harness() {
    const c = useProPlayArenaController({ transport, retryDelaysMs: [0, 0], sleep: async () => {} });
    return <ProPlayArenaRun controller={c} />;
  }
  render(
    <MemoryRouter>
      <TooltipProvider>
        <ReportableQuestionProvider>
          <Harness />
        </ReportableQuestionProvider>
      </TooltipProvider>
    </MemoryRouter>,
  );
}

const phase = () => screen.getByTestId("pro-play-arena").dataset.proPlayPhase;
const tablets = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"));
const values = () => tablets().map((t) => t.querySelector("[data-pp-reveal-display]")?.textContent ?? null);
const correctIndex = (key: string) =>
  PRO_PLAY_SAMPLES[key].question.choices.indexOf(PRO_PLAY_SAMPLES[key].result.correct_answer);
const expectedDisplays = (key: string) => {
  const ev = PRO_PLAY_SAMPLES[key].result.evidence as Evidence;
  return PRO_PLAY_SAMPLES[key].question.choices.map((c) => ev.subjects.find((s) => s.label === c)?.display ?? null);
};

async function ready() {
  await waitFor(() => expect(phase()).toBe("question"));
}
async function answer(index: number) {
  fireEvent.click(tablets()[index]);
  await waitFor(() => expect(phase()).toBe("revealed"));
}

describe("before the grade", () => {
  it.each(ALL)("%s: no value, footer or evidence string anywhere; the HUD row holds the footer's height", async (key) => {
    setup([key]);
    await ready();
    expect(document.querySelector("[data-pp-reveal-footer]")).toBeNull();
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
    const reserve = document.querySelector("[data-pro-play-hud-reserve]")!;
    expect(reserve.className).toContain(REVEAL_FOOTER_MIN_H);
    const text = document.body.textContent ?? "";
    // Bare integers ("6") also occur in seasons and numbering; the
    // distinctive displays (rates, decimals) must not appear before the grade.
    for (const display of expectedDisplays(key)) {
      if (display && /[%.]/.test(display)) expect(text, display).not.toContain(display);
    }
  });
});

describe("after the grade", () => {
  it.each(ALL)("%s: every tablet shows its own server display, verbatim, in server order", async (key) => {
    setup([key]);
    await ready();
    await answer(correctIndex(key));
    expect(values()).toEqual(expectedDisplays(key).map((d) => d ?? "—"));
    // The verdict stays the canonical grid's, from the server's grade.
    expect(tablets()[correctIndex(key)].dataset.choiceState).toBe("correct");
    // The footer took the HUD row, and the reserve is gone.
    expect(document.querySelector("[data-pp-reveal-footer]")).not.toBeNull();
    expect(document.querySelector("[data-pro-play-hud-reserve]")).toBeNull();
  });

  it("puts Next inside the footer, focuses it, and keeps the screen-reader verdict and readout", async () => {
    setup(["champion_player"]);
    await ready();
    const right = correctIndex("champion_player");
    await answer((right + 1) % 2);
    const footer = document.querySelector<HTMLElement>("[data-pp-reveal-footer]")!;
    const next = within(footer).getByTestId("pro-play-next");
    expect(document.activeElement).toBe(next);
    expect(footer.dataset.ppRevealFooter).toBe("incorrect");
    expect(within(footer).getByRole("status").textContent).toMatch(/^Incorrect\. You picked [AB], .+\. The answer is [AB], .+\.$/);
    const readout = footer.querySelector("[data-pp-reveal-readout]")!;
    expect(readout.getAttribute("data-pp-reveal-readout")).toBe("sr-only");
    expect(readout.querySelectorAll("li")).toHaveLength(2);
    // "Your pick" is the canonical one, on the picked tablet only.
    expect(screen.getAllByTestId("answer-your-pick")).toHaveLength(1);
  });

  it("opens the Source disclosure from the keyboard and returns focus on Escape", async () => {
    setup(["champion_player"]);
    await ready();
    await answer(0);
    const source = document.querySelector<HTMLButtonElement>("[data-pp-reveal-source]")!;
    source.focus();
    fireEvent.click(source);
    const panel = await waitFor(() => {
      const el = document.querySelector("[data-pp-reveal-source-panel]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(source.getAttribute("aria-expanded")).toBe("true");
    expect(panel.textContent).toMatch(/Evidence authority/);
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-pp-reveal-source-panel]")).toBeNull());
    expect(document.activeElement).toBe(source);
  });

  it("is static under the app's Reduce Motion", async () => {
    document.documentElement.classList.add("reduce-motion");
    setup(["t1_lineage"]);
    await ready();
    await answer(0);
    for (const el of document.querySelectorAll<HTMLElement>("[data-pp-reveal-motion]")) {
      expect(el.dataset.ppRevealMotion).toBe("static");
      expect(el.getAttribute("style") ?? "").not.toContain("animation-delay");
    }
  });

  it("clears the reveal on Next: the next question mounts with no value and the reserve back", async () => {
    setup(["champion_player", "t1_lineage"]);
    await ready();
    await answer(0);
    fireEvent.click(screen.getByTestId("pro-play-next"));
    await waitFor(() => expect(phase()).toBe("question"));
    expect(tablets()).toHaveLength(4);
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
    expect(document.querySelector("[data-pp-reveal-footer]")).toBeNull();
    expect(document.querySelector("[data-pro-play-hud-reserve]")).not.toBeNull();
  });
});

describe("evidence the server did not fully send", () => {
  it("absent evidence: no values, identity facts stay, and the footer says so", async () => {
    setup(["champion_player"], () => undefined);
    await ready();
    await answer(0);
    expect(document.querySelector("[data-pp-reveal-value]")).toBeNull();
    expect(document.querySelectorAll("[data-pp-tablet-facts]").length).toBe(2);
    const footer = document.querySelector<HTMLElement>("[data-pp-reveal-footer]")!;
    expect(footer.dataset.ppEvidenceState).toBe("absent");
    expect(footer.querySelector("[data-pp-reveal-note]")!.textContent).toMatch(/No per-option statistics/);
    expect(within(footer).getByTestId("pro-play-next")).toBeTruthy();
  });

  it("partial evidence: the missing option shows a dash, never a guess", async () => {
    const key = "t1_lineage";
    const dropped = PRO_PLAY_SAMPLES[key].question.choices[1];
    setup([key], (e) => ({ ...e, subjects: e.subjects.filter((s) => s.label !== dropped) }));
    await ready();
    await answer(0);
    const expected = expectedDisplays(key).map((d, i) => (i === 1 ? "—" : d ?? "—"));
    expect(values()).toEqual(expected);
    expect(document.querySelector<HTMLElement>("[data-pp-reveal-footer]")!.dataset.ppEvidenceState).toBe("partial");
  });
});

describe("one answer path, still", () => {
  it("adds nothing interactive inside a revealed tablet", async () => {
    setup(["t1_lineage"]);
    await ready();
    await answer(2);
    for (const t of tablets()) expect(t.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    const answers = document.querySelector('[data-surface-region="answers"]')!;
    expect(answers.querySelectorAll("button").length).toBe(tablets().length);
  });
});
