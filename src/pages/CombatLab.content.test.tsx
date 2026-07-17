import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CombatLab from "./CombatLab";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: "free" }),
}));

// The page pings its backend on mount — keep the test offline and fast.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline in test"))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/combat-lab"]}>
        <CombatLab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Combat Lab publisher content", () => {
  it("has a real H1 describing the tool", () => {
    mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Combat Lab: League of Legends damage simulator/i);
  });

  it("renders visible explanatory sections (what/simulate/uses/limitations)", () => {
    mount();
    expect(screen.getByText(/What Combat Lab is/i)).toBeInTheDocument();
    expect(screen.getByText(/What you can simulate/i)).toBeInTheDocument();
    expect(screen.getByText(/Example uses/i)).toBeInTheDocument();
    expect(screen.getByText(/Limitations and how to read results/i)).toBeInTheDocument();
    expect(screen.getByText(/modeled estimates/i)).toBeInTheDocument();
  });

  it("carries the Riot independence disclaimer", () => {
    mount();
    expect(screen.getByText(/isn't endorsed by Riot Games/i)).toBeInTheDocument();
  });

  it("still renders the interactive tool alongside the content", () => {
    const { container } = mount();
    // The workspace (Radix Tabs root) mounts even when the backend is offline.
    expect(container.querySelector("[data-orientation]")).toBeTruthy();
    expect(screen.getAllByText(/Combat Lab/i).length).toBeGreaterThan(0);
  });

  it("keeps the results ad slot region result-only (absent with no simulation)", () => {
    const { container } = mount();
    expect(container.querySelector("[data-results-area]")).toBeNull();
    expect(container.querySelector('[data-ad-slot="combat_results"]')).toBeNull();
  });
});
