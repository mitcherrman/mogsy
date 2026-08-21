/**
 * Adopting the Academy registration into a real profile (HI1-C5B).
 *
 * This is the module that turns two answers typed by a signed-out visitor into
 * durable user data, and almost every assertion below is about it NOT doing
 * something: not writing without a session, not overwriting a name or a rank
 * that is already the account's own, not inserting a profile row it has no
 * authority to create, not retrying a settled record, and not throwing out of a
 * submit handler that turns a page on the next line.
 *
 * THE PLACEHOLDER CASE IS THE IMPORTANT ONE. `handle_new_user()` does not leave
 * an anonymous account's display_name blank — it writes 'Anonymous' || <count>.
 * A blank-only check therefore never fires for exactly the visitors who DO have
 * a session at /welcome, which was the whole case the write existed to serve.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const supa = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: supa.getSession },
    from: () => ({
      select: (columns: string) => {
        supa.select(columns);
        return { eq: () => ({ maybeSingle: () => supa.maybeSingle(columns) }) };
      },
      update: (patch: unknown) => {
        supa.update(patch);
        return { eq: supa.updateEq };
      },
      insert: supa.insert,
    }),
  },
}));

import {
  adoptAcademyIdentity,
  adoptRegistrationForUser,
  isPlaceholderDisplayName,
} from "./provisional-identity";
import {
  readAcademyRegistration,
  saveAcademyRegistration,
  type AcademyRegistration,
} from "./academy-registration";
import { installLocalStorageStub } from "@/test/localStorageStub";

const resetStorage = installLocalStorageStub();

const REG: AcademyRegistration = {
  username: "Orianna",
  rank: "emerald",
  at: "2026-08-21T12:00:00.000Z",
  adoptedBy: null,
};

/** A profile row as the select in this module reads it. */
const profile = (over: Partial<Record<string, unknown>> = {}) => ({
  data: { display_name: "", is_anonymous: null, league_rank: null, ...over },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetStorage();
  supa.getSession.mockResolvedValue({ data: { session: null } });
  supa.maybeSingle.mockResolvedValue(profile());
  supa.updateEq.mockResolvedValue({ error: null });
});

describe("recognising a placeholder name", () => {
  it("treats blank and whitespace as no name at all", () => {
    expect(isPlaceholderDisplayName("", null)).toBe(true);
    expect(isPlaceholderDisplayName("   ", null)).toBe(true);
    expect(isPlaceholderDisplayName(null, null)).toBe(true);
    expect(isPlaceholderDisplayName(undefined, false)).toBe(true);
  });

  it("treats the trigger's generated anonymous name as a placeholder", () => {
    // THE C5 BUG. handle_new_user() writes 'Anonymous' || count for anonymous
    // signups, so a blank-only check never fired for a guest with a session —
    // the one case where a write was actually possible at /welcome.
    expect(isPlaceholderDisplayName("Anonymous41", true)).toBe(true);
  });

  it("does not touch a chosen name that merely looks anonymous", () => {
    // Someone who calls themselves Anonymous has chosen a name.
    expect(isPlaceholderDisplayName("Anonymous", true)).toBe(false);
    expect(isPlaceholderDisplayName("Anonymous Wizard", true)).toBe(false);
    expect(isPlaceholderDisplayName("The Anonymous 12", true)).toBe(false);
  });

  it("only forgives the generated name while the row still says anonymous", () => {
    // A converted account keeps whatever its name says, generated or not.
    expect(isPlaceholderDisplayName("Anonymous41", false)).toBe(false);
    expect(isPlaceholderDisplayName("Anonymous41", null)).toBe(false);
  });

  it("never treats a real name as a placeholder", () => {
    expect(isPlaceholderDisplayName("Faker", true)).toBe(false);
    expect(isPlaceholderDisplayName("Faker", false)).toBe(false);
  });
});

describe("writing a registration through to a profile", () => {
  it("writes both fields into an empty profile", () => {
    return adoptRegistrationForUser(REG, "u1").then((res) => {
      expect(supa.update).toHaveBeenCalledWith({
        display_name: "Orianna",
        league_rank: "emerald",
        league_rank_reported_at: REG.at,
      });
      expect(res.written).toEqual(["display_name", "league_rank"]);
      expect(res.settled).toBe(true);
    });
  });

  it("names an anonymous guest whose profile carries the generated placeholder", async () => {
    supa.maybeSingle.mockResolvedValue(
      profile({ display_name: "Anonymous41", is_anonymous: true }),
    );
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: "Orianna" }),
    );
    expect(res.written).toContain("display_name");
  });

  it("never overwrites an established display name — but still fills a null rank", async () => {
    // /welcome is replayable forever. A returning visitor with a real account
    // replaying the introduction must not lose their name to it. Filling a rank
    // they have never given is additive, not destructive.
    supa.maybeSingle.mockResolvedValue(profile({ display_name: "Faker", is_anonymous: false }));
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).toHaveBeenCalledWith({
      league_rank: "emerald",
      league_rank_reported_at: REG.at,
    });
    expect(res.written).toEqual(["league_rank"]);
  });

  it("never overwrites a rank the account has already reported", async () => {
    supa.maybeSingle.mockResolvedValue(profile({ league_rank: "diamond" }));
    await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ league_rank: expect.anything() }),
    );
  });

  it("writes nothing at all when both fields are already the account's own", async () => {
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    supa.maybeSingle.mockResolvedValue(
      profile({ display_name: "Faker", is_anonymous: false, league_rank: "diamond" }),
    );
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).not.toHaveBeenCalled();
    expect(res).toMatchObject({ written: [], settled: true, reason: "profile-established" });
    // Settled: there is nothing this record could ever contribute, so it must
    // stop asking on every page load for the rest of time.
    expect(readAcademyRegistration()?.adoptedBy).toBe("u1");
  });

  it("does not manufacture a profile row that does not exist", async () => {
    // Rows are created by handle_new_user() on the auth trigger. An
    // introduction screen inventing account lifecycle is how duplicate
    // identities get made.
    supa.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(supa.insert).not.toHaveBeenCalled();
    expect(supa.update).not.toHaveBeenCalled();
    // NOT settled — the row may simply not have been written yet.
    expect(res).toMatchObject({ settled: false, reason: "no-profile" });
  });

  it("leaves a failed write retryable rather than marking it done", async () => {
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    supa.updateEq.mockResolvedValue({ error: { message: "rls" } });
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(res).toMatchObject({ settled: false, reason: "error" });
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("resolves rather than rejects when the read fails", async () => {
    supa.maybeSingle.mockResolvedValue({ data: null, error: { message: "rls" } });
    await expect(adoptRegistrationForUser(REG, "u1")).resolves.toMatchObject({
      settled: false,
      reason: "error",
    });
  });

  it("resolves rather than rejects when the client throws outright", async () => {
    supa.maybeSingle.mockRejectedValue(new Error("network"));
    await expect(adoptRegistrationForUser(REG, "u1")).resolves.toMatchObject({
      reason: "error",
    });
  });

  it("refuses an empty name and an absent user without asking the backend", async () => {
    await expect(adoptRegistrationForUser({ ...REG, username: "  " }, "u1")).resolves.toMatchObject(
      { reason: "error" },
    );
    await expect(adoptRegistrationForUser(REG, "")).resolves.toMatchObject({
      reason: "no-session",
    });
    expect(supa.maybeSingle).not.toHaveBeenCalled();
  });

  it("stamps a report time even for a record that somehow carries none", async () => {
    await adoptRegistrationForUser({ ...REG, at: "" }, "u1");
    const patch = supa.update.mock.calls[0][0] as Record<string, string>;
    expect(patch.league_rank_reported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("a deployment where the migration has not run yet", () => {
  /** PostgREST rejects the whole request when a selected column is unknown. */
  const withoutRankColumn = () =>
    supa.maybeSingle.mockImplementation((columns: string) =>
      columns.includes("league_rank")
        ? Promise.resolve({ data: null, error: { message: 'column "league_rank" does not exist' } })
        : Promise.resolve({
            data: { display_name: "", is_anonymous: null },
            error: null,
          }),
    );

  it("still writes the name — the rank must not take it down with it", async () => {
    // The frontend and the SQL ship together but are APPLIED separately, and
    // master auto-deploys. For however long the bundle is live and the
    // migration is not, an all-or-nothing write would lose every registration's
    // NAME too, on the first screen a new visitor ever sees.
    withoutRankColumn();
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    const res = await adoptRegistrationForUser(REG, "u1");

    expect(supa.update).toHaveBeenCalledWith({ display_name: "Orianna" });
    expect(res.written).toEqual(["display_name"]);
    expect(res.rankColumnMissing).toBe(true);
  });

  it("leaves the record owing a rank, so it lands by itself once the column exists", async () => {
    withoutRankColumn();
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(res.settled).toBe(false);
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();

    // The migration lands. The next attempt finds the name already written and
    // contributes only what it still owes — no hand-driven backfill.
    supa.update.mockClear();
    supa.maybeSingle.mockResolvedValue(profile({ display_name: "Orianna", league_rank: null }));
    const after = await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).toHaveBeenCalledWith({
      league_rank: "emerald",
      league_rank_reported_at: REG.at,
    });
    expect(after.settled).toBe(true);
    expect(readAcademyRegistration()?.adoptedBy).toBe("u1");
  });

  it("does not settle an established profile it could still owe a rank", async () => {
    supa.maybeSingle.mockImplementation((columns: string) =>
      columns.includes("league_rank")
        ? Promise.resolve({ data: null, error: { message: "no such column" } })
        : Promise.resolve({
            data: { display_name: "Faker", is_anonymous: false },
            error: null,
          }),
    );
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(supa.update).not.toHaveBeenCalled();
    expect(res.settled).toBe(false);
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("still reports a genuine read failure as one", async () => {
    // Both selects failing is RLS or a dead connection, not a missing column.
    supa.maybeSingle.mockResolvedValue({ data: null, error: { message: "rls" } });
    const res = await adoptRegistrationForUser(REG, "u1");
    expect(res).toMatchObject({ settled: false, reason: "error" });
    expect(res.rankColumnMissing).toBeUndefined();
  });
});

describe("adopting whatever this device is holding", () => {
  it("does nothing, and asks nothing, with no local record", async () => {
    const res = await adoptAcademyIdentity();
    expect(res).toMatchObject({ settled: true, reason: "nothing-to-adopt" });
    expect(supa.getSession).not.toHaveBeenCalled();
  });

  it("waits when there is no session — the ordinary state at /welcome", async () => {
    // AuthProvider signs in anonymously only when `require_auth` is disabled,
    // so a first-time visitor answers the register as a pure signed-out guest.
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    const res = await adoptAcademyIdentity();
    expect(res).toMatchObject({ settled: false, reason: "no-session" });
    expect(supa.update).not.toHaveBeenCalled();
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();
  });

  it("asks the LOCAL session rather than the network", async () => {
    // getUser() calls /auth/v1/user, which a signed-out visitor answers with a
    // 400 — a failed request and a console error on the first screen a new
    // visitor ever sees, in the ordinary case for this route.
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    await adoptAcademyIdentity();
    expect(supa.getSession).toHaveBeenCalled();
    expect(supa).not.toHaveProperty("getUser");
  });

  it("resolves the current user itself when it is not given one", async () => {
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    supa.getSession.mockResolvedValue({ data: { session: { user: { id: "u9" } } } });
    await adoptAcademyIdentity();
    expect(supa.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: REG.username }),
    );
    expect(readAcademyRegistration()?.adoptedBy).toBe("u9");
  });

  it("adopts at most once, ever", async () => {
    // A device is not a person. A provisional name typed by whoever opened the
    // browser first must not follow every account that later signs in on it.
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    await adoptAcademyIdentity("u1");
    expect(supa.update).toHaveBeenCalledTimes(1);

    supa.maybeSingle.mockClear();
    const second = await adoptAcademyIdentity("u2");
    expect(second).toMatchObject({ settled: true, reason: "already-adopted" });
    expect(supa.maybeSingle).not.toHaveBeenCalled();
    expect(supa.update).toHaveBeenCalledTimes(1);
  });

  it("tries again after a recoverable failure", async () => {
    saveAcademyRegistration({ username: REG.username, rank: REG.rank });
    supa.maybeSingle.mockResolvedValue({ data: null, error: null }); // row not there yet
    await adoptAcademyIdentity("u1");
    expect(readAcademyRegistration()?.adoptedBy).toBeNull();

    supa.maybeSingle.mockResolvedValue(profile());
    const res = await adoptAcademyIdentity("u1");
    expect(res.settled).toBe(true);
    expect(supa.update).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: REG.username }),
    );
  });
});
