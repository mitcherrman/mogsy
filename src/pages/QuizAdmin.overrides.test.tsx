/**
 * Quiz admin: the unsupported override-management controls are gone (DC1 P1-E).
 *
 * The page used to render an "Active Overrides" panel backed by
 * GET /api/quiz/admin/overrides and POST .../{id}/activate|deactivate. Neither
 * route exists in the backend — no router declares them — so the panel loaded,
 * 404'd, and parked a permanent error state on an otherwise working page.
 *
 * Creating an override is a different, real endpoint
 * (POST /api/quiz/admin/override-question) and must keep working; the dialog
 * that drives it is deliberately untouched.
 *
 * The assertion that matters most is the network one: rendering the page must
 * issue no request to a nonexistent endpoint. A test that only checked for
 * absent text would still pass if the fetch fired.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/lib/backend-auth", () => ({
  ensureBackendAuthToken: async () => "test-token",
  getBackendAuthHeaders: async () => ({}),
}));
vi.mock("@/lib/knowledge-admin/key", () => ({ getAdminKey: () => "test-key" }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      }),
    }),
  },
}));

import QuizAdmin from "./QuizAdmin";

const REPORT = {
  id: 1,
  question_id: 42,
  question_key: "item_multi_stat:Aegis of the Legion",
  category: "Item Stat Diversity",
  reason: "wrong answer",
  expected_answer: "Ability Haste, Armor, Magic Resist",
  status: "open",
  created_at: "2026-09-01T00:00:00Z",
};

let requestedUrls: string[] = [];

beforeEach(() => {
  requestedUrls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    requestedUrls.push(url);
    if (url.includes("/api/quiz/admin/reports")) {
      return new Response(JSON.stringify({ reports: [REPORT] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Anything else is an endpoint this page should no longer be calling.
    return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <QuizAdmin />
    </MemoryRouter>,
  );
}

describe("QuizAdmin override controls", () => {
  it("renders without requesting any nonexistent endpoint", async () => {
    renderPage();
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes("/api/quiz/admin/reports"))).toBe(true);
    });
    // Give any stray effect a chance to fire before asserting absence.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestedUrls.some((u) => u.includes("/api/quiz/admin/overrides"))).toBe(false);
    expect(requestedUrls.some((u) => u.includes("/api/quiz/leaderboard"))).toBe(false);
  });

  it("no longer renders the Active Overrides panel", async () => {
    renderPage();
    await screen.findByText(/wrong answer/i);
    expect(screen.queryByText(/Active Overrides/i)).toBeNull();
    expect(screen.queryByText(/No overrides yet/i)).toBeNull();
  });

  it("leaves no dead override loading or error state behind", async () => {
    const { container } = renderPage();
    await screen.findByText(/wrong answer/i);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The old panel surfaced the 404 as a permanent error banner. Match on the
    // status code rather than the fallback copy: the thrown message is
    // "Quiz API 404: ...", so asserting on "Failed to load overrides" would
    // pass even while the banner was on screen.
    expect(container.textContent).not.toMatch(/404/);
    expect(screen.queryByText(/Failed to load overrides/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /deactivate/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reactivate/i })).toBeNull();
  });

  it("keeps the supported report and override-creation controls", async () => {
    renderPage();
    await screen.findByText(/wrong answer/i);
    // Reports panel still renders its row and its actions.
    expect(screen.getByText(/item_multi_stat:Aegis of the Legion/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Apply override$/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Apply expected as override/i }),
    ).toBeTruthy();
  });
});
