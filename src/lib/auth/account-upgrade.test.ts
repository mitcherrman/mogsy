import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

// This suite genuinely exercises persistence, so it opts into the shared
// Storage stub (jsdom 20 + vitest 3 ships no working Storage — see the stub's
// own header). Without it every case here fails on `localStorage.clear`.
const resetStorage = installLocalStorageStub();
const sessionStub = { clear: () => {} };
Object.defineProperty(globalThis, "sessionStorage", {
  value: globalThis.sessionStorage?.clear ? globalThis.sessionStorage : sessionStub,
  configurable: true,
  writable: true,
});

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  getUser: vi.fn(),
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
      getUser: mocks.getUser,
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

/** The user auth reports AFTER the email update — still anonymous by default,
 *  i.e. the project requires a confirmation link. */
const stillAnonymous = { is_anonymous: true, email: null, identities: [] };
/** …and the converted-immediately shape (confirmation disabled). */
const permanent = {
  is_anonymous: false,
  email: "guest@example.com",
  identities: [{ provider: "email" }],
};

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: stillAnonymous }, error: null });
  mocks.profileRead.mockResolvedValue({ data: { is_anonymous: false }, error: null });
});

afterAll(() => resetStorage());

describe("initiateAnonymousEmailUpgrade", () => {
  const args = {
    userId: "anon-1",
    email: "  Guest@Example.com  ",
    password: "sixtee",
    redirectTo: "https://mogzy.lol/auth/callback?returnTo=%2Fquiz",
  };

  it("sets the password FIRST, then attaches the email — never signOut, never signUp", async () => {
    const res = await initiateAnonymousEmailUpgrade(args);
    expect(res.ok).toBe(true);
    // AUTH1 order: the credential exists before the email branch is decided,
    // so the user never has to come back to a form to finish.
    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, { password: "sixtee" });
    expect(mocks.updateUser).toHaveBeenNthCalledWith(
      2,
      { email: "Guest@Example.com" },
      { emailRedirectTo: args.redirectTo },
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("reports converted and syncs the profile when no confirmation is required", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: permanent }, error: null });
    const res = await initiateAnonymousEmailUpgrade(args);
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(true);
    // The account is permanent now, so the derived profile flag follows.
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ is_anonymous: false });
    // Nothing left pending — there is no link to come back from.
    expect(readPendingUpgrade()).toBeNull();
  });

  it("falls back to the retained pending flow when a confirmation IS required", async () => {
    const res = await initiateAnonymousEmailUpgrade({ ...args, email: "guest@example.com" });
    expect(res.ok).toBe(true);
    expect(res.converted).toBe(false);
    expect(readPendingUpgrade()).toEqual({
      userId: "anon-1",
      email: "guest@example.com",
      returnTo: args.redirectTo,
      // The callback uses this to skip asking for a password it already has.
      passwordSet: true,
    });
  });

  it("persists a pending record with userId+email but NEVER a password", async () => {
    await initiateAnonymousEmailUpgrade({ ...args, email: "guest@example.com" });
    const dump = JSON.stringify(localStorage);
    expect(dump.toLowerCase()).not.toContain("sixtee");
    expect(readPendingUpgrade()?.email).toBe("guest@example.com");
  });

  it("does not write a pending record and surfaces emailInUse on 'already registered'", async () => {
    mocks.updateUser
      .mockResolvedValueOnce({ data: {}, error: null })          // password step
      .mockResolvedValueOnce({                                    // email step
        data: {},
        error: { message: "Email address already been registered" },
      });
    const res = await initiateAnonymousEmailUpgrade({ ...args, email: "taken@example.com" });
    expect(res.ok).toBe(false);
    expect(res.emailInUse).toBe(true);
    expect(readPendingUpgrade()).toBeNull();
  });

  it("never writes the profile while a confirmation is still outstanding", async () => {
    await initiateAnonymousEmailUpgrade({ ...args, email: "guest@example.com" });
    expect(mocks.profileUpdate).not.toHaveBeenCalled();
  });

  it("stops at the password step when it fails, without touching the email", async () => {
    mocks.updateUser.mockResolvedValueOnce({ data: {}, error: { message: "weak" } });
    const res = await initiateAnonymousEmailUpgrade(args);
    expect(res.ok).toBe(false);
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(readPendingUpgrade()).toBeNull();
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
      password: "sixtee",
      redirectTo: "https://mogzy.lol/auth/callback",
    });
    expect(readPendingUpgrade()).not.toBeNull();
    clearPendingUpgrade();
    expect(readPendingUpgrade()).toBeNull();
  });
});
