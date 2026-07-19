import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  signInAnonymously: vi.fn(),
  profileUpdate: vi.fn(),
  profileRead: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
      signUp: mocks.signUp,
      signInAnonymously: mocks.signInAnonymously,
    },
    from: () => ({
      update: (payload: unknown) => {
        mocks.profileUpdate(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.profileRead() }),
      }),
    }),
  },
}));

import {
  initiateAnonymousEmailUpgrade,
  setPasswordForVerifiedUser,
  syncProfilePermanent,
  isConvertedPermanentUser,
  readPendingUpgrade,
  clearPendingUpgrade,
} from "./account-upgrade";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.profileRead.mockResolvedValue({ data: { is_anonymous: false }, error: null });
});

describe("initiateAnonymousEmailUpgrade", () => {
  it("attaches email via updateUser with emailRedirectTo — never signOut, never signUp", async () => {
    const res = await initiateAnonymousEmailUpgrade({
      userId: "anon-1",
      email: "  Guest@Example.com  ",
      redirectTo: "https://mogzy.lol/auth/callback?returnTo=%2Fquiz",
    });
    expect(res.ok).toBe(true);
    expect(mocks.updateUser).toHaveBeenCalledWith(
      { email: "Guest@Example.com" },
      { emailRedirectTo: "https://mogzy.lol/auth/callback?returnTo=%2Fquiz" },
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    // password never passed to updateUser during initiation
    expect(mocks.updateUser.mock.calls[0][0]).not.toHaveProperty("password");
  });

  it("persists a pending record with userId+email but NEVER a password", async () => {
    await initiateAnonymousEmailUpgrade({
      userId: "anon-1",
      email: "guest@example.com",
      redirectTo: "https://mogzy.lol/auth/callback",
    });
    const pending = readPendingUpgrade();
    expect(pending).toEqual({
      userId: "anon-1",
      email: "guest@example.com",
      returnTo: "https://mogzy.lol/auth/callback",
    });
    // No secret anywhere in web storage.
    const dump = JSON.stringify(localStorage) + JSON.stringify(sessionStorage);
    expect(dump.toLowerCase()).not.toContain("password");
  });

  it("does not write a pending record and surfaces emailInUse on 'already registered'", async () => {
    mocks.updateUser.mockResolvedValue({
      data: {},
      error: { message: "Email address already been registered" },
    });
    const res = await initiateAnonymousEmailUpgrade({
      userId: "anon-1",
      email: "taken@example.com",
      redirectTo: "https://mogzy.lol/auth/callback",
    });
    expect(res.ok).toBe(false);
    expect(res.emailInUse).toBe(true);
    expect(readPendingUpgrade()).toBeNull();
  });

  it("never writes the profile during initiation", async () => {
    await initiateAnonymousEmailUpgrade({
      userId: "anon-1",
      email: "guest@example.com",
      redirectTo: "https://mogzy.lol/auth/callback",
    });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });
});

describe("setPasswordForVerifiedUser", () => {
  it("calls updateUser({ password }) only (email-first password step)", async () => {
    const res = await setPasswordForVerifiedUser("hunter2secret");
    expect(res.ok).toBe(true);
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "hunter2secret" });
  });
});

describe("syncProfilePermanent", () => {
  it("sets is_anonymous=false then re-reads to confirm", async () => {
    const res = await syncProfilePermanent("anon-1");
    expect(res.ok).toBe(true);
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ is_anonymous: false });
  });

  it("is retryable: reports failure when the re-read does not confirm", async () => {
    mocks.profileRead.mockResolvedValue({ data: { is_anonymous: true }, error: null });
    const res = await syncProfilePermanent("anon-1");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});

describe("isConvertedPermanentUser", () => {
  it("true only for non-anonymous user with email + email identity", () => {
    expect(
      isConvertedPermanentUser({
        is_anonymous: false,
        email: "a@b.com",
        identities: [{ provider: "email" }],
      }),
    ).toBe(true);
  });
  it("false while still anonymous or missing email/identity", () => {
    expect(isConvertedPermanentUser({ is_anonymous: true, email: null, identities: [] })).toBe(false);
    expect(isConvertedPermanentUser({ is_anonymous: false, email: null, identities: [] })).toBe(false);
    expect(
      isConvertedPermanentUser({ is_anonymous: false, email: "a@b.com", identities: [] }),
    ).toBe(false);
    expect(isConvertedPermanentUser(null)).toBe(false);
  });
});

describe("clearPendingUpgrade", () => {
  it("removes the pending record", async () => {
    await initiateAnonymousEmailUpgrade({
      userId: "anon-1",
      email: "g@e.com",
      redirectTo: "https://mogzy.lol/auth/callback",
    });
    expect(readPendingUpgrade()).not.toBeNull();
    clearPendingUpgrade();
    expect(readPendingUpgrade()).toBeNull();
  });
});
