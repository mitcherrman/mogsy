/**
 * RD2 — the two non-combat duel actions, on the mascot and on the neutral
 * emblem a role-less (bot) duelist stands in its place.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { RoleMascot } from "./RoleMascot";
import { RoleCrest, roleIdentityFor } from "@/components/ranked-arena/roleIdentity";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"), media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(), onchange: null,
  })));
}

const css = fs.readFileSync(path.resolve(__dirname, "../../index.css"), "utf8");
const layer = () => screen.getByTestId("role-mascot-action");

describe("celebrate and focus on the role mascot", () => {
  it.each([["celebrate", "role-mascot-celebrate"], ["focus", "role-mascot-focus"]] as const)(
    "%s plays its own class on a new id, and not again for the same id", (action, cls) => {
      stubReducedMotion(false);
      const { rerender } = render(<RoleMascot role="mid" action={null} actionId={null} />);
      rerender(<RoleMascot role="mid" action={action} actionId={`lead:3:you`} />);
      expect(layer()).toHaveClass(cls);
      expect(layer().dataset.playing).toBe(action);
      // The animation ends; a re-render with the SAME event id must not replay.
      layer().dispatchEvent(new Event("animationend"));
      expect(layer().dataset.playing).toBeUndefined();
      rerender(<RoleMascot role="mid" action={action} actionId={`lead:3:you`} />);
      expect(layer().dataset.playing).toBeUndefined();
      // A different event does.
      rerender(<RoleMascot role="mid" action={action} actionId={`lead:5:you`} />);
      expect(layer().dataset.playing).toBe(action);
    });

  it("does not play for the event id it mounted with", () => {
    stubReducedMotion(false);
    render(<RoleMascot role="top" action="focus" actionId="final:10" />);
    expect(layer().dataset.playing).toBeUndefined();
  });

  it("plays nothing under reduced motion, and the stylesheet degrades both to a still blip", () => {
    stubReducedMotion(true);
    const { rerender } = render(<RoleMascot role="top" action={null} actionId={null} />);
    rerender(<RoleMascot role="top" action="celebrate" actionId="speed:2:you" />);
    expect(layer().dataset.playing).toBeUndefined();
    expect(css).toMatch(/\.role-mascot-action\.role-mascot-celebrate,\s*\.role-mascot-action\.role-mascot-focus \{\s*animation: role-mascot-reduced/);
  });

  it("both keyframes are transform/filter only — no sideways travel toward the other column", () => {
    for (const name of ["role-mascot-celebrate", "role-mascot-focus"]) {
      const kf = new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`).exec(css)?.[0] ?? "";
      expect(kf).not.toBe("");
      expect(kf).not.toMatch(/translateX|width|height|margin|padding|top:|left:/);
      expect(kf).not.toMatch(/translate\(/);
    }
  });
});

describe("the neutral emblem (a bot seat)", () => {
  const bot = roleIdentityFor(null);
  const action = () => screen.getByTestId("role-crest-neutral-action");

  it("stands a neutral emblem with no role art", () => {
    stubReducedMotion(false);
    render(<RoleCrest identity={bot} mirrored size="stage" />);
    expect(screen.getByTestId("role-crest")).toHaveAttribute("data-role", "none");
    expect(screen.queryByTestId("role-crest-mascot")).toBeNull();
    expect(screen.getByTestId("role-crest-neutral-motion")).toHaveClass("role-emblem-motion");
  });

  it("plays match-event reactions edge-triggered, never on mount, never twice for one id", () => {
    stubReducedMotion(false);
    const { rerender } = render(<RoleCrest identity={bot} mirrored size="stage"
      action="cheer" actionId="score:1:bot" />);
    expect(action().dataset.playing).toBeUndefined();
    rerender(<RoleCrest identity={bot} mirrored size="stage" action="celebrate" actionId="lead:2:bot" />);
    expect(action()).toHaveClass("role-mascot-action", "role-mascot-celebrate");
    action().dispatchEvent(new Event("animationend"));
    rerender(<RoleCrest identity={bot} mirrored size="stage" action="celebrate" actionId="lead:2:bot" />);
    expect(action().dataset.playing).toBeUndefined();
    rerender(<RoleCrest identity={bot} mirrored size="stage" action="focus" actionId="final:10" />);
    expect(action().dataset.playing).toBe("focus");
  });

  it("does nothing under reduced motion", () => {
    stubReducedMotion(true);
    const { rerender } = render(<RoleCrest identity={bot} mirrored size="stage" />);
    rerender(<RoleCrest identity={bot} mirrored size="stage" action="cheer" actionId="score:1:bot" />);
    expect(action().dataset.playing).toBeUndefined();
  });

  it("receives the mascot's tuning variables, so the same keyframes resolve on it", () => {
    expect(css).toMatch(/\.role-mascot,\s*\.role-emblem-motion \{/);
  });
});
