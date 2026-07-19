import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({ getBackendAuthHeaders: async () => ({}) }));
vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  buildAdminHeaders: async () => ({ Authorization: "Bearer test" }),
  ADMIN_API_BASE_URL: "http://backend.test",
}));

import { battlesApi, battlesAdminApi, BattlesApiError } from "./api";

const fetchMock = vi.fn();
// @ts-expect-error test global
global.fetch = fetchMock;

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}
function err(status: number, detail: unknown) {
  return Promise.resolve({
    ok: false, status, statusText: "err",
    json: () => Promise.resolve({ detail }), text: () => Promise.resolve(""),
  } as Response);
}

afterEach(() => fetchMock.mockReset());

describe("battlesAdminApi.settle", () => {
  it("sends NO winner/outcome/score/user body — the server derives everything", async () => {
    fetchMock.mockReturnValue(ok({ status: "completed" }));
    await battlesAdminApi.settle("battle-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/api/admin/combat-battles/battle-1/settle");
    expect(init.method).toBe("POST");
    // No body at all (or, if present, contains none of the forbidden fields).
    const body = init.body ? JSON.parse(init.body) : {};
    for (const k of ["winner_side", "outcome", "score", "score_awarded", "user_id"]) {
      expect(body).not.toHaveProperty(k);
    }
  });
});

describe("submitPrediction", () => {
  it("sends only predicted_side (+ optional idempotency id), never a user id", async () => {
    fetchMock.mockReturnValue(ok({ predicted_side: "left", outcome: "created" }));
    await battlesApi.submitPrediction("slug", "left");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.predicted_side).toBe("left");
    expect(body).not.toHaveProperty("user_id");
  });
});

describe("BattlesApiError", () => {
  it("parses a structured backend error (lock race)", async () => {
    fetchMock.mockReturnValue(err(409, { code: "window_closed", message: "locked", effective_status: "locked" }));
    await expect(battlesApi.submitPrediction("slug", "left")).rejects.toMatchObject({
      status: 409, code: "window_closed",
    });
    try {
      fetchMock.mockReturnValue(err(409, { code: "window_closed", message: "locked" }));
      await battlesApi.submitPrediction("slug", "left");
    } catch (e) {
      expect(e).toBeInstanceOf(BattlesApiError);
      expect((e as BattlesApiError).isWindowClosed).toBe(true);
    }
  });
});
