import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RankedArenaInspector from "./RankedArenaInspector";

describe("RankedArenaInspector", () => {
  it("renders the canonical arena from fixtures (no crash, default state)", () => {
    render(<RankedArenaInspector />);
    expect(screen.getByTestId("ranked-arena-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("inspector-stage")).toBeInTheDocument();
    // Default "Level 1" state renders canonical combatant panels (hp-<id>).
    expect(screen.getByTestId("hp-you")).toBeInTheDocument();
    expect(screen.getByTestId("hp-opp")).toBeInTheDocument();
  });

  it("imports no gameplay engine / controller / client / service", () => {
    const src = readFileSync(resolve(__dirname, "RankedArenaInspector.tsx"), "utf-8");
    const importLines = src.split("\n").filter((l) => l.trimStart().startsWith("import"));
    const joined = importLines.join("\n");
    // Legit imports: ranked-arena components + ranked-core view types/adapters.
    // Anything below would make this a second implementation of the game.
    for (const forbidden of [
      "useRankedMatch", "useRankedQueue", "ranked-public/client",
      "ranked_public", "/service", "/worker", "duel_round", "duel_match",
      "duel_combat", "createBotMatch",
    ]) {
      expect(joined).not.toContain(forbidden);
    }
    // Positive: it DOES render through the canonical arena components.
    expect(joined).toContain("@/components/ranked-arena/CombatantPanel");
  });
});
