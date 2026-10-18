/**
 * EMAIL1 — guest -> permanent conversion keeps its exact request unless a
 * newsletter box was ticked AND the feature is on; then, and only then, an
 * INTENT (never an address, never consent) rides along in the same request.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installLocalStorageStub } from "@/test/localStorageStub";

const resetStorage = installLocalStorageStub();

const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), getUser: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { updateUser: mocks.updateUser, getUser: mocks.getUser },
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { is_anonymous: false }, error: null }) }) }),
    }),
  },
}));

import { initiateAnonymousEmailUpgrade } from "./account-upgrade";

const base = { userId: "g-1", email: "guest@example.com", password: "sixtee", redirectTo: "https://x.test/auth/callback" };

beforeEach(() => {
  resetStorage();
  vi.clearAllMocks();
  mocks.updateUser.mockResolvedValue({ data: {}, error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { is_anonymous: false, email: "guest@example.com", identities: [{ provider: "email" }] } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => resetStorage());

describe("initiateAnonymousEmailUpgrade · EMAIL1", () => {
  it("sends exactly { email, password } when nothing was ticked", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await initiateAnonymousEmailUpgrade(base);
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser.mock.calls[0][0]).toEqual({ email: "guest@example.com", password: "sixtee" });
    await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: false, news: false } });
    expect(mocks.updateUser.mock.calls[1][0]).toEqual({ email: "guest@example.com", password: "sixtee" });
  });

  it("adds ONLY an intent to the same single request when a box is ticked", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: true, news: true } });
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser.mock.calls[0][0]).toEqual({
      email: "guest@example.com",
      password: "sixtee",
      data: { email_opt_in_intent: { topics: ["daily_reminder", "product_news", "events"], v: 1 } },
    });
  });

  it("never carries promotions from a signup form", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: true, news: true } });
    expect(JSON.stringify(mocks.updateUser.mock.calls[0][0])).not.toContain("promotions");
  });

  it("fails closed: a ticked box with the feature OFF adds nothing", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "");
    await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: true, news: true } });
    expect(mocks.updateUser.mock.calls[0][0]).toEqual({ email: "guest@example.com", password: "sixtee" });
  });

  it("keeps the intent on the narrow email-first fallback too", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    mocks.updateUser
      .mockResolvedValueOnce({ data: {}, error: { message: "Updating password of an anonymous user without an email is not allowed" } })
      .mockResolvedValue({ data: {}, error: null });
    await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: true, news: false } });
    expect(mocks.updateUser.mock.calls[1][0]).toEqual({
      email: "guest@example.com",
      data: { email_opt_in_intent: { topics: ["daily_reminder"], v: 1 } },
    });
    expect(mocks.updateUser.mock.calls[2][0]).toEqual({ password: "sixtee" });
  });

  it("the result and the conversion are unaffected by the checkboxes", async () => {
    vi.stubEnv("VITE_EMAIL_SUBSCRIPTIONS_ENABLED", "true");
    const plain = await initiateAnonymousEmailUpgrade(base);
    const ticked = await initiateAnonymousEmailUpgrade({ ...base, emailChoice: { daily: true, news: true } });
    expect(ticked).toEqual(plain);
    expect(plain).toEqual({ ok: true, converted: true });
  });
});
