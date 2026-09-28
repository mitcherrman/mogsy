/**
 * DD1-C — cross-layer certification on SERVED bodies.
 *
 * Every body here was captured from the real backend FastAPI app (see the
 * fixture's `_provenance`): GET /api/ranked/matches/{id} before and after each
 * answer, the submit response, and GET /matches/{id}/review. Nothing below is
 * hand-built except where a test says it mutates a served body on purpose.
 *
 * The chain under test: served pre-reveal state carries no values → the strict
 * public reader accepts it → the Data Duel renders with no deciding value or
 * canonical winner → scalar submit → served post-reveal state carries
 * `comparison_values.v1` → the strict reader → revealed Data Duel → Review.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import { readComparisonValues } from "@/features/mastery/contracts/comparisonValues";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  RankedPublicParseError, readMatchReview, readPublicRound,
} from "@/lib/ranked-public/contracts";
import served from "./__fixtures__/dd1_served_http.json";
import { masterySliceModule } from "./masterySliceModule";

type Body = Record<string, unknown>;
const live = served.live as unknown as {
  outcomes: { index: number; selected: string; correct_answer: string }[];
  before: Record<string, Body>;
  submit: Record<string, { challenge_reveal: Body }>;
  after: Record<string, Body>;
  review: Body;
};
const legacy = served.legacy as unknown as { after0: Body; submit0: { challenge_reveal: Body }; review: Body };

/** The frozen block the server disclosed for child `i` (from its own submit response). */
const servedBlock = (i: number) => live.submit[String(i)].challenge_reveal.comparison_values as {
  sides: { token: string; value: number; display: string }[]; unit_label: string; delta_display: string;
};

function renderBody(body: Body, submitChallenge = vi.fn()) {
  const publicRound = readPublicRound(body);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <masterySliceModule.Viewport
        publicRound={publicRound}
        selection={null}
        permissions={NO_INTERACTIONS}
        onSelect={vi.fn()}
        segmentState={publicRound.segmentState}
        actions={{ submitChallenge, busy: false, error: null }}
        skewMs={0}
      />
    </QueryClientProvider>,
  );
  return { view, submitChallenge, publicRound };
}

afterEach(cleanup);

describe("DD1-C served pre-reveal bodies", () => {
  it("the served capture covers A-wins, B-wins, a real tie and a wrong pick", () => {
    const o = live.outcomes;
    expect(o.some((s) => s.correct_answer === "ahri")).toBe(true);
    expect(o.some((s) => s.correct_answer === "syndra")).toBe(true);
    expect(o.some((s) => s.correct_answer === "tie")).toBe(true);
    expect(o.some((s) => s.selected !== s.correct_answer)).toBe(true);
  });

  for (const key of ["0", "5"]) {
    it(`GET before answering child ${key} carries no comparison_values anywhere but earlier reveals`, () => {
      const body = live.before[key];
      const state = (body.payload as Body).segment_state as Body;
      const reveals = (state.own_challenge_reveals ?? []) as Body[];
      expect(reveals.map((r) => r.challenge_index)).not.toContain(Number(key));
      const { own_challenge_reveals: _r, ...rest } = state;
      expect(JSON.stringify({ ...body, payload: { ...(body.payload as Body), segment_state: rest } }))
        .not.toContain("comparison_values");
      // …and the strict public reader accepts the real body.
      expect(() => readPublicRound(body)).not.toThrow();
    });
  }

  it("renders the open duel with no deciding value, margin or canonical winner", () => {
    const { view } = renderBody(live.before["0"]);
    const duel = screen.getByTestId("mig-data-duel");
    expect(duel).toHaveAttribute("data-phase", "open");
    const block = servedBlock(0);
    const html = view.container.innerHTML;
    for (const s of block.sides) expect(html).not.toContain(`${s.display} ${block.unit_label}`);
    expect(html).not.toContain("wins by");
    expect(html).not.toContain("comparison_values");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    for (const side of ["left", "right", "tie"]) {
      const state = screen.getByTestId(`duel-side-${side}`).getAttribute("data-choice-state") ?? "";
      expect(state).not.toMatch(/correct/);
    }
  });

  it("submits the served option token as the existing scalar", () => {
    const { submitChallenge } = renderBody(live.before["0"]);
    fireEvent.click(screen.getByTestId("duel-side-left"));
    fireEvent.click(screen.getByTestId("duel-lock"));
    expect(submitChallenge).toHaveBeenCalledWith(0, { selected: live.outcomes[0].selected });
  });

  it("a served body with the block injected pre-reveal is refused (mutation)", () => {
    const body = structuredClone(live.before["0"]);
    const challenges = (((body.payload as Body).segment_state as Body).challenges as Body).challenges as Body[];
    challenges[0].comparison_values = live.submit["0"].challenge_reveal.comparison_values;
    expect(() => readPublicRound(body)).toThrow(RankedPublicParseError);
  });
});

describe("DD1-C served post-reveal bodies", () => {
  for (const key of ["0", "1", "4", "5"]) {
    it(`child ${key}: the reveal read from GET equals the frozen block the submit disclosed`, () => {
      const { publicRound } = renderBody(live.after[key]);
      const reveal = publicRound.segmentState!.ownChallengeReveals.find((r) => r.challengeIndex === Number(key))!;
      expect(reveal.comparisonValues).toEqual(readComparisonValues(servedBlock(Number(key))));
      const block = servedBlock(Number(key));
      expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
      expect(screen.getByTestId("duel-value-left")).toHaveTextContent(`${block.sides[0].display} ${block.unit_label}`);
      expect(screen.getByTestId("duel-value-right")).toHaveTextContent(`${block.sides[1].display} ${block.unit_label}`);
      const { correct_answer, selected } = live.outcomes[Number(key)];
      const sideOf = (t: string) => (t === block.sides[0].token ? "left" : t === block.sides[1].token ? "right" : "tie");
      // Correctness comes from `correct_answer`, never from the values.
      expect(screen.getByTestId(`duel-side-${sideOf(correct_answer)}`).getAttribute("data-choice-state")).toMatch(/^correct/);
      if (selected !== correct_answer) {
        expect(screen.getByTestId(`duel-side-${sideOf(selected)}`)).toHaveAttribute("data-choice-state", "incorrect-selected");
      }
      if (correct_answer === "tie") {
        expect(screen.getByTestId("mig-data-duel").textContent).toContain(`${block.sides[0].display} ${block.unit_label} each`);
      } else {
        expect(screen.getByTestId("duel-margin-text")).toHaveTextContent(`by ${block.delta_display} ${block.unit_label}`);
      }
    });
  }

  it("the frontend never recomputes the winner: swapping the served values does not move the canonical side", () => {
    const body = structuredClone(live.after["0"]);
    const reveal = (((body.payload as Body).segment_state as Body).own_challenge_reveals as Body[])[0];
    const cv = reveal.comparison_values as { sides: { value: number }[] };
    [cv.sides[0].value, cv.sides[1].value] = [cv.sides[1].value, cv.sides[0].value];
    renderBody(body);
    const correct = live.outcomes[0].correct_answer;
    const side = correct === servedBlock(0).sides[0].token ? "left" : "right";
    expect(screen.getByTestId(`duel-side-${side}`).getAttribute("data-choice-state")).toMatch(/^correct/);
  });
});

describe("DD1-C served Review", () => {
  it("a resolved served Review prints each row's frozen values", () => {
    const view = readMatchReview(live.review);
    const round = view.rounds[0];
    expect(round.revealed).toBe(true);
    round.masteryChallenges!.forEach((c, i) => {
      expect(c.comparisonValues).toEqual(readComparisonValues(servedBlock(i)));
    });
    render(<QuestionReviewCard round={round} position={1} total={1} />);
    const b = servedBlock(0);
    expect(screen.getByTestId("review-mastery-values-0")).toHaveTextContent(`${b.sides[0].display} ${b.unit_label}`);
  });
});

describe("DD1-C served legacy bodies (row frozen before DD1)", () => {
  it("the submit, the GET reveal and the Review omit the key; the duel renders without values", () => {
    expect(legacy.submit0.challenge_reveal).not.toHaveProperty("comparison_values");
    const { publicRound } = renderBody(legacy.after0);
    expect(publicRound.segmentState!.ownChallengeReveals[0]).not.toHaveProperty("comparisonValues");
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
    expect(screen.queryByTestId("duel-margin")).toBeNull();
    expect(screen.getByTestId("mastery-reveal-explanation").textContent).toMatch(/wins by|Tie|same/i);
    const round = readMatchReview(legacy.review).rounds[0];
    render(<QuestionReviewCard round={round} position={1} total={1} />);
    expect(screen.queryByTestId("review-mastery-values-0")).toBeNull();
  });
});

describe("DD1-C real-composer presentation blocks", () => {
  it("widened and decimal blocks read verbatim — no client formatting", () => {
    const blocks = served.composer_blocks as Record<string, unknown>;
    const armor = readComparisonValues(blocks.armor)!;
    expect(armor.sides.map((s) => s.display)).toEqual(["25.04", "25"]);
    expect(armor.deltaDisplay).toBe("0.04");
    expect(armor.displayPrecision).toBe(2);
    const regen = readComparisonValues(blocks.per_5_seconds)!;
    expect(regen.sides.map((s) => s.display)).toEqual(["6.53", "6.5"]);
    expect(regen.unitLabel).toBe("per 5 seconds");
  });

  it("an unknown contract version fails closed; additive v1 metadata is tolerated", () => {
    const base = served.composer_blocks.armor as Record<string, unknown>;
    expect(readComparisonValues({ ...base, contract: "comparison_values.v2" })).toBeNull();
    expect(readComparisonValues({ ...base, future_hint: { x: 1 } })?.sides[0].display).toBe("25.04");
  });
});

describe("DD1-C frontend-first: this frontend against the PRE-DD1 backend (origin/master)", () => {
  const old = served.old_backend as unknown as {
    outcomes: { selected: string; correct_answer: string }[];
    before0: Body; after: Record<string, Body>; review: Body;
  };

  it("opens, reveals (correct and wrong picks) and reviews without values, never crashing", () => {
    expect(JSON.stringify(old)).not.toContain("comparison_values");
    renderBody(old.before0);
    expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "open");
    cleanup();
    for (const key of ["0", "1"]) {
      const { publicRound } = renderBody(old.after[key]);
      const reveal = publicRound.segmentState!.ownChallengeReveals.find((r) => r.challengeIndex === Number(key))!;
      expect(reveal).not.toHaveProperty("comparisonValues");
      expect(screen.getByTestId("mig-data-duel")).toHaveAttribute("data-phase", "revealed");
      expect(screen.queryByTestId("duel-margin")).toBeNull();
      expect(screen.getByTestId("mastery-reveal-explanation").textContent).not.toBe("");
      cleanup();
    }
    const round = readMatchReview(old.review).rounds[0];
    render(<QuestionReviewCard round={round} position={1} total={1} />);
    expect(screen.queryByTestId("review-mastery-values-0")).toBeNull();
    expect(screen.getByTestId("review-mastery-explanation-0").textContent).not.toBe("");
  });
});
