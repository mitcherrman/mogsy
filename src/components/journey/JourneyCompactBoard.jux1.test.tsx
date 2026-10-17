/**
 * JUX1 — the compact (top-and-bottom) board refinement.
 *
 * jsdom has no layout and no container queries, so what is provable here is
 * that the ability tile carries the hooks the compact stylesheet reads, that
 * nothing about the tile's content changed (art, letter, rank, lock — the same
 * nodes for every board density), and that the new stylesheet section lives
 * entirely inside the existing compact breakpoint and touches no board height.
 * The geometry itself (sizes, no overlap, unchanged side-by-side board) is
 * certified in a browser — see `JOURNEY_JUX1_HANDOFF.md`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AbilityRankPips } from "./JourneyPrimitives";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").replace(/\r\n/g, "\n");
const START = "JUX1 — THE COMPACT (TOP-AND-BOTTOM) BOARD, REFINED.";
const section = CSS.slice(CSS.indexOf(START));
/** The section's rules, comment stripped. */
const rules = section.slice(section.indexOf("*/") + 2);

afterEach(cleanup);

const ability = (rank: number, maxRank: number | null = null) =>
  ({ slot: "E", rank, maxRank, name: "Aegis Assault", icon: null }) as never;

describe("the ability tile carries the compact hooks, and the same content", () => {
  it("a learned ability: tile, art, slot letter and rank digit", () => {
    render(<AbilityRankPips ability={ability(2)} champion="Pantheon" side="subject" />);
    const root = screen.getByTestId("journey-ability-subject-E");
    const tile = root.querySelector(".journey-ability__tile")!;
    expect(tile).not.toBeNull();
    expect(tile.querySelector(".journey-ability__art")).not.toBeNull();
    expect(tile.querySelector(".journey-ability__slot")!.textContent).toBe("E");
    expect(tile.querySelector(".journey-rank-digit")!.textContent).toBe("2");
    // the accessible name is unchanged: slot, name, rank
    expect(root).toHaveAttribute("aria-label", "Pantheon E (Aegis Assault): rank 2");
  });

  it("a locked ability: the letter, no rank digit, the art greyed", () => {
    render(<AbilityRankPips ability={ability(0)} champion="Pantheon" side="subject" />);
    const root = screen.getByTestId("journey-ability-subject-E");
    expect(root).toHaveAttribute("data-locked", "true");
    expect(root.querySelector(".journey-rank-digit")).toBeNull();
    expect(root.querySelector(".journey-ability__art")!.className).toMatch(/opacity-30 grayscale/);
  });

  it("a served maximum keeps its pips under the tile (the caption rule skips it)", () => {
    render(<AbilityRankPips ability={ability(2, 5)} champion="Pantheon" side="subject" />);
    const pips = screen.getByTestId("journey-pips-subject-E");
    expect(pips.parentElement).toBe(screen.getByTestId("journey-ability-subject-E"));
    expect(pips.children).toHaveLength(5);
  });
});

describe("the stylesheet: compact boards only", () => {
  it("is the last section, and every rule sits inside the existing compact breakpoint", () => {
    expect(CSS.indexOf(START)).toBeGreaterThan(0);
    const blocks = rules.split(/\n(?=@container)/).map((b) => b.trim()).filter(Boolean);
    expect(blocks.length).toBe(2);
    expect(blocks[0].startsWith("@container (max-width: 25.99rem) {")).toBe(true);
    expect(blocks[1].startsWith("@container (max-width: 25.99rem) and (min-height: 11rem) {")).toBe(true);
  });

  it("adds no board height, no scrolling, and hides nothing", () => {
    expect(rules).not.toMatch(/--jb-band-h|--jq-|\.journey-band|\.journey-board\s*\{/);
    expect(rules).not.toMatch(/overflow(-[xy])?:\s*(auto|scroll)/);
    expect(rules).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it("sizes abilities and items from the row's width, items at 0.8 of an ability", () => {
    expect(rules).toMatch(/--jb-ability: clamp\(1\.25rem,\s*calc\(\(100cqw - 2 \* var\(--jbc-pad\) - var\(--jb-portrait\)/);
    expect(rules).toMatch(/--jb-slot: calc\(var\(--jb-ability\) \* 0\.8\);/);
  });
});
