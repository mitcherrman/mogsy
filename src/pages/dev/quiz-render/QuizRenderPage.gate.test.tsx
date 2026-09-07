/**
 * CON1 Step 1D — the completeness gate, end to end through the REAL harness
 * page.
 *
 * The Playwright runner never sees a resolver result; it sees two DOM
 * attributes and hands them to `evaluatePresentationGate`. That hand-off is the
 * whole gate, so these tests reproduce it exactly: render `/dev/quiz-render`,
 * read `data-quiz-presentation` / `data-quiz-presentation-band` off the card
 * the same way `runDomQa` does, and assert the verdict the runner would reach.
 *
 * No mock stands in for the page and no fixture stands in for the layout
 * authority — a gate proved only against a resolver would not catch the page
 * failing to stamp what the gate reads.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import QuizRenderPage from "./QuizRenderPage";
import {
  PRESENTATION_BAND_ATTRIBUTE,
  PRESENTATION_REASON_ATTRIBUTE,
  PRESENTATION_STATUS_ATTRIBUTE,
  QUIZ_RENDER_WINDOW_KEY,
  type RenderQuestion,
} from "@/lib/quiz-screenshot/types";
import { evaluatePresentationGate } from "@/lib/quiz-screenshot/presentationGate";
import {
  COMBAT_SCENARIO,
  COOLDOWN_HASTE,
  LIFECYCLE_SCENARIO,
  MINION_EXACT,
  MINION_WAVE,
  PLAIN_MCQ,
  PRO_SCOPE_COMPARISON,
  OVERSIZED_PRESENTATION_QUESTION,
} from "@/lib/quiz-screenshot/presentationFixtures";

const ALL: RenderQuestion[] = [
  PLAIN_MCQ,
  COMBAT_SCENARIO,
  LIFECYCLE_SCENARIO,
  COOLDOWN_HASTE,
  MINION_EXACT,
  MINION_WAVE,
  PRO_SCOPE_COMPARISON,
  OVERSIZED_PRESENTATION_QUESTION,
];

function inject(questions: RenderQuestion[] | null) {
  const w = window as unknown as Record<string, unknown>;
  if (questions) w[QUIZ_RENDER_WINDOW_KEY] = { questions };
  else delete w[QUIZ_RENDER_WINDOW_KEY];
}

/**
 * Exactly what `scripts/quiz-screenshots/capture.ts::runDomQa` does — one
 * element query, three `getAttribute` reads. Text is never consulted.
 */
function readDomSignals(container: HTMLElement) {
  const el = container.querySelector(`[${PRESENTATION_STATUS_ATTRIBUTE}]`);
  return {
    status: el?.getAttribute(PRESENTATION_STATUS_ATTRIBUTE) ?? null,
    band: el?.getAttribute(PRESENTATION_BAND_ATTRIBUTE) ?? null,
    reason: el?.getAttribute(PRESENTATION_REASON_ATTRIBUTE) ?? null,
  };
}

function capture(question: RenderQuestion, allowIncomplete = false) {
  inject(ALL);
  // The app mounts /dev/quiz-render inside its QueryClientProvider, and the
  // cinematic champion card reads champion assets through it. Without the
  // provider a cinematic band would throw here for a reason the real capture
  // never has — so the harness is rendered in the context it actually runs in.
  const { container } = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter
        initialEntries={[`/dev/quiz-render?q=${question.id}&state=question&format=square`]}
      >
        <QuizRenderPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const dom = readDomSignals(container);
  return {
    dom,
    verdict: evaluatePresentationGate({
      ...dom,
      questionId: question.id,
      questionKey: question.question_key ?? null,
      format: "square",
      state: "question",
      allowIncomplete,
    }),
  };
}

afterEach(() => {
  cleanup();
  inject(null);
});

describe("default policy, decided from the page's own attributes", () => {
  it("1 — a plain MCQ with no presentation PASSES", () => {
    const { dom, verdict } = capture(PLAIN_MCQ);
    expect(dom.status).toBe("absent");
    expect(dom.band).toBeNull();
    expect(verdict.failed).toBe(false);
    expect(verdict.findings).toEqual([]);
  });

  it("2 — a combat scenario with a valid band PASSES", () => {
    const { dom, verdict } = capture(COMBAT_SCENARIO);
    expect(dom.status).toBe("family");
    expect(dom.band).toBe("family");
    expect(verdict.failed).toBe(false);
  });

  it("3 — a lifecycle scenario with a valid band PASSES", () => {
    const { dom, verdict } = capture(LIFECYCLE_SCENARIO);
    expect(dom.status).toBe("family");
    expect(dom.band).toBe("family");
    expect(verdict.failed).toBe(false);
  });

  it("4 — a cinematic band with no family layout PASSES", () => {
    const { dom, verdict } = capture(COOLDOWN_HASTE);
    expect(dom.band).toBe("cinematic");
    expect(verdict.failed).toBe(false);
  });

  it("5 — a non-null presentation that renders text-only FAILS", () => {
    const { dom, verdict } = capture(PRO_SCOPE_COMPARISON);
    expect(dom.status).toBe("text-only");
    expect(dom.band).toBe("compact");
    expect(verdict.failed).toBe(true);
    expect(verdict.findings[0].severity).toBe("failure");
  });

  it("6 — a presentation the transport reader discards FAILS", () => {
    // The row captures cleanly and its premise is gone: `readOptionalPresentation`
    // drops a payload over its node budget, so no scenario source is built. The
    // gate refuses it rather than exporting a card that looks finished.
    const { dom, verdict } = capture(OVERSIZED_PRESENTATION_QUESTION);
    expect(dom.status).toBe("no-scenario");
    expect(verdict.failed).toBe(true);
    expect(dom.reason).toBeTruthy();
    expect(verdict.findings[0].message).toContain(dom.reason!);
    expect(verdict.findings[0].severity).toBe("failure");
  });

  it("7 — raw metadata alone triggers neither a failure nor a reconstructed scenario", () => {
    // MINION_WAVE carries the COMPLETE stored blob, solution fields included,
    // and no presentation. Nothing may be built from it, and its absence is
    // not a defect.
    const { dom, verdict } = capture(MINION_WAVE);
    expect(MINION_WAVE.metadata?.breakpoint_wave_number).toBeDefined();
    expect(MINION_WAVE.metadata?.composition).toBeDefined();
    expect(dom.status).toBe("absent");
    expect(dom.band).toBeNull();
    expect(verdict.failed).toBe(false);
  });
});

describe("Minion XP, the live case for this gate", () => {
  it("8 — `exact_minion` FAILS today: a presentation exists, its band does not", () => {
    const { dom, verdict } = capture(MINION_EXACT);
    expect(dom.status).toBe("text-only");
    expect(dom.band).toBe("compact");
    expect(verdict.failed).toBe(true);
    const [finding] = verdict.findings;
    expect(finding.message).toContain(String(MINION_EXACT.id));
    expect(finding.message).toContain("presentation=text-only");
    expect(finding.message).toContain("band=compact");
    // The failure states what was incomplete — it does not name the missing
    // component, because the gate does not know about MinionXpBand and must
    // not: when that rule merges, `band` changes and this becomes a pass with
    // nothing in CON1 edited.
    expect(finding.message).not.toContain("MinionXpBand");
  });

  it("9 — `wave` does NOT fail merely for having no band", () => {
    expect(capture(MINION_WAVE).verdict.failed).toBe(false);
  });
});

describe("diagnostic override", () => {
  it("10 — lets the text-only capture through", () => {
    const { verdict } = capture(MINION_EXACT, true);
    expect(verdict.failed).toBe(false);
    expect(verdict.overridden).toBe(true);
  });

  it("11 — and records a warning naming the flag", () => {
    const { verdict } = capture(MINION_EXACT, true);
    expect(verdict.findings).toHaveLength(1);
    expect(verdict.findings[0].severity).toBe("warning");
    expect(verdict.findings[0].message).toContain("--allow-incomplete-presentation");
  });

  it("12 — changes nothing for a complete capture", () => {
    expect(capture(COMBAT_SCENARIO, true).verdict.findings).toEqual([]);
    expect(capture(PLAIN_MCQ, true).verdict.findings).toEqual([]);
  });
});
