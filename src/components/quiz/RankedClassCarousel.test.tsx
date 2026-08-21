/**
 * LC1 — the Ranked role carousel: navigation, keyboard, selection, and the
 * data-honesty rules for the record strip.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedClassCarousel from "./RankedClassCarousel";
import { RANKED_ROLES, RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import {
  MOGZY_MASCOT_ASSETS,
  MOGZY_ROLE_ASSETS,
} from "@/components/mascot/mascot-assets";

afterEach(cleanup);

function renderCarousel(over: Partial<React.ComponentProps<typeof RankedClassCarousel>> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <RankedClassCarousel value="top" onSelect={onSelect} {...over} />,
  );
  return { ...utils, onSelect };
}

/** The slide currently on the centre of the stage. */
function centre(container: HTMLElement): string {
  const el = container.querySelector('[data-stage="centre"]')!;
  return el.getAttribute("data-testid")!.replace("ranked-class-slide-", "");
}

describe("RankedClassCarousel — stage", () => {
  it("renders every canonical role, in the canonical order, by NAME", () => {
    const { container } = renderCarousel();
    const ids = Array.from(container.querySelectorAll("[data-testid^='ranked-class-slide-']")).map(
      (el) => el.getAttribute("data-testid")!.replace("ranked-class-slide-", ""),
    );
    expect(ids).toEqual([...RANKED_ROLES]);
    for (const role of RANKED_ROLES) {
      expect(screen.getByTestId(`ranked-class-slide-${role}`).textContent).toContain(
        RANKED_ROLE_LABELS[role],
      );
    }
  });

  it("gives every role its own mascot from the canonical map, never the base portrait", () => {
    renderCarousel();
    for (const role of RANKED_ROLES) {
      const img = screen.getByTestId(`ranked-class-slide-${role}`).querySelector("img")!;
      expect(img.getAttribute("src"), role).toBe(MOGZY_ROLE_ASSETS[role]);
      expect(img.getAttribute("src"), role).not.toBe(MOGZY_MASCOT_ASSETS.base);
    }
  });

  it("centres the selected role and puts exactly its two neighbours on the flanks", () => {
    const { container } = renderCarousel({ value: "mid" });
    expect(centre(container)).toBe("mid");
    const flanks = Array.from(container.querySelectorAll('[data-stage="flank"]')).map((el) =>
      el.getAttribute("data-testid")!.replace("ranked-class-slide-", ""),
    );
    expect(flanks.sort()).toEqual(["adc", "jungle"]);
    // Off-stage slides are inert and hidden from assistive tech.
    const off = container.querySelectorAll('[data-stage="off"]');
    expect(off.length).toBe(2);
    off.forEach((el) => expect(el.getAttribute("aria-hidden")).toBe("true"));
  });

  it("is a radiogroup that exposes selection as aria-checked, not styling", () => {
    renderCarousel({ value: "adc" });
    expect(screen.getByRole("radiogroup", { name: "Ranked role" })).toBeTruthy();
    expect(screen.getByTestId("ranked-class-slide-adc").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("ranked-class-slide-top").getAttribute("aria-checked")).toBe("false");
  });
});

describe("RankedClassCarousel — navigation", () => {
  it("the next/previous controls move the ring and select the new role", () => {
    const { container, onSelect, rerender } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(onSelect).toHaveBeenLastCalledWith("jungle");
    expect(centre(container)).toBe("jungle");
    // The host adopts the server's answer, exactly as Quiz.tsx does; moving
    // back to Top is then a real change again.
    rerender(<RankedClassCarousel value="jungle" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    expect(onSelect).toHaveBeenLastCalledWith("top");
  });

  it("wraps around the ring in both directions", () => {
    const { container, onSelect } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    expect(onSelect).toHaveBeenLastCalledWith("support");
    expect(centre(container)).toBe("support");
  });

  it("ArrowRight / ArrowLeft move and select from the keyboard", () => {
    const { onSelect, rerender } = renderCarousel({ value: "mid" });
    const slide = screen.getByTestId("ranked-class-slide-mid");
    fireEvent.keyDown(slide, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("adc");
    rerender(<RankedClassCarousel value="adc" onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByTestId("ranked-class-slide-adc"), { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("mid");
  });

  it("Home / End jump to the first and last role", () => {
    const { onSelect } = renderCarousel({ value: "mid" });
    fireEvent.keyDown(screen.getByTestId("ranked-class-slide-mid"), { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("support");
    fireEvent.keyDown(screen.getByTestId("ranked-class-slide-support"), { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("top");
  });

  it("clicking a visible neighbour selects it", () => {
    const { onSelect } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-slide-jungle"));
    expect(onSelect).toHaveBeenLastCalledWith("jungle");
  });

  it("keeps only ONE tab stop in the group (roving tabindex)", () => {
    const { container } = renderCarousel({ value: "adc" });
    const stops = Array.from(container.querySelectorAll("[data-testid^='ranked-class-slide-']"))
      .filter((el) => el.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("still BROWSES when a role cannot be persisted, but selects nothing", () => {
    const { container, onSelect } = renderCarousel({ value: "top", disabled: true });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(centre(container)).toBe("jungle");
    fireEvent.keyDown(screen.getByTestId("ranked-class-slide-jungle"), { key: "ArrowRight" });
    expect(centre(container)).toBe("mid");
    // Looking is always allowed; committing is not.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("is a plain group, not a radiogroup, when no choice can be committed", () => {
    renderCarousel({ value: "top", disabled: true });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("group", { name: "Ranked role" })).toBeTruthy();
    // No selection is advertised that the host could not honour.
    expect(screen.getByTestId("ranked-class-slide-top").hasAttribute("aria-checked")).toBe(false);
  });
});

/**
 * MALT — the stage must not spend a server write on a choice already made.
 *
 * `onSelect` is the host's R1 persistence (PUT /api/ranked/role), which the
 * backend rate limits to ten writes a minute. Firing it for a move that
 * changes nothing let a reader clicking the standing mascot burn that budget
 * on the role they already had and then be told they were rate limited.
 */
describe("RankedClassCarousel — redundant selection", () => {
  it("does not persist when the already-selected mascot is clicked, however often", () => {
    const { container, onSelect } = renderCarousel({ value: "top" });
    const top = screen.getByTestId("ranked-class-slide-top");
    for (let i = 0; i < 25; i++) fireEvent.click(top);
    expect(onSelect).not.toHaveBeenCalled();
    // The stage did not move either — Top is still the one standing forward.
    expect(centre(container)).toBe("top");
  });

  it("does not persist when a browse returns to the role already saved", () => {
    const { onSelect } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("jungle");
    // The host has not adopted a new value (a refused or in-flight write), so
    // coming back to Top is not a change and must not be written again.
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("still writes the FIRST choice for an account that has no role yet", () => {
    const { onSelect } = renderCarousel({ value: null });
    fireEvent.click(screen.getByTestId("ranked-class-slide-top"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith("top");
  });

  it("persists exactly once per real role change", () => {
    const { onSelect, rerender } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-slide-jungle"));
    expect(onSelect).toHaveBeenNthCalledWith(1, "jungle");

    rerender(<RankedClassCarousel value="jungle" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-class-slide-mid"));
    expect(onSelect).toHaveBeenNthCalledWith(2, "mid");

    rerender(<RankedClassCarousel value="mid" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-class-slide-adc"));
    expect(onSelect).toHaveBeenNthCalledWith(3, "adc");

    rerender(<RankedClassCarousel value="adc" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-class-slide-support"));
    expect(onSelect).toHaveBeenNthCalledWith(4, "support");

    rerender(<RankedClassCarousel value="support" onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("ranked-class-slide-top"));
    expect(onSelect).toHaveBeenNthCalledWith(5, "top");

    expect(onSelect).toHaveBeenCalledTimes(5);
  });

  it("keeps reporting the browsed role on a move that is not persisted", () => {
    const onViewChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <RankedClassCarousel value="top" onSelect={onSelect} onViewChange={onViewChange} />,
    );
    onViewChange.mockClear();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    // Looking is not choosing: the ledger beside the stage still followed the
    // reader's eye all the way back to Top, with no second write behind it.
    expect(onViewChange).toHaveBeenLastCalledWith("top");
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("RankedClassCarousel — record honesty", () => {
  it("shows no record at all when the host has none, never a zeroed one", () => {
    renderCarousel({ value: "top", records: null });
    const strip = screen.getByTestId("ranked-class-record");
    expect(strip.textContent).toContain("No ranked matches on record as Top");
    expect(strip.textContent).not.toContain("0W");
    expect(strip.textContent).not.toMatch(/%/);
  });

  it("renders a real record with its scope stated beside it", () => {
    renderCarousel({
      value: "jungle",
      records: { jungle: { wins: 4, losses: 2, draws: 0 } },
      recordScopeLabel: "Last 6 ranked matches",
    });
    const strip = screen.getByTestId("ranked-class-record");
    expect(strip.textContent).toContain("4W · 2L");
    expect(strip.textContent).toContain("Last 6 ranked matches");
  });

  it("says 'nothing on record' for a role absent from a supplied tally", () => {
    renderCarousel({
      value: "support",
      records: { jungle: { wins: 4, losses: 2, draws: 0 } },
      recordScopeLabel: "Last 6 ranked matches",
    });
    expect(screen.getByTestId("ranked-class-record").textContent).toContain(
      "No ranked matches on record as Support",
    );
  });

  it("tracks the record strip to whichever role is centred", () => {
    renderCarousel({
      value: "top",
      records: { jungle: { wins: 1, losses: 0, draws: 0 } },
      recordScopeLabel: "Last 1 ranked match",
    });
    expect(screen.getByTestId("ranked-class-record").textContent).toContain("No ranked matches");
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(screen.getByTestId("ranked-class-record").textContent).toContain("1W · 0L");
  });
});
