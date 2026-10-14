import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RankedRulesContent } from "./RankedRulesContent";
import { openResultDetails } from "@/components/game-results/GameResultsBody";

afterEach(cleanup);

describe("RC8 Role Challenge rules and review", () => {
  it("states the Role Challenge length and that it is unrated", () => {
    render(<RankedRulesContent variant="role_challenge" />);
    const text = screen.getByTestId("ranked-rules-content").textContent ?? "";
    expect(text).toContain("12 questions · Unrated");
    expect(text).toContain("never changes your Ranked rating");
    expect(text).not.toContain("10 modules");
  });
  it("keeps the Ranked copy unchanged by default", () => {
    render(<RankedRulesContent />);
    expect(screen.getByTestId("ranked-rules-content").textContent).toContain("10 modules");
  });
  it("opens the end screen's Match details in place", () => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
    render(<details data-testid="result-details"><summary>Match details</summary><p>review</p></details>);
    const details = screen.getByTestId("result-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(openResultDetails()).toBe(true);
    expect(details.open).toBe(true);
  });
});
