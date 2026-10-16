import { describe, expect, it, vi } from "vitest";
import capture from "./__fixtures__/captureV1.json";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "http://backend.test",
  buildAdminHeaders: vi.fn(async () => ({ Authorization: "Bearer owner-session" })),
}));

import { LOCK_RETRY_DELAYS_MS, PerfectTimingApiError, perfectTimingApi } from "./api";

const LOCK = capture.locks[0];
const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function client(...replies: (Response | "network")[]) {
  const fetchImpl = vi.fn(async () => {
    const r = replies.shift() ?? res(500, {});
    if (r === "network") throw new TypeError("Failed to fetch");
    return r;
  });
  const sleep = vi.fn(async (_ms: number) => {});
  return { api: perfectTimingApi({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep }), fetchImpl, sleep };
}

describe("perfectTimingApi", () => {
  it("deals with the owner's headers and the exact body", async () => {
    const { api, fetchImpl } = client(res(200, capture.deal.response));
    const deal = await api.deal(5);
    expect(deal.rounds).toHaveLength(5);
    expect(fetchImpl).toHaveBeenCalledWith("http://backend.test/api/admin/perfect-timing/deal", expect.objectContaining({
      method: "POST", body: JSON.stringify({ count: 5 }),
      headers: expect.objectContaining({ Authorization: "Bearer owner-session", "Content-Type": "application/json" }),
    }));
  });

  it("never retries a deal", async () => {
    const { api, fetchImpl } = client(res(503, { detail: "busy" }));
    await expect(api.deal(5)).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("locks with {elapsed_ms} only and returns the parsed release", async () => {
    const { api, fetchImpl } = client(res(200, LOCK.response));
    const r = await api.lock(LOCK.round_id, LOCK.request.elapsed_ms);
    expect(r.tier).toBe("perfect");
    expect(fetchImpl).toHaveBeenCalledWith(`http://backend.test/api/admin/perfect-timing/rounds/${LOCK.round_id}/lock`,
      expect.objectContaining({ body: JSON.stringify({ elapsed_ms: LOCK.request.elapsed_ms }) }));
  });

  it("retries a lock up to 3 times on network/5xx with backoff, then gives up", async () => {
    const { api, fetchImpl, sleep } = client("network", res(502, {}), res(503, {}), res(500, {}));
    await expect(api.lock(LOCK.round_id, LOCK.request.elapsed_ms)).rejects.toMatchObject({ status: 500 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([...LOCK_RETRY_DELAYS_MS]);
  });

  it("succeeds on a retry", async () => {
    const { api, fetchImpl } = client(res(503, {}), res(200, LOCK.response));
    await expect(api.lock(LOCK.round_id, LOCK.request.elapsed_ms)).resolves.toMatchObject({ points: 92 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([400, 403, 404, 409, 422])("never retries a %s and reads detail.error", async (status) => {
    const { api, fetchImpl } = client(res(status, { detail: { error: { code: "PT_X", message: "nope" } } }));
    const err = await api.lock(LOCK.round_id, LOCK.request.elapsed_ms).catch((e) => e);
    expect(err).toBeInstanceOf(PerfectTimingApiError);
    expect(err).toMatchObject({ status, code: "PT_X", message: "nope" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses a release for another round or another time, without retrying", async () => {
    const { api, fetchImpl } = client(res(200, LOCK.response));
    await expect(api.lock(LOCK.round_id, LOCK.request.elapsed_ms + 1)).rejects.toMatchObject({ code: "PT_CONTRACT" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([1.5, -1, 600_001, Number.NaN])("refuses to send elapsed %s", async (v) => {
    const { api, fetchImpl } = client();
    await expect(api.lock(LOCK.round_id, v)).rejects.toMatchObject({ code: "PT_CLIENT_RANGE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
