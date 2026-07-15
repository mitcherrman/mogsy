import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RankedDuelReviewPanel } from "./RankedDuelReviewPanel";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => setAdminKey("secret-admin"));
afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.unstubAllGlobals();
});

describe("RankedDuelReviewPanel (integration boundary)", () => {
  it("explains the boundary, shows the current blocker, and no candidate data by default", () => {
    render(<RankedDuelReviewPanel />);
    expect(screen.getByTestId("ranked-duel-review-boundary").textContent).toContain(
      "Backend endpoints not shipped yet",
    );
    expect(screen.getByTestId("ranked-duel-review-blocker").textContent).toContain(
      "0 / 30 accepted",
    );
    // No candidate rows / progress numbers before an explicit probe.
    expect(screen.queryByTestId("ranked-duel-review-status")).toBeNull();
  });

  it("exposes no write action (cannot record decisions or export)", () => {
    render(<RankedDuelReviewPanel />);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(buttons.some((t) => /accept|reject|revise|export|decision/i.test(t))).toBe(false);
  });

  it("reports 'not available yet' when the endpoint returns 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(404, { detail: "Not Found" })) as unknown as typeof fetch);
    render(<RankedDuelReviewPanel />);
    fireEvent.click(screen.getByTestId("ranked-duel-review-probe"));
    await waitFor(() =>
      expect(screen.getByTestId("ranked-duel-review-status").textContent).toContain(
        "Not available yet (HTTP 404)",
      ),
    );
  });

  it("lights up when the endpoint is live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(200, { ok: true, total: 7, counts: {} })) as unknown as typeof fetch,
    );
    render(<RankedDuelReviewPanel />);
    fireEvent.click(screen.getByTestId("ranked-duel-review-probe"));
    await waitFor(() =>
      expect(screen.getByTestId("ranked-duel-review-status").textContent).toContain(
        "Endpoints are live — 7 candidate(s)",
      ),
    );
  });

  it("surfaces an auth failure distinctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(403, { detail: "Invalid or missing X-Admin-Key" })) as unknown as typeof fetch,
    );
    render(<RankedDuelReviewPanel />);
    fireEvent.click(screen.getByTestId("ranked-duel-review-probe"));
    await waitFor(() =>
      expect(screen.getByTestId("ranked-duel-review-status").textContent).toContain(
        "X-Admin-Key",
      ),
    );
  });
});
