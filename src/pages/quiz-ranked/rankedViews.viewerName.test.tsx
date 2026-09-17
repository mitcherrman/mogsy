/**
 * RMOB2 — Ranked names the viewer by their display name, everywhere it used to
 * print the literal "You"; "You" survives only as the fallback for an account
 * with no name.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2, withPointsScoring } from "@/lib/ranked-public/fixtures";
import { projectCombatants } from "./rankedViews";
import { RankedScoreline } from "./RankedScoreline";

afterEach(cleanup);

const pub = () => readPublicRound(withPointsScoring(publicRoundV2(), {}));

describe("the viewer's name", () => {
  it("is the display name the page passes in", () => {
    const views = projectCombatants(pub(), "userA", "Kalista_Enjoyer");
    expect(views.player.name).toBe("Kalista_Enjoyer");
    expect(views.opponent.name).toBe("Opponent");
  });

  it("falls back to 'You' only when there is no name", () => {
    expect(projectCombatants(pub(), "userA").player.name).toBe("You");
  });

  it("labels the final scoreline with it, keeping the stable test ids", () => {
    render(<RankedScoreline you={21} opponent={18} result="victory"
      modulesPlayed={10} ratingDelta={null} youLabel="Kalista_Enjoyer" />);
    expect(screen.getByText("Kalista_Enjoyer")).toBeInTheDocument();
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.getByTestId("final-score-you")).toHaveTextContent("21");
  });
});
