import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultProgress } from "./ResultProgress";

describe("ResultProgress earned XP presentation", () => {
  it("only celebrates a verified positive XP delta", () => {
    render(<ResultProgress items={[
      { key: "earned", label: "Academy XP earned", value: "+80 XP", icon: "xp", delta: 80 },
      { key: "total", label: "Account XP", value: "4,820", icon: "xp" },
      { key: "level", label: "Match level", value: "Lv 3 · 50 XP", icon: "xp" },
      { key: "unrated", label: "Rating", value: "Unrated", icon: "unrated" },
    ]} />);
    expect(screen.getByTestId("result-progress-earned").querySelector("[data-earned-xp=true]"))
      .toBeInTheDocument();
    expect(screen.getByTestId("result-progress-total").querySelector("[data-earned-xp]"))
      .toBeNull();
    expect(screen.getByTestId("result-progress-level").querySelector("[data-earned-xp]"))
      .toBeNull();
    expect(screen.getByTestId("result-progress-unrated").querySelector("[data-earned-xp]"))
      .toBeNull();
  });

  it("does not celebrate zero or negative XP movement", () => {
    render(<ResultProgress items={[
      { key: "zero", label: "Academy XP", value: "0 XP", icon: "xp", delta: 0 },
      { key: "negative", label: "Academy XP", value: "-10 XP", icon: "xp", delta: -10 },
    ]} />);
    expect(screen.getByTestId("result-progress-zero").querySelector("[data-earned-xp]")).toBeNull();
    expect(screen.getByTestId("result-progress-negative").querySelector("[data-earned-xp]")).toBeNull();
  });
});
