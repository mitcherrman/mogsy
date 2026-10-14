import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchKnowledgeStats } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("public knowledge stats client", () => {
  it("requests the versioned endpoint with an encoded mode", async () => {
    const fetcher = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ schema_version: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await fetchKnowledgeStats("daily_challenge");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain(
      "/api/public/knowledge-stats/v1?mode=daily_challenge",
    );
  });

  it("keeps the stable public error when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream", { status: 503 })));
    await expect(fetchKnowledgeStats(null)).rejects.toMatchObject({
      status: 503,
      message: "Knowledge statistics are unavailable right now.",
    });
  });
});
