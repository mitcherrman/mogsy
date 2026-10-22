/**
 * Daily three acts: round 1 has no header title beat (the opening tag covers
 * its lead-in), so the opening tag names Act I. Mid and Late are named by the
 * header (`actOpeningTitle`). A V1 Standard's opening is unchanged.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { readDailyRun } from "@/lib/daily-challenge/run/contracts";
import { V5_ELIGIBLE_DAY, wireV5Run } from "@/lib/daily-challenge/run/fixtures";
import { THREE_ACTS_COMPOSITION } from "@/lib/daily-v2/__fixtures__/threeActsComposition";
import { StageIntroBeat } from "./DailyRunBeats";

const run = (composition: unknown) => readDailyRun(wireV5Run(V5_ELIGIBLE_DAY, {}, {
  0: { content: { title: "Today's Challenge", focus: null, composition } } }));

describe("Daily opening tag", () => {
  it("names Act I on a three-act take", () => {
    const r = run(THREE_ACTS_COMPOSITION);
    render(<StageIntroBeat run={r} stage={r.stages[0]} />);
    expect(screen.getByTestId("daily-opening-title")).toHaveTextContent("Daily Challenge");
    expect(screen.getByTestId("daily-opening-act")).toHaveTextContent("Act I · Early");
  });

  it("adds nothing to a V1 Standard", () => {
    const r = run({ recipe_id: "daily-standard-v1", modules: 10, meta_reflex_cards: 5,
      units: ["splash", "splash", "splash", "splash", "meta_reflex", "splash", "splash",
        "splash", "meta_reflex", "journey"] });
    render(<StageIntroBeat run={r} stage={r.stages[0]} />);
    expect(screen.queryByTestId("daily-opening-act")).toBeNull();
  });
});
