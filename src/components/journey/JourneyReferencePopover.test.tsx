import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JourneySide } from "@/lib/journey/contract";
import { JourneyItemReference, JourneyShardReference, shardContributions } from "./JourneyReferencePopover";

// The item API module drags in the whole combat-lab client; the popup only needs `getItem`.
vi.mock("@/lib/items/api", () => ({
  ITEMS_API_BASE_URL: "http://items.test",
  getItem: async () => ({ stats: [{ key: "ad", label: "Attack Damage", display: "10" }, { key: "hp", label: "Health", display: "80" }] }),
}));

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

  it("a shard with served effects always shows its own canonical contribution, for all three rows", () => {
    const rows = [
      { row: "offense", shardId: "5005", name: "Attack Speed", effects: [{ key: "ATTACK_SPEED_PERCENT", label: "Attack Speed", value: 10, unit: "percent" }], want: "+10% Attack Speed" },
      { row: "flex", shardId: "5008", name: "Adaptive Force", effects: [{ key: "ADAPTIVE_FORCE", label: "Adaptive Force", value: 9, unit: "flat" }], want: "+9 Adaptive Force" },
      { row: "defense", shardId: "5001", name: "Health Scaling", effects: [{ key: "HP_PER_LEVEL", label: "Health per level", value: 10, unit: "per_level" }], want: "+10 Health per level" },
    ] as const;
    for (const { want, ...sh } of rows) {
      // a stat_sources value for the same shard must NOT override the served effect
      render(<JourneyShardReference side={side} popup={null} shard={sh as never} testId={`e-${sh.row}`} />);
      fireEvent.click(screen.getByTestId(`e-${sh.row}`));
      expect(screen.getByTestId(`e-${sh.row}-pop`)).toHaveTextContent(want);
      cleanup();
    }
  }, 150_000);

  it("the item popup prints the canonical item's stats as served", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).endsWith("/api/items")
        ? { items: [{ id: 1055, slug: "dorans-blade", name: "Doran's Blade" }] }
        : { item: { stats: [{ key: "ad", label: "Attack Damage", display: "10" }, { key: "hp", label: "Health", display: "80" }] } }),
    })));
    render(<JourneyItemReference itemId={1055} name="Doran's Blade" testId="i" />);
    fireEvent.click(screen.getByTestId("i"));
    await waitFor(() => expect(screen.getByTestId("i-pop")).toHaveTextContent("+10 Attack Damage"), { timeout: 100_000 });
    expect(screen.getByTestId("i-pop")).toHaveTextContent("+80 Health");
  }, 150_000);

  it("the Journey draws no green/red perimeter; the whole ability tile is the knowledge hit area; the role slot is reserved", () => {
    expect(CSS).toMatch(/\.ranked-question-stage:has\(\.journey-viewport\) \.ranked-result-edge \{ display: none; \}/);
    expect(CSS).toMatch(/\.journey-know--ability::before \{\s*inset: auto;[^}]*width: var\(--jb-ability\);[^}]*height: var\(--jb-ability\);/);
    expect(CSS).toMatch(/\.journey-role-slot::before \{\s*content: "Atk";/);
  });
});
