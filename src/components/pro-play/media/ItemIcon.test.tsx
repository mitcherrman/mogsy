import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ItemStrip, inventory, itemIconUrl } from "./ItemIcon";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("inventory", () => {
  it("keeps every served ID in order, duplicates included, with the trinket last", () => {
    // Real LIVE1 row (T1A Haetae, WSCI semifinal game 4).
    expect(inventory([3078, 3111, 3363, 6333, 3026, 2021, 2055, 2055])).toEqual({
      items: [3078, 3111, 6333, 3026, 2021, 2055, 2055],
      trinket: 3363,
    });
  });

  it("ignores anything that is not an item ID and tolerates a missing list", () => {
    expect(inventory([0, -1, "3071", null, { name: "x" }])).toEqual({ items: [3071], trinket: null });
    expect(inventory(null)).toEqual({ items: [], trinket: null });
  });
});

describe("itemIconUrl", () => {
  it("points at the asset store's own item art", () => {
    expect(itemIconUrl(3078)).toMatch(/\/assets\/items\/3078\.png$/);
    expect(itemIconUrl(null)).toBeNull();
    expect(itemIconUrl(0)).toBeNull();
  });
});

describe("ItemStrip", () => {
  it("draws nothing for an empty inventory, and degrades a failed image to an empty frame", () => {
    const { container } = render(<ItemStrip items={[]} />);
    expect(container.innerHTML).toBe("");
    render(<ItemStrip items={[3078]} />);
    const icon = screen.getByTestId("item-icon");
    fireEvent.error(icon.querySelector("img")!);
    expect(icon.getAttribute("data-media-state")).toBe("placeholder");
    expect(icon.querySelector("img")).toBeNull();
  });

  it("names the whole inventory once, from the item index when it knows the item", () => {
    const names = new Map([[3078, "Trinity Force"]]);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <ItemStrip items={[3078, 9999, 3364]} names={names} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("img", { name: "Items: Trinity Force, item 9999, item 3364" })).toBeTruthy();
  });
});
