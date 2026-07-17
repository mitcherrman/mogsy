import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomLink from "./CustomLink";

const mocks = vi.hoisted(() => ({
  /** rpc("resolve_custom_link") result */
  resolved: null as unknown,
  invite: null as null | { code: string },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result =
        table === "invite_links" ? { data: mocks.invite } : { data: null };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
      });
      return chain;
    },
    rpc: (name: string) =>
      name === "resolve_custom_link"
        ? Promise.resolve({ data: mocks.resolved, error: null })
        : Promise.resolve({ data: null, error: null }),
  },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));

function mount(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/${slug}`]}>
      <Routes>
        <Route path="/:slug" element={<CustomLink />} />
        <Route path="/swipe/preset/:id" element={<div data-testid="preset-page" />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CustomLink catch-all", () => {
  beforeEach(() => {
    mocks.resolved = null;
    mocks.invite = null;
  });
  afterEach(cleanup);

  it("unknown slugs render the noindex not-found treatment (no thin 200 page)", async () => {
    mount("definitely-not-a-real-slug");
    await waitFor(() => {
      expect(screen.getByText(/page not found/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute("content")).toContain("noindex");
    });
  });

  it("recognized custom links still resolve and redirect", async () => {
    mocks.resolved = [{ destination_type: "league", league_id: "league-1" }];
    mount("known-league-link");
    await waitFor(() => {
      expect(screen.getByTestId("preset-page")).toBeInTheDocument();
    });
  });
});
