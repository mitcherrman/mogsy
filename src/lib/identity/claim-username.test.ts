/**
 * AUTH3 — claiming a username through set_display_name().
 *
 * The point of this suite is the BOUNDARY: what the database says, and what the
 * user reads. A raw Postgres string, a PostgREST envelope or a column name
 * reaching a person is the failure being tested against, so every one of these
 * cases ends at the sentence rather than at the code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const sb = vi.hoisted(() => ({
  getSession: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    auth: { getSession: sb.getSession },
    from: () => ({
      update: (patch: unknown) => {
        sb.update(patch);
        return { eq: sb.updateEq };
      },
    }),
  },
}));

import { checkUsernameAvailable, claimUsername } from "./claim-username";
import { USERNAME_MESSAGES } from "./username";

beforeEach(() => {
  rpc.mockReset();
  sb.getSession.mockReset();
  sb.update.mockReset();
  sb.updateEq.mockReset();
  sb.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  sb.updateEq.mockResolvedValue({ error: null });
});

describe("claimUsername", () => {
  it("sends the normalised name and returns what was stored", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "set", display_name: "Mogzy King" }, error: null });

    const result = await claimUsername("  Mogzy   King  ");

    expect(rpc).toHaveBeenCalledWith("set_display_name", {
      _name: "Mogzy King",
      _only_if_unset: false,
    });
    expect(result).toMatchObject({ ok: true, username: "Mogzy King" });
  });

  it("passes first-write-wins through to the statement that writes", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "already_set", display_name: "Existing" }, error: null });

    const result = await claimUsername("Newer", { onlyIfUnset: true });

    expect(rpc).toHaveBeenCalledWith("set_display_name", {
      _name: "Newer",
      _only_if_unset: true,
    });
    // An account that already had a name keeps it, and that is a success.
    expect(result).toMatchObject({ ok: true, code: "already_set", username: "Existing" });
  });

  it("never round-trips a name that fails the shared shape rules", async () => {
    const result = await claimUsername("A");
    expect(rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "too_short", error: USERNAME_MESSAGES.too_short });
  });

  it("turns a taken name into the friendly sentence", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "taken" }, error: null });

    const result = await claimUsername("MogzyKing");

    expect(result.ok).toBe(false);
    expect(result.taken).toBe(true);
    expect(result.error).toBe("That username is already taken.");
  });

  it("never shows a raw database error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "profiles_display_name_unique_ci"',
        details: "Key (normalize_display_name(display_name))=(mogzyking) already exists.",
      },
    });

    const result = await claimUsername("MogzyKing");

    expect(result.ok).toBe(false);
    expect(result.error).toBe(USERNAME_MESSAGES.unavailable);
    expect(result.error).not.toMatch(/constraint|duplicate|display_name|23505/i);
  });

  it("survives a transport failure without throwing", async () => {
    rpc.mockRejectedValue(new Error("network down"));
    await expect(claimUsername("MogzyKing")).resolves.toMatchObject({
      ok: false,
      error: USERNAME_MESSAGES.unavailable,
    });
  });

  it("treats an unrecognised server code as a generic failure, not a crash", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "something_new" }, error: null });
    await expect(claimUsername("MogzyKing")).resolves.toMatchObject({
      ok: false,
      error: USERNAME_MESSAGES.unavailable,
    });
  });

  it("reports an unauthenticated caller in product language", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "unauthenticated" }, error: null });
    const result = await claimUsername("MogzyKing");
    expect(result.error).toBe(USERNAME_MESSAGES.unauthenticated);
  });
});

describe("the window where the bundle is live and the migration is not", () => {
  // The frontend and the SQL ship together but are APPLIED separately, and
  // master auto-deploys. Without this the gap would take out every name write
  // in the product at once, and the person renaming themselves would just be
  // told it did not work.
  const missingFunction = {
    code: "PGRST202",
    message:
      "Could not find the function public.set_display_name(_name, _only_if_unset) in the schema cache",
  };

  it("still saves the name, the way it was saved before AUTH3", async () => {
    rpc.mockResolvedValue({ data: null, error: missingFunction });

    const result = await claimUsername("MogzyKing");

    expect(sb.update).toHaveBeenCalledWith({ display_name: "MogzyKing" });
    expect(result).toMatchObject({ ok: true, code: "set_legacy", username: "MogzyKing" });
  });

  it("recognises the same condition reported as a Postgres undefined_function", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    await expect(claimUsername("MogzyKing")).resolves.toMatchObject({ ok: true });
  });

  it("does not fall back for an ordinary failure", async () => {
    // A permissions error or a dropped connection is NOT a missing migration,
    // and quietly writing around it would be exactly the bypass this change
    // exists to close.
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });

    const result = await claimUsername("MogzyKing");

    expect(sb.update).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("does not fall back for a name the server refused on its merits", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "taken" }, error: null });
    await claimUsername("MogzyKing");
    expect(sb.update).not.toHaveBeenCalled();
  });

  it("refuses rather than guessing when there is no session to write for", async () => {
    rpc.mockResolvedValue({ data: null, error: missingFunction });
    sb.getSession.mockResolvedValue({ data: { session: null } });

    const result = await claimUsername("MogzyKing");

    expect(sb.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, code: "unauthenticated" });
  });
});

describe("checkUsernameAvailable", () => {
  it("reports a free name as available", async () => {
    rpc.mockResolvedValue({ data: { ok: true, code: "available" }, error: null });
    await expect(checkUsernameAvailable("MogzyKing")).resolves.toMatchObject({ ok: true });
  });

  it("reports a taken name before the form is submitted", async () => {
    rpc.mockResolvedValue({ data: { ok: false, code: "taken" }, error: null });
    const result = await checkUsernameAvailable("MogzyKing");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("That username is already taken.");
  });

  it('never turns "could not check" into "taken"', async () => {
    // A signed-out caller is the ORDINARY state on the signup form. Telling
    // them a free name is taken because the precheck could not run would be a
    // lie that costs them the name they wanted.
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(checkUsernameAvailable("MogzyKing")).resolves.toMatchObject({
      ok: true,
      code: "unknown",
    });

    rpc.mockRejectedValue(new Error("offline"));
    await expect(checkUsernameAvailable("MogzyKing")).resolves.toMatchObject({
      ok: true,
      code: "unknown",
    });
  });
});
