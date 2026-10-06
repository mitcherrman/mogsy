import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: vi.fn(async () => ({ Authorization: "Bearer session-token" })),
}));

import * as creds from "./adminCredentials";
import { ADMIN_API_BASE_URL, buildAdminHeaders, isBackendUrl } from "./adminCredentials";

describe("adminCredentials (OWN1: bearer only)", () => {
  it("attaches only the Supabase bearer for the backend origin", async () => {
    const headers = await buildAdminHeaders(`${ADMIN_API_BASE_URL}/api/admin/session`);
    expect(headers).toEqual({ Authorization: "Bearer session-token" });
    expect(headers["X-Admin-Key"]).toBeUndefined();
  });

  it("attaches nothing for a foreign origin", async () => {
    expect(await buildAdminHeaders("https://evil.example/api")).toEqual({});
    expect(isBackendUrl("https://evil.example/api")).toBe(false);
  });

  it("exposes no fallback-key API at all", () => {
    for (const name of ["activateFallbackKey", "clearFallbackKey", "isFallbackActive", "subscribeAdminCredential"]) {
      expect((creds as Record<string, unknown>)[name]).toBeUndefined();
    }
  });
});
