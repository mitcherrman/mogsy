import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomLink from "./CustomLink";

const mocks = vi.hoisted(() => ({
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
  },
}));

function mount(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/${slug}`]}>
      <Routes>
        <Route path="/:slug" element={<CustomLink />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CustomLink catch-all", () => {
  beforeEach(() => {
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

  it("an active invite code sends the visitor to signup carrying that code", async () => {
    mocks.invite = { code: "JOINME01" };
    mount("joinme01");
    await waitFor(() => {
      expect(screen.getByTestId("auth-page")).toBeInTheDocument();
    });
  });

  // LEGACY1: the retired voting product's slug destinations are gone. A slug
  // that used to resolve to a swipe league or a "curated" /home config is now
  // simply not found — there is no page left for it to reach.
  it("no longer resolves retired custom-link destinations", async () => {
    mount("known-league-link");
    await waitFor(() => {
      expect(screen.getByText(/page not found/i)).toBeInTheDocument();
    });
  });
});
