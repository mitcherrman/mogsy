import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JourneySide } from "@/lib/journey/contract";
import { JourneyItemReference, JourneyShardReference, shardContributions } from "./JourneyReferencePopover";

const CSS = readFileSync(join(__dirname, "../../index.css"), "utf8").replace(/\r\n/g, "\n");

const side = {
  side: "subject", championId: "Zed", championName: "Zed", icon: null, level: 2, abilities: [], items: [], vitals: null,
  stats: [
    { key: "bonus_attack_damage", withheld: false, value: 20.8,
      sources: [{ kind: "item", itemId: 1055, name: "Doran's Blade", value: 10 },
        { kind: "stat_mod", row: "offense", shardId: "5008", name: "Adaptive Force", value: 5.4 }] },
    { key: "armor", withheld: true, value: null, withheldReason: "asked" },
  ],
} as unknown as JourneySide;
const shard = { row: "offense", shardId: "5008", name: "Adaptive Force" } as const;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("JPX reference popups", () => {
  it("a shard's contribution is the served stat_sources value, nothing computed", () => {
    expect(shardContributions(side, null, shard)).toEqual([{ label: "Bonus attack damage", value: "+5.4" }]);
    // another row's shard, or an unlisted one, gets no number
    expect(shardContributions(side, null, { ...shard, row: "flex" })).toEqual([]);
    expect(shardContributions(side, null, { row: "defense", shardId: "5001", name: "Health Scaling" })).toEqual([]);
  });

  it("the shard popup prints the served contribution", () => {
    render(<JourneyShardReference side={side} popup={null} shard={shard} testId="s" />);
    fireEvent.click(screen.getByTestId("s"));
    expect(screen.getByTestId("s-pop")).toHaveTextContent("+5.4 Bonus attack damage");
  });

  it("the item popup prints the canonical item's stats as served", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).endsWith("/api/items")
        ? { items: [{ id: 1055, slug: "dorans-blade", name: "Doran's Blade" }] }
        : { item: { stats: [{ key: "ad", label: "Attack Damage", display: "10" }, { key: "hp", label: "Health", display: "80" }] } }),
    })));
    render(<JourneyItemReference itemId={1055} name="Doran's Blade" testId="i" />);
    fireEvent.click(screen.getByTestId("i"));
    await waitFor(() => expect(screen.getByTestId("i-pop")).toHaveTextContent("+10 Attack Damage"), { timeout: 20_000 });
    expect(screen.getByTestId("i-pop")).toHaveTextContent("+80 Health");
  }, 60_000);

  it("the Journey draws no green/red perimeter; the whole ability tile is the knowledge hit area; the role slot is reserved", () => {
    expect(CSS).toMatch(/\.ranked-question-stage:has\(\.journey-viewport\) \.ranked-result-edge \{ display: none; \}/);
    expect(CSS).toMatch(/\.journey-know--ability::before \{\s*inset: auto;[^}]*width: var\(--jb-ability\);[^}]*height: var\(--jb-ability\);/);
    expect(CSS).toMatch(/\.journey-role-slot::before \{\s*content: "Atk";/);
  });
});
