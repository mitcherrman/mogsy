/**
 * Matchup friendly-display-name regression (G4 finalization).
 *
 * The player matchup badge must render backend-provided friendly names and NEVER
 * a raw target profile id / slug (e.g. "target_standard_mage"). Normal
 * champion-vs-champion labels stay unchanged; older projections without display
 * names fall back to a formatted id.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readPlayerQuestion, type MasteryPlayerQuestion } from "../contracts/playerQuestion";
import { MasteryQuestionView } from "./MasteryQuestionView";
import fixtures from "../__fixtures__/player_questions.json";

const BASE_DATA = (fixtures as Array<{ data: Record<string, unknown> }>)[0].data;

function withMatchup(overrides: Record<string, unknown>): MasteryPlayerQuestion {
  return readPlayerQuestion({
    ...BASE_DATA,
    matchup_identity: { ...(BASE_DATA.matchup_identity as object), ...overrides },
  });
}

describe("matchup friendly display name", () => {
  afterEach(() => cleanup());

  it("parses champion_*_display, and is null for older projections", () => {
    const withDisplay = withMatchup({ champion_b_display: "Standard level-6 mage target" });
    expect(withDisplay.matchupIdentity.championBDisplay).toBe("Standard level-6 mage target");
    const without = readPlayerQuestion(BASE_DATA);
    expect(without.matchupIdentity.championADisplay).toBeNull();
    expect(without.matchupIdentity.championBDisplay).toBeNull();
  });

  it("renders the friendly target name and never the raw profile slug", () => {
    const q = withMatchup({
      champion_a: "syndra",
      champion_a_display: "Syndra",
      champion_b: "target_standard_mage",
      champion_b_display: "Standard level-6 mage target",
    });
    render(<MasteryQuestionView question={q} total={14} submitting={false} onSubmit={() => {}} />);
    const header = screen.getByTestId("mastery-matchup-header");
    expect(header.textContent).toContain("Standard level-6 mage target");
    expect(header.textContent).not.toContain("target_standard_mage");
    expect(header.textContent).not.toContain("Target_standard_mage");
  });

  it("keeps normal champion-vs-champion labels (fallback to formatted id)", () => {
    // Ahri vs Syndra with NO display names supplied -> formatted from the ids.
    const q = withMatchup({ champion_a: "ahri", champion_b: "syndra" });
    render(<MasteryQuestionView question={q} total={6} submitting={false} onSubmit={() => {}} />);
    const header = screen.getByTestId("mastery-matchup-header");
    expect(header.textContent).toContain("Ahri");
    expect(header.textContent).toContain("Syndra");
  });
});
