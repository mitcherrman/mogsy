import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeagueDocsItemIndex from "./LeagueDocsItemIndex";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><LeagueDocsItemIndex /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => vi.restoreAllMocks());

describe("Mogzy Archives item directory", () => {
  it("renders the canonical /api/items roster and links to existing item pages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true, count: 2, items: [
        { slug: "amplifying-tome", name: "Amplifying Tome", id: 1052 },
        { slug: "rabadons-deathcap", name: "Rabadon's Deathcap", id: 3089 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    renderPage();
    expect(await screen.findByText("2 current items")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amplifying Tome" })).toHaveAttribute("href", "/items/amplifying-tome");
    expect(screen.getByRole("link", { name: "Rabadon's Deathcap" })).toHaveAttribute("href", "/items/rabadons-deathcap");
  });

  it("filters the server-published roster without creating a second eligibility rule", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true, count: 2, items: [
        { slug: "amplifying-tome", name: "Amplifying Tome", id: 1052 },
        { slug: "rabadons-deathcap", name: "Rabadon's Deathcap", id: 3089 },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    renderPage();
    await screen.findByText("2 current items");
    fireEvent.change(screen.getByRole("textbox", { name: "Search items" }), { target: { value: "deathcap" } });
    expect(screen.getByText("1 of 2 items")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Amplifying Tome" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rabadon's Deathcap" })).toBeInTheDocument();
  });
});
