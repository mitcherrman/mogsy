import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";
import type { PtPhase, PtPressSurfaceProps } from "@/lib/perfect-timing/viewModel";
import { PerfectTimingStage } from "./PerfectTimingStage";
import { DEMO_ROUNDS, demoPress } from "./__stories__/demoViewModels";
import { PHASE_FACE } from "./presentation";

const ROUND = { ...DEMO_ROUNDS[1], rank: 2, rankCount: 3, index: 2, total: 5 };

/** The stage's visible text with the one permitted number — the rank — removed. */
function textWithoutRank(stage: HTMLElement): string {
  const clone = stage.cloneNode(true) as HTMLElement;
  clone.querySelector('[data-testid="pt-rank"]')?.remove();
  return clone.textContent ?? "";
}

afterEach(() => { cleanup(); document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS); });

describe("PerfectTimingStage — the invisible clock", () => {
  it("prints no digit anywhere while running, besides the rank", () => {
    render(<PerfectTimingStage round={ROUND} phase="running" press={demoPress("The ability is back up")} />);
    const stage = screen.getByTestId("pt-stage");
    expect(stage).toHaveAttribute("data-phase", "running");
    expect(textWithoutRank(stage)).not.toMatch(/\d/);
    // The rank is the only number on the sheet, and it is the dealt rank.
    expect(screen.getByTestId("pt-rank")).toHaveTextContent("Rank 2 / 3");
  });

  it("prints no digit in any phase's face copy", () => {
    for (const phase of Object.keys(PHASE_FACE) as PtPhase[]) {
      const face = PHASE_FACE[phase];
      expect(`${face.word}${face.sub}${face.status}`, phase).not.toMatch(/\d/);
    }
  });

  it("carries no periodic animation while running — only the finite cast flash", () => {
    render(<PerfectTimingStage round={ROUND} phase="running" press={demoPress("The ability is back up")} />);
    const stage = screen.getByTestId("pt-stage");
    expect(stage.querySelectorAll(".animate-pulse, .animate-spin, .animate-bounce, .animate-ping")).toHaveLength(0);
    // The only motion hook the running seal exposes is the one-shot flag the stylesheet keys its finite flash on.
    expect(screen.getByTestId("pt-press-surface")).toHaveAttribute("data-animate", "true");
  });

  it("puts the champion's art, the ability icon, the spell letter and the names on the main screen", () => {
    const round = { ...ROUND, iconUrl: "https://assets.test/champions/x/R_x.png", splashUrl: "https://assets.test/champions/x/splash/0_default.jpg" };
    render(<PerfectTimingStage round={round} phase="armed" press={demoPress("Cast")} />);
    const plate = screen.getByTestId("pt-round-plate");
    expect(plate.querySelector(".pt-hero-art img")).toHaveAttribute("src", round.splashUrl);
    expect(screen.getByTestId("pt-hero-icon").querySelector("img")).toHaveAttribute("src", round.iconUrl);
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Archivist (demo)");
    expect(screen.getByTestId("pt-ability")).toHaveTextContent("Sealed Verdict of the Twelfth Hall");
    expect(within(plate).getByLabelText("R ability")).toHaveTextContent("R");
    expect(screen.getByTestId("pt-rank")).toHaveTextContent("Rank 2 / 3");
  });

  it("draws the hero without art when there is no splash, and drops a splash that fails to load", () => {
    const { rerender } = render(<PerfectTimingStage round={{ ...ROUND, splashUrl: null }} phase="armed" press={demoPress("Cast")} />);
    expect(screen.getByTestId("pt-round-plate").querySelector(".pt-hero-art")).toHaveAttribute("data-art", "none");
    rerender(<PerfectTimingStage round={{ ...ROUND, splashUrl: "https://assets.test/broken.jpg" }} phase="armed" press={demoPress("Cast")} />);
    const img = screen.getByTestId("pt-round-plate").querySelector(".pt-hero-art img") as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByTestId("pt-round-plate").querySelector(".pt-hero-art img")).toBeNull();
  });
});

describe("PerfectTimingStage — the press surface", () => {
  it("is ONE element with role button, the hook's label and its disabled state", () => {
    const press: PtPressSurfaceProps = { ...demoPress("Cast the ability"), "aria-disabled": false };
    render(<PerfectTimingStage round={ROUND} phase="armed" press={press} />);
    const surface = screen.getByRole("button", { name: "Cast the ability" });
    expect(surface).toBe(screen.getByTestId("pt-press-surface"));
    expect(surface).toHaveAttribute("tabindex", "0");
    expect(surface).toHaveAttribute("aria-disabled", "false");
    expect(surface).toHaveClass("pt-seal");
    // Every child is decoration: the accessible name is the hook's, not the seal's word.
    expect(within(surface).queryByRole("img")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("relays pointer and key presses to the hook's handlers, and nothing else does", () => {
    const onPointerDown = vi.fn();
    const onKeyDown = vi.fn();
    render(<PerfectTimingStage round={ROUND} phase="armed" press={{ ...demoPress("Cast"), onPointerDown, onKeyDown }} />);
    const surface = screen.getByTestId("pt-press-surface");
    fireEvent.pointerDown(surface, { button: 0, isPrimary: true });
    fireEvent.keyDown(surface, { key: " ", code: "Space" });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    // A press on the plate or the status line reaches no handler.
    fireEvent.pointerDown(screen.getByTestId("pt-status"), { button: 0, isPrimary: true });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });

  it("reflects the disabled surface the hook hands it", () => {
    render(<PerfectTimingStage round={ROUND} phase="submitting" press={demoPress("Timing seal", true)} />);
    expect(screen.getByTestId("pt-press-surface")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent("Locked");
  });

  it("shows the keyboard hint", () => {
    render(<PerfectTimingStage round={ROUND} phase="armed" press={demoPress("Cast")} />);
    expect(screen.getByTestId("pt-hint")).toHaveTextContent(/Space/);
    expect(screen.getByTestId("pt-hint")).toHaveTextContent(/Enter/);
  });
});

describe("PerfectTimingStage — faces and copy", () => {
  it.each([
    ["armed", "Cast"], ["running", "Cooldown"], ["stopped", "Locked"], ["interrupted", "Voided"], ["error", "Halted"],
  ] as [PtPhase, string][])("%s wears the word %s", (phase, word) => {
    render(<PerfectTimingStage round={ROUND} phase={phase} press={demoPress("seal")} />);
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent(word);
    expect(screen.getByTestId("pt-status")).toHaveTextContent(PHASE_FACE[phase].status);
  });

  it("lets the host override the status line and marks a warning tone", () => {
    render(<PerfectTimingStage round={ROUND} phase="error" press={demoPress("seal", true)} statusText="The archive did not answer." />);
    const status = screen.getByTestId("pt-status");
    expect(status).toHaveTextContent("The archive did not answer.");
    expect(status).toHaveAttribute("data-tone", "warn");
    expect(status).toHaveAttribute("role", "status");
  });

  it("holds the plate's box while the first deal is in flight", () => {
    render(<PerfectTimingStage round={null} phase="loading" press={demoPress("seal", true)} />);
    expect(screen.getByTestId("pt-round-plate")).toHaveAttribute("data-empty", "true");
    expect(screen.getByTestId("pt-seal-word")).toHaveTextContent("Dealing");
  });

  it("says 'any rank' for a rank-invariant ability and names the champion, slot and ability", () => {
    render(<PerfectTimingStage round={{ ...ROUND, rank: null }} phase="armed" press={demoPress("Cast")} />);
    expect(screen.getByTestId("pt-rank")).toHaveTextContent(/Any rank/);
    expect(screen.getByTestId("pt-champion")).toHaveTextContent("Archivist (demo)");
    expect(screen.getByTestId("pt-ability")).toHaveTextContent("Sealed Verdict of the Twelfth Hall");
    expect(screen.getByTestId("pt-prompt")).toHaveTextContent("R");
  });

  it("draws the slot monogram when no icon url is supplied, and the icon when one is", () => {
    const { rerender } = render(<PerfectTimingStage round={{ ...ROUND, iconUrl: null }} phase="armed" press={demoPress("Cast")} />);
    expect(screen.getByTestId("pt-seal-icon").querySelector("img")).toBeNull();
    expect(screen.getByTestId("pt-seal-icon")).toHaveTextContent("R");
    rerender(<PerfectTimingStage round={{ ...ROUND, iconUrl: "https://assets.test/champions/x/R_x.png" }} phase="armed" press={demoPress("Cast")} />);
    expect(screen.getByTestId("pt-seal-icon").querySelector("img")).toHaveAttribute("src", "https://assets.test/champions/x/R_x.png");
  });

  it("honours reduced motion by dropping the one-shot flash", () => {
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    render(<PerfectTimingStage round={ROUND} phase="running" press={demoPress("seal")} />);
    expect(screen.getByTestId("pt-press-surface")).toHaveAttribute("data-animate", "false");
  });
});
