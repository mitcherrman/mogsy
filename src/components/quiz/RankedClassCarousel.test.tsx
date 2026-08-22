/**
 * LC1 — the Ranked role carousel: navigation, keyboard, selection, and the
 * data-honesty rules for the record strip.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * The real `usePlaySfx` reads the app's one sound-settings store, which
 * constructs the Supabase client — and the pinned jsdom gives that client no
 * working Storage, so importing it turns a clean suite into one carrying an
 * unhandled rejection (see `src/test/localStorageStub.ts`). The gate itself is
 * covered by `src/lib/audio/play-sfx.test.ts`; here it is a spy, which is also
 * exactly what a test asserting "one action, one cue" wants.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

import RankedClassCarousel from "./RankedClassCarousel";
import { RANKED_ROLES, RANKED_ROLE_LABELS } from "@/lib/ranked-public/roles";
import {
  MOGZY_MASCOT_ASSETS,
  MOGZY_ROLE_ASSETS,
} from "@/components/mascot/mascot-assets";
import { RANKED_ROLE_CHAMPIONS } from "@/lib/ranked-public/roleChampions";

afterEach(cleanup);
beforeEach(() => sfx.play.mockClear());

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

/**
 * MALT — the League anchor beside the selected mascot.
 *
 * The rules under test are the ones that keep this a role stage rather than a
 * champion gallery: ONE medallion, for the role on stage, never five.
 */
describe("RankedClassCarousel — champion anchor", () => {
  it("shows exactly one champion medallion, whichever role is on stage", () => {
    const { container } = renderCarousel({ value: "top" });
    expect(container.querySelectorAll("[data-testid='ranked-class-champion']").length).toBe(1);
    // And it stays one after moving the ring, not one per role visited.
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(container.querySelectorAll("[data-testid='ranked-class-champion']").length).toBe(1);
  });

  it("draws the canonical champion for every one of the five roles", () => {
    for (const role of RANKED_ROLES) {
      cleanup();
      renderCarousel({ value: role });
      const champion = RANKED_ROLE_CHAMPIONS[role];
      const medallion = screen.getByTestId("ranked-class-champion");
      expect(medallion.getAttribute("data-role"), role).toBe(role);
      expect(medallion.getAttribute("data-champion"), role).toBe(champion.name);
      expect(medallion.querySelector("img")!.getAttribute("src"), role).toContain(
        champion.iconPath,
      );
    }
  });

  it("follows the SELECTION as the ring moves, one champion at a time", () => {
    renderCarousel({ value: "top" });
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-champion")).toBe("Darius");
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-champion")).toBe("Qiyana");
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    expect(screen.getByTestId("ranked-class-champion").getAttribute("data-champion")).toBe("Darius");
  });

  it("is decorative — it never becomes part of a role option's accessible name", () => {
    renderCarousel({ value: "mid" });
    const medallion = screen.getByTestId("ranked-class-champion");
    expect(medallion.getAttribute("aria-hidden")).toBe("true");
    expect(medallion.querySelector("img")!.getAttribute("alt")).toBe("");
    // Mounted on the stage, not inside a slide: that is what makes "only one"
    // structural rather than a rule someone has to remember.
    expect(medallion.closest("[data-testid^='ranked-class-slide-']")).toBeNull();
    // The role is still named by TEXT on its own slide.
    expect(screen.getByTestId("ranked-class-slide-mid").textContent).toContain("Mid");
  });

  it("keeps the mascot primary: the medallion is far smaller than the figure", () => {
    renderCarousel({ value: "adc" });
    const medallion = screen.getByTestId("ranked-class-champion");
    // The figure takes the stage's whole height; the anchor is a fixed coin.
    expect(medallion.className).toContain("h-10");
    expect(screen.getByTestId("ranked-class-slide-adc").querySelector("img")!.className).toContain(
      "h-full",
    );
  });
});


/* ────────────────────────────────────────────────────────────────────────────
 * PLAY1 SOUND — the role tick on the LOBBY's stage.
 *
 * The lobby ring and the match-entry record's stepper move one shared
 * selection, so they must sound the same. The cue is fired from `moveTo` and
 * from nowhere else: that is the single funnel every INTENTIONAL move goes
 * through, while the passive path — the effect that follows the `value` prop —
 * calls `setViewIndex` directly and therefore cannot make a sound.
 *
 * That is what keeps "one press, two surfaces, one sound" true from either
 * side, and what keeps a role restored from the URL after the signup gate's
 * auth trip silent.
 * ──────────────────────────────────────────────────────────────────────────── */

const cues = () => sfx.play.mock.calls.flat();

describe("RankedClassCarousel — the role tick", () => {
  it("ticks once for the Next arrow", () => {
    renderCarousel();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(cues()).toEqual(["roleStep"]);
  });

  it("ticks once for the Previous arrow", () => {
    renderCarousel();
    fireEvent.click(screen.getByTestId("ranked-class-previous"));
    expect(cues()).toEqual(["roleStep"]);
  });

  it("ticks once for a click on a neighbouring mascot", () => {
    renderCarousel();
    fireEvent.click(screen.getByTestId("ranked-class-slide-jungle"));
    expect(cues()).toEqual(["roleStep"]);
  });

  it("ticks once per keyboard step", () => {
    const { container } = renderCarousel();
    const stage = container.querySelector('[data-testid="ranked-class-slide-top"]')!;
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(cues()).toEqual(["roleStep"]);
  });

  /**
   * A press that does not move the ring is not a step. The stage already
   * refuses to WRITE for it (e07da052 — clicking the standing mascot used to
   * spend one of ten `role_set` writes a minute); it must not make a noise for
   * it either.
   */
  it("says nothing when the figure already on stage is clicked, however often", () => {
    renderCarousel();
    const centreSlide = screen.getByTestId("ranked-class-slide-top");
    fireEvent.click(centreSlide);
    fireEvent.click(centreSlide);
    fireEvent.click(centreSlide);
    expect(cues()).toEqual([]);
  });

  it("gives a hammered ring one tick per notch — no more, and no fewer", () => {
    const { container } = renderCarousel();
    const next = screen.getByTestId("ranked-class-next");
    for (let i = 0; i < 5; i += 1) fireEvent.click(next);
    expect(cues()).toEqual(Array(5).fill("roleStep"));
    // Five notches around a five-role ring: all the way back to where it began.
    expect(centre(container)).toBe("top");
  });

  it("still ticks on a stage that cannot select — browsing is a real action", () => {
    renderCarousel({ disabled: true });
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    expect(cues()).toEqual(["roleStep"]);
  });

  /* ── Passive synchronisation is silent ──────────────────────────────── */

  it("makes NO sound when the host moves the role for it", () => {
    // This is the record's arrow being pressed on the sheet above: the shared
    // selection changes, the ring follows, and only the pressed surface speaks.
    const { rerender, container } = renderCarousel({ value: "top" });
    sfx.play.mockClear();
    rerender(<RankedClassCarousel value="adc" onSelect={vi.fn()} />);
    expect(centre(container)).toBe("adc");
    expect(cues()).toEqual([]);
  });

  it("makes NO sound on first paint, however the stage is seeded", () => {
    renderCarousel({ value: "support" });
    expect(cues()).toEqual([]);
  });

  it("makes NO sound when the host re-renders for an unrelated reason", () => {
    const { rerender } = renderCarousel({ value: "mid" });
    sfx.play.mockClear();
    rerender(<RankedClassCarousel value="mid" onSelect={vi.fn()} busyRole="mid" />);
    rerender(<RankedClassCarousel value="mid" onSelect={vi.fn()} />);
    expect(cues()).toEqual([]);
  });

  it("is the ONLY cue this stage makes — no generic press on top of the tick", () => {
    renderCarousel();
    fireEvent.click(screen.getByTestId("ranked-class-next"));
    fireEvent.click(screen.getByTestId("ranked-class-slide-adc"));
    expect(new Set(cues())).toEqual(new Set(["roleStep"]));
  });
});
