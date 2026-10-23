/**
 * PPQ2-INT — the optional `regions` seam and the header's phone-only
 * `titleDetail`, on the neutral question member.
 *
 * Both are additive and absent for every existing caller. These tests hold
 * the two halves of that promise: absent, the arena renders exactly what it
 * did (no new nodes or attributes); present, a mode's presentation lands
 * INSIDE the canonical regions and buttons while selection, gating, states and
 * the accessible names stay the grid's own.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { CanonicalArena } from "./CanonicalArena";
import type { ArenaQuestionSurface, ArenaViewModel, QuestionSurfaceRegions } from "@/lib/ranked-core/arenaView";
import {
  DEFAULT_PROBE,
  questionProbeView,
  type QuestionProbeParams,
} from "@/pages/dev/arena-question-probe/questionProbeView";

afterEach(cleanup);

function view(
  over: Partial<QuestionProbeParams> = {},
  regions?: (surface: ArenaQuestionSurface) => QuestionSurfaceRegions | null,
  header: Partial<ArenaViewModel["header"]> = {},
  onSelect = vi.fn(),
): ArenaViewModel {
  const v = questionProbeView({ ...DEFAULT_PROBE, ...over }, {
    leftPanel: <div>left</div>,
    rightPanel: <div>right</div>,
    onSelectOption: onSelect,
  });
  const surface = v.surface as ArenaQuestionSurface;
  return {
    ...v,
    header: { ...v.header, ...header },
    surface: regions ? { ...surface, regions: regions(surface) } : surface,
  };
}

const tablets = () => Array.from(document.querySelectorAll<HTMLButtonElement>("[data-quiz-choice]"));
const contentFor = (s: ArenaQuestionSurface) =>
  s.question.options.map((o) => <span key={o.id} data-test-content={o.id}>rich {o.label}</span>);

describe("absent regions: the arena is unchanged", () => {
  it("adds no content node, divider, aria-label or pair layout", () => {
    render(<CanonicalArena view={view()} />);
    expect(document.querySelector("[data-option-content]")).toBeNull();
    expect(document.querySelector("[data-pair-divider]")).toBeNull();
    for (const t of tablets()) expect(t.hasAttribute("aria-label")).toBe(false);
    expect(document.querySelector("[data-answer-layout]")?.getAttribute("data-answer-layout")).not.toBe("pair");
    expect(screen.queryByTestId("ranked-header-detail")).toBeNull();
  });

  // QRT2 — a question surface (Pro Play, Worlds, Practice) now tells the
  // revealed answer in words: both tabs ride the tablet's top edge, on label
  // tablets and content tablets alike. (It was a bottom-right label before.)
  it("tells the pick and the answer on label tablets with top-edge tabs", () => {
    render(<CanonicalArena view={view({ state: "revealed-wrong" })} />);
    const pick = screen.getByTestId("answer-your-pick");
    const tags = pick.closest('[data-testid="answer-result-tags"]')!;
    expect(tags.className).toContain("-top-2");
    expect(pick.className).not.toContain("bottom-0.5");
    expect(screen.getByTestId("answer-correct-tag")).toHaveTextContent("Correct answer");
  });
});

describe("present regions: presentation inside the canonical structure", () => {
  it("puts the media node in the media region and the content inside each canonical button", () => {
    const onSelect = vi.fn();
    render(<CanonicalArena view={view({}, (s) => ({
      media: <div data-test-media>plate</div>,
      optionContent: contentFor(s),
      answerColumns: "wide-2",
    }), {}, onSelect)} />);
    const media = document.querySelector('[data-surface-region="media"]')!;
    expect(media.querySelector("[data-test-media]")).not.toBeNull();
    tablets().forEach((t, i) => {
      expect(t.querySelector(`[data-test-content="${i}"]`)).not.toBeNull();
      // The accessible name stays the option's own label.
      expect(t.getAttribute("aria-label")).toMatch(new RegExp(`^${String.fromCharCode(65 + i)}\\. `));
    });
    fireEvent.click(tablets()[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe("2");
  });

  it("draws a pair side by side with the divider out of the tablets and hidden from AT", () => {
    render(<CanonicalArena view={view({ options: 2 }, (s) => ({
      optionContent: contentFor(s),
      answerColumns: "pair",
      pairDivider: <span>VS</span>,
    }))} />);
    expect(document.querySelector('[data-answer-layout="pair"]')).not.toBeNull();
    const divider = document.querySelector("[data-pair-divider]")!;
    expect(divider.getAttribute("aria-hidden")).toBe("true");
    for (const t of tablets()) expect(t.contains(divider)).toBe(false);
  });

  it("falls back to the canonical labels when the content is not one node per option", () => {
    render(<CanonicalArena view={view({}, (s) => ({ optionContent: contentFor(s).slice(1) }))} />);
    expect(document.querySelector("[data-option-content]")).toBeNull();
    for (const t of tablets()) expect(t.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps the tabs on the tablet's top edge when the tablet carries content", () => {
    render(<CanonicalArena view={view({ state: "revealed-wrong" }, (s) => ({ optionContent: contentFor(s) }))} />);
    const pick = screen.getByTestId("answer-your-pick");
    expect(pick.closest('[data-testid="answer-result-tags"]')!.className).toContain("-top-2");
    expect(pick.closest("[data-quiz-choice]")).not.toBeNull();
  });

  it("never marks a tablet before the reveal, whatever the regions carry", () => {
    render(<CanonicalArena view={view({ state: "selected" }, (s) => ({ optionContent: contentFor(s) }))} />);
    expect(tablets().map((t) => t.dataset.choiceState)).not.toContain("correct");
    expect(screen.queryByTestId("answer-your-pick")).toBeNull();
  });
});

describe("titleDetail", () => {
  it("is drawn after the title, below lg only", () => {
    render(<CanonicalArena view={view({}, undefined, { title: "Question 3 / 10", titleDetail: "2 correct" })} />);
    const title = screen.getByTestId("ranked-header-title");
    const detail = screen.getByTestId("ranked-header-detail");
    expect(title.contains(detail)).toBe(true);
    expect(detail.textContent).toBe(" · 2 correct");
    expect(detail.className).toBe("lg:hidden");
  });
});
