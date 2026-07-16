import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer session-token" }),
}));

import {
  ADMIN_API_BASE_URL,
  buildAdminHeaders,
  isBackendUrl,
  isFallbackActive,
  activateFallbackKey,
  clearFallbackKey,
} from "./adminCredentials";
import { getAdminKey } from "@/lib/knowledge-admin/key";

const BACKEND = `${ADMIN_API_BASE_URL}/api/admin/session`;

beforeEach(() => clearFallbackKey());
afterEach(() => {
  clearFallbackKey();
  vi.restoreAllMocks();
});

describe("origin guard", () => {
  it("recognizes absolute and relative backend URLs", () => {
    expect(isBackendUrl(BACKEND)).toBe(true);
    expect(isBackendUrl("/api/admin/ranked-duel/questions/status")).toBe(true);
  });
  it("rejects arbitrary external origins", () => {
    expect(isBackendUrl("https://evil.example.com/api/admin/session")).toBe(false);
    expect(isBackendUrl("https://cdn.jsdelivr.net/x.js")).toBe(false);
  });
});

describe("buildAdminHeaders", () => {
  it("attaches the Supabase bearer by default (no key) for the backend", async () => {
    const headers = await buildAdminHeaders(BACKEND);
    expect(headers.Authorization).toBe("Bearer session-token");
    expect(headers["X-Admin-Key"]).toBeUndefined();
  });

  it("adds X-Admin-Key only when an explicit fallback key is active", async () => {
    activateFallbackKey("the-fallback-key");
    expect(isFallbackActive()).toBe(true);
    const headers = await buildAdminHeaders(BACKEND);
    expect(headers.Authorization).toBe("Bearer session-token");
    expect(headers["X-Admin-Key"]).toBe("the-fallback-key");
  });

  it("sends NO credentials to a non-backend origin", async () => {
    activateFallbackKey("secret");
    const headers = await buildAdminHeaders("https://evil.example.com/api/admin/session");
    expect(headers).toEqual({});
    expect(headers.Authorization).toBeUndefined();
    expect(headers["X-Admin-Key"]).toBeUndefined();
  });
});

describe("fallback key store", () => {
  it("uses sessionStorage (never localStorage) and clears cleanly", () => {
    activateFallbackKey("k");
    expect(sessionStorage.getItem("mogsy.knowledge_admin_key")).toBe("k");
    expect(localStorage.getItem("mogsy.knowledge_admin_key")).toBeNull();
    // No new persistence key beyond the existing approved one.
    const keys = Object.keys(localStorage).concat(Object.keys(sessionStorage));
    expect(keys.filter((k) => k.includes("admin"))).toEqual(["mogsy.knowledge_admin_key"]);
    clearFallbackKey();
    expect(getAdminKey()).toBeNull();
    expect(isFallbackActive()).toBe(false);
  });

  it("ignores blank keys (no silent activation)", () => {
    activateFallbackKey("   ");
    expect(isFallbackActive()).toBe(false);
  });
});
