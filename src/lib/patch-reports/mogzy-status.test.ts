import { describe, expect, it } from "vitest";
import type { MogzyStatus } from "./api";
import {
  MOGZY_STATUS_LABEL,
  explainChangeStatus,
  restatesEntityStatus,
  summarizeReconciliation,
  trackedValueAtBuild,
} from "./mogzy-status";
import {
  RECONCILIATION_26_19,
  REPORT_26_19_LINE_COUNT,
  SR_APHELIOS,
  SR_AURORA,
  SR_DRAVEN,
  SR_VI,
} from "./phsr1-sr-fixtures";
import { mkChange } from "./test-fixtures";

// The backend contract this vocabulary sits on. If the backend adds a status,
// this list and MOGZY_STATUS_LABEL must both change deliberately.
const BACKEND_STATUSES: MogzyStatus[] = [
  "matches",
  "applied",
  "pending",
  "mismatch",
  "unresolved",
  "needs_interpretation",
  "not_represented",
];

describe("consumer status vocabulary", () => {
  it("labels every backend status, and only those", () => {
    expect(Object.keys(MOGZY_STATUS_LABEL).sort()).toEqual([...BACKEND_STATUSES].sort());
  });

  it("maps each status to its consumer label", () => {
    expect(MOGZY_STATUS_LABEL).toEqual({
      matches: "Mogzy data current",
      applied: "Mogzy data updated",
      pending: "Mogzy update in review",
      mismatch: "Mogzy data update flagged",
      unresolved: "Not yet matched to Mogzy data",
      needs_interpretation: "Not auto-checked by Mogzy",
      not_represented: "Not modeled by Mogzy",
    });
  });

  it("never uses the engineering terms as a consumer label", () => {
    for (const label of Object.values(MOGZY_STATUS_LABEL)) {
      expect(label).not.toMatch(/mismatch|not represented|needs interpretation|unresolved|canonical|held/i);
    }
  });

  it("never promises that a flagged change is still pending or will be applied", () => {
    // Draven 26.19 was built as `mismatch` with Mogzy holding 62, and Mogzy
    // has held Riot's 64 since reconciliation. The label must stay true.
    const text = [MOGZY_STATUS_LABEL.mismatch, ...explainChangeStatus(SR_DRAVEN.changes[0])].join(" ");
    expect(text).not.toMatch(/pending|will be (applied|updated)|currently/i);
    expect(text).toMatch(/when this report was built/i);
    expect(text).toMatch(/not every flagged change can be applied automatically/i);
  });
});

describe("line explanations", () => {
  it("Draven: names the value Mogzy held at build without contradicting Riot or Impact", () => {
    const [draven] = SR_DRAVEN.changes;
    expect(draven.before_raw).toBe("62");
    expect(draven.after_raw).toBe("64");
    const text = explainChangeStatus(draven, { impactScoped: true }).join(" ");
    expect(text).toContain("When this report was built, Mogzy's data still had 62 here, not Riot's new value");
    expect(text).toContain("not Riot's patch note");
    expect(text).toContain("Mogzy Impact works from Riot's published numbers");
    expect(trackedValueAtBuild(draven)).toBe("62");
  });

  it("formula lines keep the formula out of the sentence", () => {
    const auroraE = SR_AURORA.changes[0];
    expect(auroraE.mogzy_property).toBe("ability_damage_formula");
    const text = explainChangeStatus(auroraE).join(" ");
    expect(text).toMatch(/calculates this from a formula/);
    expect(text).not.toContain("MOD_Magic");
    expect(trackedValueAtBuild(auroraE)).toBeNull();
  });

  it("prose lines say they are not auto-checked rather than promising a review", () => {
    const text = explainChangeStatus(
      mkChange({ change_kind: "mechanical", mogzy_status: "needs_interpretation" }),
    ).join(" ");
    expect(text).toMatch(/describes this change in words/);
    expect(text).not.toMatch(/review/i);
  });

  it("current lines carry no 'not Riot's patch note' disclaimer", () => {
    const text = explainChangeStatus(mkChange({ mogzy_status: "applied" })).join(" ");
    expect(text).toBe("Mogzy has updated its data to Riot's new value.");
  });

  it("every status has an explanation", () => {
    for (const status of BACKEND_STATUSES) {
      expect(explainChangeStatus(mkChange({ mogzy_status: status })).length).toBeGreaterThan(0);
    }
  });
});

describe("restatesEntityStatus", () => {
  it("Aphelios: five untracked lines under the same header status all restate it", () => {
    expect(SR_APHELIOS.changes).toHaveLength(5);
    expect(
      SR_APHELIOS.changes.every((c) => restatesEntityStatus(c, SR_APHELIOS.aggregate_status)),
    ).toBe(true);
  });

  it("keeps a line whose status differs from its entry (Aurora R under a flagged header)", () => {
    const [auroraE, auroraR] = SR_AURORA.changes;
    expect(SR_AURORA.aggregate_status).toBe("mismatch");
    expect(restatesEntityStatus(auroraR, SR_AURORA.aggregate_status)).toBe(false);
    // Same status as the header, but it carries a tracked property and formula.
    expect(restatesEntityStatus(auroraE, SR_AURORA.aggregate_status)).toBe(false);
  });

  it("keeps tracked values, reviews and Mogzy Impact lines", () => {
    const base = mkChange({ mogzy_status: "not_represented" });
    expect(restatesEntityStatus(base, "not_represented")).toBe(true);
    expect(restatesEntityStatus({ ...base, mogzy_current_raw: "62" }, "not_represented")).toBe(false);
    expect(restatesEntityStatus({ ...base, mogzy_property: "base_ad" }, "not_represented")).toBe(false);
    expect(restatesEntityStatus({ ...base, proposal_status: "PENDING" }, "not_represented")).toBe(false);
    expect(restatesEntityStatus({ ...base, proposal_id: 7 }, "not_represented")).toBe(false);
    expect(restatesEntityStatus(base, "not_represented", { impactScoped: true })).toBe(false);
  });

  it("Vi: both lines carry tracked evidence and stay", () => {
    expect(SR_VI.changes.some((c) => restatesEntityStatus(c, SR_VI.aggregate_status))).toBe(false);
  });
});

describe("summarizeReconciliation", () => {
  it("26.19: counts against the changes the update acted on, not the report's lines", () => {
    const s = summarizeReconciliation(RECONCILIATION_26_19);
    expect(s.status).toBe("RECONCILED_WITH_HELDS");
    expect(s.headline).toBe("Mogzy's gameplay data is partly updated for this patch");
    expect(s.body).toMatch(/^Riot's patch notes below are complete\./);
    expect(s.body).toBe(
      "Riot's patch notes below are complete. Mogzy has updated the changes it can safely incorporate; " +
        "some mechanics are not yet modeled or need review.",
    );
    expect(s.shortLabel).toBe("Mogzy data partly updated");
    expect(s).toMatchObject({
      updated: 11,
      notModeled: 24,
      needsReview: 7,
      failed: 0,
      nothingToUpdate: 173,
      checked: 42,
      total: 215,
    });
    // The reconciliation's units are not the report's lines.
    expect(REPORT_26_19_LINE_COUNT).toBe(214);
    expect(s.total).not.toBe(REPORT_26_19_LINE_COUNT);
    expect(s.checked + s.nothingToUpdate).toBe(s.total);
  });

  it("keeps every raw terminal state, known ones first, unknown ones raw", () => {
    const s = summarizeReconciliation({
      ...RECONCILIATION_26_19,
      changes_by_terminal_state: { ...RECONCILIATION_26_19.changes_by_terminal_state, NEW_STATE: 2 },
    });
    expect(s.technical.map((r) => r.key)).toEqual([
      "AUTO_APPLIED",
      "AUTO_APPLIED_REVIEW",
      "HELD_RUNTIME_WORK",
      "HELD_AUTHORITY",
      "FAILED",
      "NO_MOGZY_CONSUMER",
      "NEW_STATE",
    ]);
    expect(s.technical.at(-1)).toEqual({ key: "NEW_STATE", count: 2, meaning: null });
    // An unknown state is never folded into a consumer count.
    expect(s.checked).toBe(42);
  });

  it("absent reconciliation reads as not recorded, never as current", () => {
    const s = summarizeReconciliation(undefined);
    expect(s.status).toBe("PUBLISHED_NOT_RECONCILED");
    expect(s.recorded).toBe(false);
    expect(s.headline).toMatch(/No full Mogzy data update is recorded/);
    expect(s.technical).toEqual([]);
  });

  it("names only the hold classes that exist", () => {
    const only = summarizeReconciliation({
      ...RECONCILIATION_26_19,
      changes_by_terminal_state: { AUTO_APPLIED: 3, HELD_RUNTIME_WORK: 2, HELD_AUTHORITY: 0 },
    });
    expect(only.body).toMatch(/some mechanics are not yet modeled\.$/);
    expect(only.body).not.toContain("review");
    const reviewOnly = summarizeReconciliation({
      ...RECONCILIATION_26_19,
      changes_by_terminal_state: { AUTO_APPLIED: 3, HELD_RUNTIME_WORK: 0, HELD_AUTHORITY: 2 },
    });
    expect(reviewOnly.body).toMatch(/some changes need review\.$/);
    expect(reviewOnly.body).not.toContain("modeled");
  });

  it("SR launch integration: one wording map gives the notice headline and the masthead's short label", () => {
    const short = (status?: string) =>
      summarizeReconciliation(status ? { ...RECONCILIATION_26_19, status: status as never } : undefined).shortLabel;
    expect(short("RECONCILED")).toBe("Mogzy data up to date");
    expect(short("RECONCILED_WITH_HELDS")).toBe("Mogzy data partly updated");
    expect(short("RECONCILIATION_FAILED")).toBe("Mogzy data update didn't finish");
    expect(short("PUBLISHED_NOT_RECONCILED")).toBe("No Mogzy data update recorded");
    expect(short()).toBe("No Mogzy data update recorded");
    // An unknown future status claims nothing, in both places.
    const unknown = summarizeReconciliation({ ...RECONCILIATION_26_19, status: "SOMETHING_NEW" as never });
    expect([unknown.headline, unknown.shortLabel]).toEqual(["Mogzy data status", "Mogzy data status"]);
    for (const s of ["RECONCILED", "RECONCILED_WITH_HELDS", "RECONCILIATION_FAILED", "PUBLISHED_NOT_RECONCILED"]) {
      expect(short(s)).not.toMatch(/current|reconcil|canonical|mismatch/i);
    }
  });
});
