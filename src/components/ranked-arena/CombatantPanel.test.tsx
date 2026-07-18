import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CombatantView } from "@/lib/ranked-core/viewTypes";
import { CombatantPanel, ExperienceMeter, HealthMeter } from "./CombatantPanel";

const combatant = (overrides: Partial<CombatantView> = {}): CombatantView => ({
  playerId: "alice",
  name: "Alice",
  tag: "Tank",
  side: "player",
  classId: "tank",
  hp: 120,
  maxHp: 170,
  xp: 16,
  level: 1,
  nextLevelThreshold: 30,
  currentLevelThreshold: 0,
  hasSubmitted: false,
  abilityWindow: "open",
  hasAbilitySelected: false,
  ...overrides,
});

describe("HealthMeter", () => {
  it("exposes meter semantics with the supplied bounds", () => {
    render(<HealthMeter combatant={combatant()} />);
    const meter = screen.getByRole("meter", { name: /alice hp/i });
    expect(meter).toHaveAttribute("aria-valuenow", "120");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "170");
  });

  it("renders no proportional meter when maxHp is unknown", () => {
    render(<HealthMeter combatant={combatant({ maxHp: null })} />);
    expect(screen.queryByRole("meter")).toBeNull();
    // The absolute HP number is still shown; no max is invented.
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/max hp unavailable/i)).toBeInTheDocument();
  });
});

describe("ExperienceMeter", () => {
  it("shows xp against the supplied next threshold", () => {
    render(<ExperienceMeter combatant={combatant()} />);
    expect(screen.getByText("16 / 30 xp")).toBeInTheDocument();
  });

  it("null next threshold reads as max level, computing nothing", () => {
    render(
      <ExperienceMeter
        combatant={combatant({ level: 3, xp: 80, nextLevelThreshold: null })}
      />,
    );
    expect(screen.getByText(/80 xp · level 3 \(max\)/i)).toBeInTheDocument();
  });

  it("unknown thresholds fall back to a bare xp count", () => {
    render(
      <ExperienceMeter
        combatant={combatant({
          nextLevelThreshold: 30,
          currentLevelThreshold: null,
        })}
      />,
    );
    expect(screen.getByText("16 / 30 xp")).toBeInTheDocument();
  });
});

describe("CombatantPanel", () => {
  it("renders an accessible labelled region with identity and level", () => {
    render(<CombatantPanel combatant={combatant()} />);
    const panel = screen.getByRole("region", { name: /alice panel/i });
    expect(within(panel).getByText("Alice")).toBeInTheDocument();
    expect(within(panel).getByText("Tank")).toBeInTheDocument();
    expect(within(panel).getByText(/lv 1/i)).toBeInTheDocument();
  });

  it("shows only neutral round status — never answer or ability content", () => {
    render(
      <CombatantPanel
        combatant={combatant({
          side: "opponent",
          hasSubmitted: true,
          abilityWindow: "locked",
          hasAbilitySelected: true,
        })}
      />,
    );
    const status = screen.getByRole("status", { name: /alice round status/i });
    expect(within(status).getByText(/answer locked/i)).toBeInTheDocument();
    expect(within(status).getByText(/ability locked/i)).toBeInTheDocument();
    // Neutral only: no ability names/ids and no answer text anywhere.
    expect(status.textContent).not.toMatch(/fortify|brace|barrier|tank\./i);
  });

  it("shows armed-but-open ability state without naming the ability", () => {
    render(
      <CombatantPanel combatant={combatant({ hasAbilitySelected: true })} />,
    );
    expect(screen.getByText(/ability armed/i)).toBeInTheDocument();
  });

  it("hides the round status entirely when asked", () => {
    render(<CombatantPanel combatant={combatant()} showRoundStatus={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("null ability window renders no ability chip at all", () => {
    render(<CombatantPanel combatant={combatant({ abilityWindow: null })} />);
    const status = screen.getByRole("status");
    expect(status.textContent).not.toMatch(/ability/i);
  });
});
