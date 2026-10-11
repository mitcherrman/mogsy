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
import { DOCK_SCROLL_MARGIN, REVEAL_FOOTER_MIN_H } from "./composeProPlayArenaStage";

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

describe("the DEV fixture variants stay internally consistent", () => {
  it("long names relabel choices, identities, evidence and the key together", async () => {
    const t = createFixtureTransport({ keys: ["t1_lineage"], latencyMs: 0, longNames: true });
    const turn = await t.start();
    const q = turn.question!;
    expect(q.choices.some((c) => PRO_PLAY_SAMPLES.t1_lineage.question.choices.includes(c))).toBe(false);
    const ctx = q.context as { subjects: Array<{ label: string }> };
    expect(ctx.subjects.map((s) => s.label)).toEqual(q.choices);
    const right = q.choices[correctIndex("t1_lineage")];
    const graded = await t.answer(turn.session.session_id, q.question_id, right);
    expect(graded.result.is_correct).toBe(true);
    const ev = graded.result.evidence as Evidence;
    expect(ev.subjects.map((s) => s.label).sort()).toEqual([...q.choices].sort());
  });

  it("partial drops exactly option B's statistic; absent drops the evidence", async () => {
    const partial = createFixtureTransport({ keys: ["t1_lineage"], latencyMs: 0, evidence: "partial" });
    const p = await partial.start();
    const pr = await partial.answer(p.session.session_id, p.question!.question_id, p.question!.choices[0]);
    const labels = (pr.result.evidence as Evidence).subjects.map((s) => s.label);
    expect(labels).not.toContain(p.question!.choices[1]);
    expect(labels).toHaveLength(3);
    const absent = createFixtureTransport({ keys: ["t1_lineage"], latencyMs: 0, evidence: "absent" });
    const a = await absent.start();
    const ar = await absent.answer(a.session.session_id, a.question!.question_id, a.question!.choices[0]);
    expect(ar.result.evidence).toBeUndefined();
  });
});

describe("Next on a phone", () => {
  it("the footer and Next carry the app dock's clearance as their scroll margin", async () => {
    setup(["champion_player"]);
    await ready();
    await answer(0);
    const next = screen.getByTestId("pro-play-next");
    const footer = document.querySelector<HTMLElement>("[data-pp-reveal-footer]")!;
    expect(DOCK_SCROLL_MARGIN).toContain("--mogzy-dock-clearance");
    expect(footer.className).toContain(DOCK_SCROLL_MARGIN);
    expect(next.className).toContain(DOCK_SCROLL_MARGIN);
  });

  // PPQ2-E — the 390px partial-evidence capture showed the floating Report
  // pill over the footer's explanation. Bringing only Next above the dock is
  // not enough from `sm`, where the explanation sits beside it and can be
  // taller; the WHOLE footer is the scroll target.
  it("brings the whole reveal footer into view when it lands under the fold", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const below = this.matches("[data-pp-reveal-footer]");
      return { top: below ? 745 : 0, bottom: below ? window.innerHeight + 33 : 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    try {
      setup(["t1_lineage"]);
      await ready();
      await answer(0);
      const footer = document.querySelector("[data-pp-reveal-footer]");
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.contexts[0]).toBe(footer);
      expect(spy.mock.calls[0][0]).toMatchObject({ block: "nearest" });
      // Focus still goes to Next (without scrolling to it separately).
      expect(document.activeElement).toBe(screen.getByTestId("pro-play-next"));
    } finally {
      spy.mockRestore();
      rect.mockRestore();
    }
  });

  it("does not scroll when the footer is already in view, and jumps under Reduce Motion", async () => {
    const spy = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    try {
      setup(["champion_player"]);
      await ready();
      await answer(0);
      expect(spy).not.toHaveBeenCalled(); // jsdom: every rect is 0, in view
    } finally {
      spy.mockRestore();
    }
    cleanup();
    document.documentElement.classList.add("reduce-motion");
    const spy2 = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const below = this.matches("[data-pp-reveal-footer]");
      return { top: 0, bottom: below ? window.innerHeight + 40 : 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    try {
      setup(["champion_player"]);
      await ready();
      await answer(0);
      expect(spy2.mock.calls[0][0]).toMatchObject({ block: "nearest", behavior: "auto" });
    } finally {
      spy2.mockRestore();
      rect.mockRestore();
    }
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
