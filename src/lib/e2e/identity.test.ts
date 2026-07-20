import { afterEach, describe, expect, it, vi } from "vitest";
import { getE2EIdentity, e2eEnabled, E2E_STORAGE_KEY } from "./identity";

const IDENTITY = {
  token: "header.payload.sig",
  user: { id: "0000e2e0-0000-4000-8000-000000000001", email: "u1@example.test", is_anonymous: false },
  admin: false,
};

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe("e2e identity seam (gated)", () => {
  it("is OFF when the flag is unset even if a persona is present", () => {
    vi.stubEnv("VITE_E2E_AUTH", "");
    localStorage.setItem(E2E_STORAGE_KEY, JSON.stringify(IDENTITY));
    expect(e2eEnabled()).toBe(false);
    expect(getE2EIdentity()).toBeNull();
  });

  it("returns the injected persona only when VITE_E2E_AUTH === '1'", () => {
    vi.stubEnv("VITE_E2E_AUTH", "1");
    localStorage.setItem(E2E_STORAGE_KEY, JSON.stringify(IDENTITY));
    expect(e2eEnabled()).toBe(true);
    expect(getE2EIdentity()).toMatchObject({ token: IDENTITY.token, admin: false });
  });

  it("returns null when enabled but nothing was injected", () => {
    vi.stubEnv("VITE_E2E_AUTH", "1");
    expect(getE2EIdentity()).toBeNull();
  });

  it("returns null on malformed payload", () => {
    vi.stubEnv("VITE_E2E_AUTH", "1");
    localStorage.setItem(E2E_STORAGE_KEY, "{not json");
    expect(getE2EIdentity()).toBeNull();
    localStorage.setItem(E2E_STORAGE_KEY, JSON.stringify({ user: { id: "x" } }));
    expect(getE2EIdentity()).toBeNull();
  });
});
