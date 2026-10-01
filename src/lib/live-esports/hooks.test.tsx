/**
 * The extracted live hooks keep the match centre's rules: one feed key shared
 * by every consumer, an archived game's summary taken from its own detail
 * read, and no per-game polling once a game is final.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveFeed, useLiveMatch } from "./hooks";

const SUMMARY = {
  game_id: "G1",
  match_id: "M1",
  league: { slug: "lck", name: "LCK" },
  block_name: null,
  best_of: 1,
  game_number: 1,
  teams: {
    blue: { name: "A", code: "A", esports_team_id: null, resolved_page: null, series_wins: null },
    red: { name: "B", code: "B", esports_team_id: null, resolved_page: null, series_wins: null },
  },
  patch_version: null,
  game_state: "finished",
  availability: "finished",
  availability_detail: null,
  scheduled_start: null,
  first_frame_ts: null,
  freshness: { label: "final", seconds_since_success: 1, source_frame_ts: null, last_attempt_at: null, last_success_at: null },
};

function setup() {
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url);
    const body = path.includes("/live-esports/live")
      ? { enabled: true, generated_at: "x", live: [], recent: [SUMMARY], limits: {} }
      : path.includes("/players")
        ? { players: [], identity_resolution: { resolved: 0, total: 0, rate: null } }
        : path.includes("/gold")
          ? { series: [] }
          : path.includes("/insights")
            ? {}
            : { enabled: true, generated_at: "x", game: SUMMARY, team_state: {}, recent_events: [] };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("useLiveFeed", () => {
  it("serves live/recent under the match centre's shared feed key", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useLiveFeed(), { wrapper });
    await waitFor(() => expect(result.current.recent).toHaveLength(1));
    expect(result.current.selectable.map((g) => g.game_id)).toEqual(["G1"]);
    expect(result.current.failing).toBe(false);
    expect(client.getQueryData(["live-esports", "feed"])).toBeTruthy();
  });
});

describe("useLiveMatch", () => {
  it("resolves an archived game's summary from its own detail read", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useLiveMatch("G1", null), { wrapper });
    await waitFor(() => expect(result.current.selected?.game_id).toBe("G1"));
    expect(result.current.isFinal).toBe(true);
  });

  it("stops polling every per-game read once the game is final", async () => {
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useLiveMatch("G1", SUMMARY as never), { wrapper });
    await waitFor(() => expect(result.current.detail.data).toBeTruthy());
    for (const kind of ["game", "players", "gold", "insights"]) {
      const query = client.getQueryCache().find({ queryKey: ["live-esports", kind, "G1"] });
      const interval = (query?.options as { refetchInterval?: unknown }).refetchInterval;
      const resolved = typeof interval === "function" ? interval(query) : interval;
      expect(resolved, kind).toBe(false);
    }
  });

  it("asks for nothing without a game", () => {
    const { wrapper, fetchMock } = setup();
    renderHook(() => useLiveMatch(null, null), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
