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
  select: "" as string,
}));

const selectedColumns = () => mocks.select;

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => ({
        eq: () => ({
          order: () => ({
            limit: async () => {
              mocks.select = columns;
              return { data: mocks.rows, error: null };
            },
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


// ---------------------------------------------------------------------------
// ADMIN1A — the Premium badge must track EFFECTIVE entitlement.
//
// This component used to select `is_pro` without the grant columns and badge on
// it directly, so a comped playtester (is_pro false, valid grant) rendered as
// Free and a legacy is_pro rendered as an unqualified PREMIUM. Both are
// misrepresentations, and both are what ADMIN1A fixes.
// ---------------------------------------------------------------------------

const future = new Date(Date.now() + 90 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const row = (over: Record<string, unknown>) => ({
  id: "p1", display_name: "Tester", avatar_url: null,
  is_pro: false, pro_grant_kind: null, pro_grant_expires_at: null,
  is_bot: false, created_at: "2026-08-01T00:00:00Z", ...over,
});

const badge = async () => {
  render(<MemoryRouter><AdminProfileDirectory /></MemoryRouter>);
  await screen.findByText("Tester");
  return screen.queryByTestId("directory-premium-badge");
};

describe("Premium badge provenance", () => {
  it("badges a comped playtester as Premium, not Free", async () => {
    mocks.rows = [row({ pro_grant_kind: "playtest", pro_grant_expires_at: future })];
    const el = await badge();
    expect(el).toBeTruthy();
    expect(el?.getAttribute("data-premium-source")).toBe("playtest-grant");
    expect(el?.textContent).toContain("Playtest grant");
  });

  it("labels a raw legacy is_pro as Legacy Premium, never as Stripe", async () => {
    mocks.rows = [row({ is_pro: true })];
    const el = await badge();
    expect(el?.getAttribute("data-premium-source")).toBe("legacy");
    expect(el?.textContent).toContain("Legacy Premium");
    expect(el?.textContent).not.toContain("Stripe");
  });

  it("does not badge an expired grant", async () => {
    mocks.rows = [row({ pro_grant_kind: "playtest", pro_grant_expires_at: past })];
    expect(await badge()).toBeNull();
  });

  it("does not badge a Free account", async () => {
    mocks.rows = [row({})];
    expect(await badge()).toBeNull();
  });

  it("selects the grant columns, so entitlement is never read as Stripe-only", async () => {
    // A row missing pro_grant_* silently reads as Stripe-only — the exact bug
    // PT1.4 fixes. Assert the query asks for them.
    expect(selectedColumns()).toContain("pro_grant_kind");
    expect(selectedColumns()).toContain("pro_grant_expires_at");
  });
});
