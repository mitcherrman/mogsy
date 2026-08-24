/**
 * THE ADMIN REPLAY POLICY.
 *
 * Two properties are being defended here, and both of them are about what an
 * ADMIN REPLAY MUST NOT DO:
 *
 *  1. it must not be reachable by typing a query parameter, and
 *  2. it must not write anything to the admin's own account.
 *
 * Everything else about it is ordinary. Keeping the rule as a pure function
 * means both properties can be stated as arithmetic rather than inferred from
 * a rendered page.
 */
import { describe, expect, it } from "vitest";
import {
  ADMIN_REPLAY_PARAM, ADMIN_TUTORIAL_REPLAY_ROUTE,
  isAdminReplayRequested, resolveTutorialRun,
} from "./adminReplay";

const base = {
  required: false,
  policyForcesTutorial: true,
  completed: true,
  adminReplayRequested: false,
  isAdmin: false,
};

describe("the query parameter authorizes nothing", () => {
  it("is IGNORED for a signed-in ordinary player, in every account state", () => {
    // An incomplete, forced player who types the parameter still gets the
    // mandatory run — the one that traps them until they finish, and records
    // the completion when they do.
    expect(resolveTutorialRun({
      ...base, required: true, completed: false, adminReplayRequested: true,
    })).toEqual({ mode: "mandatory", adminReplay: false, persistsCompletion: true });

    // An incomplete player under a relaxed policy still gets their FIRST
    // completion recorded. Letting the parameter suppress that would be a way
    // for any player to opt out of ever being marked complete.
    expect(resolveTutorialRun({
      ...base, required: true, completed: false, policyForcesTutorial: false,
      adminReplayRequested: true,
    })).toEqual({ mode: "voluntary", adminReplay: false, persistsCompletion: true });

    // A completed player replays exactly as they always could.
    expect(resolveTutorialRun({ ...base, adminReplayRequested: true }))
      .toEqual({ mode: "replay", adminReplay: false, persistsCompletion: false });
  });

  it("does nothing for an admin who did not ask for it", () => {
    expect(resolveTutorialRun({
      ...base, required: true, completed: false, isAdmin: true,
    })).toEqual({ mode: "mandatory", adminReplay: false, persistsCompletion: true });
  });

  it("accepts only explicit truthy values", () => {
    expect(isAdminReplayRequested("1")).toBe(true);
    expect(isAdminReplayRequested("true")).toBe(true);
    for (const value of [null, undefined, "", "0", "false", "yes", "adminReplay"]) {
      expect(isAdminReplayRequested(value)).toBe(false);
    }
  });
});

describe("an authorized admin replay", () => {
  it("runs as a replay and writes nothing, whatever the account state", () => {
    for (const account of [
      { required: true, completed: false, policyForcesTutorial: true },
      { required: true, completed: false, policyForcesTutorial: false },
      { required: false, completed: true, policyForcesTutorial: true },
    ]) {
      expect(resolveTutorialRun({
        ...base, ...account, adminReplayRequested: true, isAdmin: true,
      }), JSON.stringify(account)).toEqual({
        mode: "replay", adminReplay: true, persistsCompletion: false,
      });
    }
  });

  it("is a rehearsal, not a completion: the forced gate is unchanged", () => {
    // `required` is derived from the account's completion stamp, and nothing
    // here writes one. So an admin who has never completed the tutorial is
    // still required to complete it afterwards — the replay changed the run,
    // not the account.
    const run = resolveTutorialRun({
      ...base, required: true, completed: false,
      adminReplayRequested: true, isAdmin: true,
    });
    expect(run.persistsCompletion).toBe(false);
    // And the ordinary resolution for that same account is untouched.
    expect(resolveTutorialRun({ ...base, required: true, completed: false }).mode)
      .toBe("mandatory");
  });
});

describe("the entry point", () => {
  it("is the REAL tutorial route, not a second one", () => {
    expect(ADMIN_TUTORIAL_REPLAY_ROUTE)
      .toBe(`/quiz/tutorial?${ADMIN_REPLAY_PARAM}=1`);
  });
});
