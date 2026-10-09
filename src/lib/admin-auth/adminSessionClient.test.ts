import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer session-token" }),
}));

import { fetchAdminSession, VALID_METHODS } from "./adminSessionClient";
import { ADMIN_API_BASE_URL } from "./adminCredentials";

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

beforeEach(() => {});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAdminSession", () => {
  it("targets /api/admin/session with the bearer header", async () => {
    const spy = stub(async () =>
      res(200, { authorized: true, auth_method: "supabase_owner", user_id: "u1", email: "o@x.io" }),
    );
    const outcome = await fetchAdminSession();
    expect(spy.mock.calls[0][0]).toBe(`${ADMIN_API_BASE_URL}/api/admin/session`);
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer session-token",
    });
    expect(outcome).toEqual({
      kind: "authorized",
      principal: { authMethod: "supabase_owner", userId: "u1", email: "o@x.io" },
    });
  });

  // OWN1.1 — the live Railway contract. routes/_auth.py defines
  // AUTH_METHOD_SUPABASE_OWNER = "supabase_owner" and admin_session.py returns
  // exactly {authorized, auth_method, user_id, email}; the backend pins the same
  // body in test_admin_auth.py::test_session_contract_is_pinned_for_the_frontend.
  // The frontend accepting only "supabase_user" was the OWN1 "Unexpected
  // response" outage.
  it("OWN1.1 contract: accepts exactly the Railway owner method", async () => {
    expect(VALID_METHODS).toEqual(["supabase_owner"]);
    stub(async () =>
      res(200, { authorized: true, auth_method: "supabase_owner", user_id: "11111111-1111-1111-1111-111111111111", email: null }),
    );
    expect(await fetchAdminSession()).toEqual({
      kind: "authorized",
      principal: { authMethod: "supabase_owner", userId: "11111111-1111-1111-1111-111111111111", email: null },
    });
  });

  it("OWN1.1: the pre-OWN1 supabase_user method is no longer accepted", async () => {
    stub(async () => res(200, { authorized: true, auth_method: "supabase_user", user_id: "u1", email: null }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("OWN1: an admin_key session is not accepted (fails closed as malformed)", async () => {
    stub(async () => res(200, { authorized: true, auth_method: "admin_key", user_id: null, email: null }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
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
    stub(async () => res(200, { auth_method: "supabase_owner" }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("fails closed on authorized:false", async () => {
    stub(async () => res(200, { authorized: false, auth_method: "supabase_owner" }));
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

  it("fails closed on a wrongly typed user_id or email", async () => {
    stub(async () => res(200, { authorized: true, auth_method: "supabase_owner", user_id: 7, email: null }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
    stub(async () => res(200, { authorized: true, auth_method: "supabase_owner", user_id: null, email: ["x"] }));
    expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
  });

  it("fails closed on a non-object body", async () => {
    for (const body of [null, [], "supabase_owner", true]) {
      stub(async () => res(200, body));
      expect(await fetchAdminSession()).toEqual({ kind: "malformed" });
    }
  });
});
