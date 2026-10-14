import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { entityHref } from "@/lib/public-knowledge-stats/entity-links";
import { ModeLedger } from "./KnowledgeStatsPage";
import type { ModeSummary } from "@/lib/public-knowledge-stats/api";

describe("KnowledgeStatsPage archive links", () => {
  it("links supported entities into the existing Archives", () => {
    expect(entityHref({ entity_type: "champion", entity_key: "Dr. Mundo" }))
      .toBe("/lol/docs/champions/dr-mundo");
    expect(entityHref({ entity_type: "item", entity_key: "Rabadon's Deathcap" }))
      .toBe("/items/rabadons-deathcap");
  });

  it("does not invent archive destinations for unsupported entity pages", () => {
    expect(entityHref({ entity_type: "rune", entity_key: "Conqueror" })).toBeNull();
    expect(entityHref({ entity_type: "summoner_spell", entity_key: "Flash" })).toBeNull();
  });
});

describe("KnowledgeStatsPage mode ledger", () => {
  it("keeps empty and unavailable modes visible with honest status", () => {
    const base = {
      correct: 0, incorrect: 0, accuracy: null,
      distinct_question_keys: 0, first_answered_at: null,
      last_answered_at: null, recorded_timeouts: 0,
    };
    const modes: ModeSummary[] = [
      { ...base, mode: "practice", answers: 72, correct: 31,
        incorrect: 41, accuracy: 0.4306, available: true },
      { ...base, mode: "time_trial", answers: 0, available: true },
      { ...base, mode: "daily_challenge", answers: 309,
        recorded_timeouts: 146, available: true },
      { ...base, mode: "role_challenge", answers: 0, available: false },
      { ...base, mode: "ranked", answers: 230, available: true },
      { ...base, mode: "journey", answers: 8, available: true },
    ];

    render(<ModeLedger modes={modes} />);

    expect(screen.getByRole("heading", { name: "Mode ledger" })).toBeInTheDocument();
    expect(screen.getByText("Time Trial")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByText("146 timeouts")).toBeInTheDocument();
  });
});
