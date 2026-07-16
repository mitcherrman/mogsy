import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer session-token" }),
}));

import { fetchAdminSession } from "./adminSessionClient";
import { ADMIN_API_BASE_URL, clearFallbackKey, activateFallbackKey } from "./adminCredentials";

const res = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const stub = (impl: (url: string, init: RequestInit) => Promise<Response>) => {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
};

beforeEach(() => clearFallbackKey());
afterEach(() => {
  clearFallbackKey();
  vi.unstubAllGlobals();
});

describe("fetchAdminSession", () => {
  it("targets /api/admin/session with the bearer header", async () => {
    const spy = stub(async () =>
      res(200, { authorized: true, auth_method: "supabase_user", user_id: "u1", email: "o@x.io" }),
    );
    const outcome = await fetchAdminSession();
    expect(spy.mock.calls[0][0]).toBe(`${ADMIN_API_BASE_URL}/api/admin/session`);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(outcome).toEqual({
      kind: "authorized",
      principal: { authMethod: "supabase_user", userId: "u1", email: "o@x.io" },
    });
  });

  it("reports admin_key auth method (fallback path)", async () => {
    activateFallbackKey("k");
    stub(async () => res(200, { authorized: true, auth_method: "admin_key", user_id: null, email: null }));
    const outcome = await fetchAdminSession();
    expect(outcome).toEqual({
      kind: "authorized",
      principal: { authMethod: "admin_key", userId: null, email: null },
    });
  });

  it("maps 403 to forbidden (never authorized)", async () => {
    stub(async () => res(403, { detail: "Admin authorization required" }));
    expect(await fetchAdminSession()).toEqual({ kind: "forbidden" });
  });

  it("maps network failure to unavailable (distinct from forbidden)", async () => {
    stub(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchAdminSession()).toEqual({ kind: "unavailable" });
  });

  it("maps 5xx to unavailable", async () => {
    stub(async () => res(500, { detail: "boom" }));
    expect(await fetchAdminSession()).toEqual({ kind: "unavailable" });
  });

  it("fails closed on a 200 that is malformed (missing authorized)", async () => {
    stub(async () => res(200, { auth_method: "supabase_user" }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("fails closed on authorized:false", async () => {
    stub(async () => res(200, { authorized: false, auth_method: "supabase_user" }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("fails closed on an unknown auth_method", async () => {
    stub(async () => res(200, { authorized: true, auth_method: "is_pro", user_id: "u" }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("fails closed on non-JSON body", async () => {
    stub(async () => new Response("not json", { status: 200 }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });
});
