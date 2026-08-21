/**
 * Seeding a real profile from the provisional registration (HI1-C5).
 *
 * This is the only code on the /welcome route that touches the backend, and
 * every assertion below is about it NOT doing something: not writing without a
 * session, not writing over a name that already exists, not inserting a profile
 * row it has no authority to create, and not throwing out of a submit handler
 * that navigates on the next line.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: supa.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: supa.maybeSingle }) }),
      update: (patch: unknown) => {
        supa.update(patch);
        return { eq: supa.updateEq };
      },
      insert: supa.insert,
    }),
  },
}));

import { seedProfileDisplayName } from "./provisional-identity";

const signedIn = () => supa.getUser.mockResolvedValue({ data: { user: { id: "u1" } } });

beforeEach(() => {
  vi.clearAllMocks();
  supa.getUser.mockResolvedValue({ data: { user: null } });
  supa.maybeSingle.mockResolvedValue({ data: null, error: null });
  supa.updateEq.mockResolvedValue({ error: null });
});

describe("seeding a display name", () => {
  it("writes nothing at all when there is no session", async () => {
    // The ordinary case at /welcome: AuthProvider only signs in anonymously
    // when `require_auth` is disabled, so a first-time visitor is a pure guest.
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "no-session",
    });
    expect(supa.update).not.toHaveBeenCalled();
  });

  it("seeds a profile whose display name is empty", async () => {
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: { display_name: "" }, error: null });
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({ seeded: true });
    expect(supa.update).toHaveBeenCalledWith({ display_name: "Orianna" });
  });

  it("never overwrites a name that is already there", async () => {
    // /welcome is replayable forever. A returning visitor with a real account
    // replaying the introduction must not lose their display name to it.
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: { display_name: "Faker" }, error: null });
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "already-named",
    });
    expect(supa.update).not.toHaveBeenCalled();
  });

  it("treats whitespace as no name, but does not store whitespace either", async () => {
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: { display_name: "   " }, error: null });
    await seedProfileDisplayName("  Orianna  ");
    expect(supa.update).toHaveBeenCalledWith({ display_name: "Orianna" });
  });

  it("does not manufacture a profile row that does not exist", async () => {
    // Rows are provisioned by the backend for real accounts. An introduction
    // screen inventing account lifecycle is exactly what this phase is not.
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "no-profile",
    });
    expect(supa.insert).not.toHaveBeenCalled();
    expect(supa.update).not.toHaveBeenCalled();
  });

  it("resolves rather than rejects when the read fails", async () => {
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: null, error: { message: "rls" } });
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "error",
    });
  });

  it("resolves rather than rejects when the write fails", async () => {
    signedIn();
    supa.maybeSingle.mockResolvedValue({ data: { display_name: null }, error: null });
    supa.updateEq.mockResolvedValue({ error: { message: "rls" } });
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "error",
    });
  });

  it("resolves rather than rejects when the client throws outright", async () => {
    supa.getUser.mockRejectedValue(new Error("network"));
    await expect(seedProfileDisplayName("Orianna")).resolves.toEqual({
      seeded: false,
      reason: "error",
    });
  });

  it("refuses an empty name without asking the backend anything", async () => {
    await expect(seedProfileDisplayName("   ")).resolves.toEqual({
      seeded: false,
      reason: "error",
    });
    expect(supa.getUser).not.toHaveBeenCalled();
  });
});
