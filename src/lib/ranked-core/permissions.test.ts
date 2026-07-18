import { describe, expect, it } from "vitest";
import { NO_INTERACTIONS } from "./viewTypes";
import { permissionsForSubmissionPhase, restrictPermissions } from "./permissions";

describe("permissionsForSubmissionPhase", () => {
  it("closed input allows nothing regardless of phase", () => {
    expect(permissionsForSubmissionPhase("selecting", false)).toEqual(NO_INTERACTIONS);
    expect(permissionsForSubmissionPhase("reviewing", false)).toEqual(NO_INTERACTIONS);
  });

  it("selecting allows answer/ability selection but not confirm", () => {
    const p = permissionsForSubmissionPhase("selecting", true);
    expect(p.canSelectAnswer).toBe(true);
    expect(p.canSelectAbility).toBe(true);
    expect(p.canReviewSubmission).toBe(true);
    expect(p.canConfirmSubmission).toBe(false);
  });

  it("reviewing allows only confirm or going back to change", () => {
    const p = permissionsForSubmissionPhase("reviewing", true);
    expect(p.canConfirmSubmission).toBe(true);
    expect(p.canChangeAnswer).toBe(true);
    expect(p.canSelectAnswer).toBe(false);
    expect(p.canSelectAbility).toBe(false);
  });

  it("locked allows nothing (atomic lock is final)", () => {
    expect(permissionsForSubmissionPhase("locked", true)).toEqual(NO_INTERACTIONS);
  });
});

describe("restrictPermissions", () => {
  it("ANDs flags and merges disabled reasons", () => {
    const base = permissionsForSubmissionPhase("selecting", true);
    const restricted = restrictPermissions(base, {
      canSelectAbility: false,
      disabledReasons: { ability: "Scripted step: abilities come later." },
    });
    expect(restricted.canSelectAnswer).toBe(true);
    expect(restricted.canSelectAbility).toBe(false);
    expect(restricted.disabledReasons?.ability).toMatch(/scripted/i);
  });

  it("cannot grant a permission the base denies", () => {
    const restricted = restrictPermissions(NO_INTERACTIONS, { canConfirmSubmission: true });
    expect(restricted.canConfirmSubmission).toBe(false);
  });
});
