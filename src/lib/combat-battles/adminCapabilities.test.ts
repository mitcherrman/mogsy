import { describe, expect, it } from "vitest";
import { getBattleAdminCapabilities } from "./adminCapabilities";
import type { AdminBattle, BattleStatus } from "./types";

// Minimal AdminBattle factory. `stored`/`effective` drive the rules; other
// authoritative signals (result_checksum, published_at) are set to be
// consistent with the lifecycle state by default.
function battle(
  stored: BattleStatus,
  over: Partial<AdminBattle> = {},
): AdminBattle {
  const published = stored === "scheduled";
  return {
    battle_id: "b1",
    slug: "b1",
    title: "B1",
    description: "",
    stored_status: stored,
    effective_status: (over.effective_status ?? stored) as BattleStatus,
    battle_format: "independent_damage_comparison_v1",
    healing_enabled: false,
    open_at: null,
    lock_at: null,
    reveal_at: null,
    left_snapshot: {},
    right_snapshot: {},
    engine_metadata: {},
    validation_report: null,
    frozen_result: published ? ({} as never) : null,
    winner_side: null,
    decision_reason: null,
    input_checksum: published ? "in" : null,
    result_checksum: published ? "res" : null,
    created_at: "",
    updated_at: "",
    published_at: published ? "2026-01-01T00:00:00Z" : null,
    voided_at: null,
    void_reason: null,
    ...over,
  };
}

const ORDERED = { openAt: "2026-01-01T10:00", lockAt: "2026-01-01T11:00", revealAt: "2026-01-01T12:00" };

describe("getBattleAdminCapabilities — authoritative admin action gating", () => {
  it("7. reproduce is unavailable for a draft", () => {
    const c = getBattleAdminCapabilities(battle("draft"));
    expect(c.reproduce.available).toBe(false);
    expect(c.reproduce.reason).toMatch(/Publish to freeze/);
  });

  it("8. reproduce is unavailable for a validated (unpublished) event", () => {
    expect(getBattleAdminCapabilities(battle("validated")).reproduce.available).toBe(false);
  });

  it("9. reproduce is available only when a frozen result exists (published)", () => {
    expect(getBattleAdminCapabilities(battle("scheduled", { effective_status: "revealed" })).reproduce.available).toBe(true);
    // published-then-voided keeps its frozen result → still reproducible
    expect(getBattleAdminCapabilities(battle("void", { result_checksum: "res", frozen_result: {} as never })).reproduce.available).toBe(true);
    // void with no frozen result (voided before publish) → not reproducible
    expect(getBattleAdminCapabilities(battle("void")).reproduce.available).toBe(false);
  });

  it("10. validate matches backend editable states", () => {
    expect(getBattleAdminCapabilities(battle("draft")).validate.available).toBe(true);
    expect(getBattleAdminCapabilities(battle("validated")).validate.available).toBe(true);
    expect(getBattleAdminCapabilities(battle("scheduled")).validate.available).toBe(false);
    expect(getBattleAdminCapabilities(battle("void")).validate.available).toBe(false);
  });

  it("11. publish requires validated status AND present, ordered times", () => {
    expect(getBattleAdminCapabilities(battle("draft"), ORDERED).publish).toMatchObject({ available: false, reason: /Validate the draft first/ });
    expect(getBattleAdminCapabilities(battle("validated")).publish).toMatchObject({ available: false, reason: /Add valid publication times/ });
    expect(getBattleAdminCapabilities(battle("validated"), { openAt: "2026-01-01T12:00", lockAt: "2026-01-01T11:00", revealAt: "2026-01-01T10:00" }).publish)
      .toMatchObject({ available: false, reason: /ordered/i });
    expect(getBattleAdminCapabilities(battle("validated"), ORDERED).publish.available).toBe(true);
    expect(getBattleAdminCapabilities(battle("scheduled"), ORDERED).publish).toMatchObject({ available: false, reason: /Already published/ });
    expect(getBattleAdminCapabilities(battle("void"), ORDERED).publish).toMatchObject({ available: false, reason: /Voided/ });
  });

  it("12. settle matches the backend settlement contract (revealed OR void)", () => {
    expect(getBattleAdminCapabilities(battle("scheduled", { effective_status: "revealed" })).settle.available).toBe(true);
    expect(getBattleAdminCapabilities(battle("void")).settle.available).toBe(true);
    for (const s of ["draft", "validated"] as BattleStatus[]) {
      expect(getBattleAdminCapabilities(battle(s)).settle.available).toBe(false);
    }
    expect(getBattleAdminCapabilities(battle("scheduled", { effective_status: "locked" })).settle).toMatchObject({ available: false, reason: /not been revealed/ });
  });

  it("13. void is available for non-void, non-settled events", () => {
    for (const s of ["draft", "validated"] as BattleStatus[]) {
      expect(getBattleAdminCapabilities(battle(s)).void.available).toBe(true);
    }
    // revealed-but-unsettled CAN be voided (backend allows it)
    expect(getBattleAdminCapabilities(battle("scheduled", { effective_status: "revealed" })).void.available).toBe(true);
    // already void
    expect(getBattleAdminCapabilities(battle("void")).void).toMatchObject({ available: false, reason: /already void/ });
  });

  it("14. void remains blocked after a completed settlement", () => {
    const c = getBattleAdminCapabilities(
      battle("scheduled", { effective_status: "revealed" }),
      { settlementStatus: "completed" },
    );
    expect(c.void).toMatchObject({ available: false, reason: /already been settled/ });
    // pending settlement does NOT block void
    expect(getBattleAdminCapabilities(battle("scheduled", { effective_status: "revealed" }), { settlementStatus: "pending" }).void.available).toBe(true);
  });

  it("15. every unavailable capability exposes non-empty reason text", () => {
    const samples = [battle("draft"), battle("validated"), battle("scheduled", { effective_status: "revealed" }), battle("void")];
    for (const b of samples) {
      const caps = getBattleAdminCapabilities(b);
      for (const cap of Object.values(caps)) {
        if (!cap.available) expect(cap.reason && cap.reason.length).toBeTruthy();
      }
    }
  });

  it("edit matches backend editable states", () => {
    expect(getBattleAdminCapabilities(battle("draft")).edit.available).toBe(true);
    expect(getBattleAdminCapabilities(battle("scheduled")).edit).toMatchObject({ available: false, reason: /cannot be edited/ });
  });
});
