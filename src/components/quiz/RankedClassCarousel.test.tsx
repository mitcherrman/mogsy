/**
 * LC1 — the Ranked role carousel: navigation, keyboard, selection, and the
 * data-honesty rules for the record strip.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankedClassCarousel from "./RankedClassCarousel";
import { RANKED_ROLES, RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";

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
    const { container, onSelect } = renderCarousel({ value: "top" });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(onSelect).toHaveBeenLastCalledWith("jungle");
    expect(centre(container)).toBe("jungle");
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
    const { onSelect } = renderCarousel({ value: "mid" });
    const slide = screen.getByTestId("ranked-class-slide-mid");
    fireEvent.keyDown(slide, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("adc");
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
