/**
 * PT1.3 — the discovery ceremony INSIDE the real Ranked terminal flow.
 *
 * The component tests already cover what the reveal renders. These cover what
 * only the live controller can answer:
 *
 * * the ceremony is read ONCE, and only after the match is terminal — a live
 *   match must never spend the request or leak a premature reward;
 * * it does not displace the match outcome: the result heading, the combatant
 *   panels and the existing primary action are all still there, and the reveal
 *   sits in the frame's own summary slot beneath them;
 * * the CTA goes to `/quiz#review` — the PT1.2 surface that already opens on
 *   OWNED — and creates no second collection route;
 * * a zero-discovery match, a failed read and a refused read all leave the
 *   terminal frame exactly as it was before PT1.3;
 * * nothing about the ceremony touches submission, scoring or rating.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "./QuizRankedMatch";
import {
  matchResultV1, privatePlayerV2, publicRoundV2,
} from "@/lib/ranked-public/fixtures";

let over: boolean;
let discoveryCalls: string[];
let discoveryResponse: () => Response;
let assignedUrls: string[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

const entry = (ref: string, prompt: string, round: number) => ({
  canonical_question_ref: ref,
  first_seen_at: "2026-09-03T12:00:00Z",
  first_round_number: round,
  metadata_status: "resolved",
  metadata_source: "frozen_round",
  question: { prompt, category: "Item Costs" },
});

function discoveriesBody(over: Partial<Record<string, unknown>> = {}) {
  return {
    schema_version: "ranked_duel.match_discoveries.v1",
    projection_type: "match_discoveries",
    match_id: "m1", round_number: null,
    server_time: "2026-09-03T12:00:05Z",
    payload: {
      scope: "ranked_discoveries",
      includes_default_library: false,
      match_id: "m1",
      new_discoveries: [
        entry("ranked:a", "How much does Doran's Shield cost?", 1),
        entry("ranked:b", "How much does a Long Sword cost?", 2),
      ],
      new_count: 2,
      collection_total: 42,
      collection_total_before: 40,
      truncated: false,
      ...over,
    },
  };
}

function apply(payload: Record<string, unknown>) {
  payload.progression_enabled = false;
  for (const p of payload.players as Record<string, unknown>[]) {
    p.role = p.player_id === "userA" ? "top" : null;
  }
  return payload;
}
const publicBody = () => {
  const b = publicRoundV2(over); apply(b.payload as Record<string, unknown>); return b;
};
const privateBody = () => {
  const b = privatePlayerV2("userA"); apply(b.payload as Record<string, unknown>); return b;
};

beforeEach(() => {
  over = true;
  discoveryCalls = [];
  assignedUrls = [];
  discoveryResponse = () => json(discoveriesBody());
  // The terminal frame's actions navigate with window.location.assign, which
  // jsdom does not implement. Captured rather than stubbed away, because WHERE
  // the CTA goes is one of the things under test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: (u: string) => { assignedUrls.push(u); } },
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.endsWith("/discoveries")) {
      discoveryCalls.push(u);
      return discoveryResponse();
    }
    if (u.endsWith("/resume")) {
      return json({
        schema_version: "ranked_duel.resume.v1", projection_type: "resume",
        match_id: "m1", round_number: 1, server_time: "2026-09-03T12:00:00+00:00",
        payload: {
          match_status: over ? "complete" : "active", match_over: over,
          progression_enabled: false,
          public: publicBody(), private: privateBody(),
          progression_pending_players: [], latest_resolved_round: null,
          result: over ? matchResultV1("combat") : null,
        },
      });
    }
    if (u.endsWith("/private")) return json(privateBody());
    if (u.includes("/presence")) return json({ status: "active", match_id: "m1", active: true });
    if (u.endsWith("/result")) return json(matchResultV1("combat"));
    if (/\/matches\/m1$/.test(u)) return json(publicBody());
    return json({});
  }) as unknown as typeof fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

const mount = () => render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);

describe("the Ranked terminal frame with new discoveries", () => {
  it("shows the match outcome FIRST, then the reward beneath it", async () => {
    mount();
    await screen.findByTestId("ranked-match-over");
    // Everything the terminal frame already carried is untouched.
    expect(screen.getByTestId("match-over-heading")).toBeInTheDocument();
    expect(screen.getByTestId("match-over-primary")).toHaveTextContent("Back to Quiz");
    // ...and the reveal is INSIDE the frame's own summary slot, below them.
    const reveal = await screen.findByTestId("discovery-reveal");
    expect(screen.getByTestId("match-over-summary")).toContainElement(reveal);
    expect(screen.getByTestId("discovery-headline"))
      .toHaveTextContent("2 new questions added to your collection");
    expect(screen.getByTestId("discovery-growth")).toHaveTextContent("40");
    expect(screen.getByTestId("discovery-growth")).toHaveTextContent("42");
  });

  it("reads the ceremony exactly once for one finished match", async () => {
    mount();
    await screen.findByTestId("discovery-reveal");
    await new Promise((r) => setTimeout(r, 30));
    expect(discoveryCalls).toHaveLength(1);
    expect(discoveryCalls[0]).toMatch(/\/api\/ranked\/matches\/m1\/discoveries$/);
  });

  it("sends the CTA to /quiz#review, the existing OWNED surface", async () => {
    mount();
    const cta = await screen.findByTestId("discovery-cta");
    cta.click();
    await waitFor(() => expect(assignedUrls).toContain("/quiz#review"));
    // No second collection route was invented for the ceremony.
    expect(assignedUrls.some((u) => u.includes("library"))).toBe(false);
  });
});

describe("the Ranked terminal frame without new discoveries", () => {
  it("shows a quiet collection status, never an empty celebration", async () => {
    discoveryResponse = () => json(discoveriesBody({
      new_discoveries: [], new_count: 0,
      collection_total: 40, collection_total_before: 40,
    }));
    mount();
    await screen.findByTestId("ranked-match-over");
    expect(await screen.findByTestId("discovery-quiet")).toHaveTextContent("40");
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
  });

  it("adds NOTHING to the frame for a first-match player with no collection", async () => {
    discoveryResponse = () => json(discoveriesBody({
      new_discoveries: [], new_count: 0,
      collection_total: 0, collection_total_before: 0,
    }));
    mount();
    await screen.findByTestId("ranked-match-over");
    await waitFor(() => expect(discoveryCalls).toHaveLength(1));
    expect(screen.queryByTestId("match-over-summary")).toBeNull();
  });

  it("degrades to the pre-PT1.3 frame when the read fails", async () => {
    discoveryResponse = () => json({ detail: { code: "RANKED_MATCH_NOT_COMPLETE" } }, 409);
    mount();
    await screen.findByTestId("ranked-match-over");
    await waitFor(() => expect(discoveryCalls).toHaveLength(1));
    expect(screen.getByTestId("match-over-heading")).toBeInTheDocument();
    expect(screen.queryByTestId("match-over-summary")).toBeNull();
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
  });
});

describe("the ceremony and the rest of Ranked", () => {
  it("is not read at all while the match is still live", async () => {
    over = false;
    mount();
    await screen.findByTestId("ranked-match");
    await new Promise((r) => setTimeout(r, 50));
    expect(discoveryCalls).toHaveLength(0);
    expect(screen.queryByTestId("discovery-reveal")).toBeNull();
  });

  it("never submits, scores or rates anything", async () => {
    mount();
    await screen.findByTestId("discovery-reveal");
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const urls = calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/submission"))).toBe(false);
    expect(urls.some((u) => u.includes("/forfeit"))).toBe(false);
    expect(urls.some((u) => u.includes("/progression"))).toBe(false);
  });

  it("is FREE — a full reveal without any entitlement being consulted", async () => {
    // The account in this harness has no Pro anything: no is_pro, no
    // subscription, no entitlement call. It still gets the whole ceremony.
    mount();
    await screen.findByTestId("discovery-reveal");
    expect(screen.getByTestId("discovery-cta")).toBeEnabled();
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const urls = calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("entitlement"))).toBe(false);
    expect(urls.some((u) => u.includes("subscription"))).toBe(false);
    expect(screen.queryByText(/upgrade|go pro|unlock with pro/i)).toBeNull();
  });
});
