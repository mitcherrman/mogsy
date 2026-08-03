/**
 * AdminProfileDirectory — regression guard for the dead profile link.
 *
 * The card used to navigate to `/profile/${id}`, which is NOT a registered
 * route: App.tsx registers `/profile` (own profile) and `/user/:profileId`.
 * Every "open profile" click therefore landed on the not-found page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  rows: [] as Record<string, unknown>[],
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: mocks.rows, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import AdminProfileDirectory from "./AdminProfileDirectory";

beforeEach(() => {
  mocks.rows = [
    {
      id: "profile-42",
      display_name: "Aria",
      avatar_url: null,
      is_pro: false,
      is_bot: false,
      created_at: "2026-08-01T00:00:00Z",
    },
  ];
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("profile link", () => {
  it("navigates to /user/:profileId", async () => {
    render(
      <MemoryRouter>
        <AdminProfileDirectory />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText("Aria"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/user/profile-42"));
  });

  it("never navigates to the non-existent /profile/:id route", async () => {
    render(
      <MemoryRouter>
        <AdminProfileDirectory />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText("Aria"));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    for (const [target] of mocks.navigate.mock.calls) {
      expect(String(target)).not.toMatch(/^\/profile\//);
    }
  });
});
