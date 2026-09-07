/**
 * CON1 Step 2 — the Admin content-readiness preflight.
 *
 * The claim under test is not "these five labels exist". It is that each
 * verdict AGREES with the module that owns the decision, on the same input the
 * runner uses — so that Admin cannot start telling a different story from the
 * Content Factory. Every case below therefore asserts the preflight's answer
 * against the authority's own answer, not against a restatement of it.
 */

import { describe, expect, it } from "vitest";
import {
  BLOCKING_READINESS_STATES,
  evaluateContentReadiness,
  summarizeReadiness,
  type ContentReadinessRow,
} from "./readiness";
import { adaptScreenshotQuestion } from "./adapt";
import { resolveScenarioPresentation } from "./presentation";
import { presentationIsIncomplete } from "./presentationGate";
import { assetIsUnresolved } from "@/lib/quiz/assetStatus";
import {
  ASSET_CASE_REPAIRED,
  ASSET_NOT_REQUIRED,
  ASSET_OPTIONAL_UNRESOLVED,
  ASSET_REQUIRED_RESOLVED,
  ASSET_REQUIRED_UNRESOLVED,
  ASSET_UNKNOWN,
  ASSET_WITHHELD,
  COMBAT_PRESENTATION,
  COOLDOWN_HASTE_PRESENTATION,
  EXACT_MINION_PRESENTATION,
  PRO_SCOPE_PRESENTATION,
} from "./presentationFixtures";
import type { AssetStatus } from "@/lib/quiz/assetStatus";

/**
 * The Step 1E asset fixtures are frozen `as const` literals (readonly arrays),
 * which is the right shape for a fixture and the wrong shape for the mutable
 * `AssetStatus` the API returns. A structural clone gives the real wire shape
 * without loosening either type.
 */
const wire = (fixture: unknown): AssetStatus =>
  JSON.parse(JSON.stringify(fixture)) as AssetStatus;

/** A plain, complete, text-only MCQ row as the review endpoint returns one. */
const PLAIN: ContentReadinessRow = {
  id: 41,
  question_key: "item_exact_stat:armor:highest",
  question_text: "Which item grants the most armor?",
  format: "multiple_choice",
  category: "items",
  choices: ["Sunfire Aegis", "Thornmail", "Dead Man's Plate"],
  correct_answer: { type: "exact", value: "Thornmail" },
  asset_status: wire(ASSET_NOT_REQUIRED),
  missing_asset: false,
};

const row = (over: Partial<ContentReadinessRow>): ContentReadinessRow => ({ ...PLAIN, ...over });

describe("ready", () => {
  it("a plain MCQ with no required asset is ready", () => {
    const r = evaluateContentReadiness(PLAIN);
    expect(r.state).toBe("ready");
    expect(r.blocking).toBe(false);
    expect(r.blockers).toEqual([]);
    expect(r.presentation).toBe("absent");
  });

  it("an absent presentation is never a failure", () => {
    // The contract working as designed — the Step 1D gate passes `absent`, and
    // so must the preflight.
    expect(evaluateContentReadiness(PLAIN).presentation).toBe("absent");
    expect(presentationIsIncomplete("absent")).toBe(false);
  });

  it("a scenario the production layout draws is ready", () => {
    const r = evaluateContentReadiness(
      row({
        presentation: COMBAT_PRESENTATION,
        category: "post_mitigation_damage",
        asset_status: wire(ASSET_REQUIRED_RESOLVED),
      }),
    );
    expect(r.presentation).toBe("family");
    expect(r.state).toBe("ready");
  });

  it("a cinematic band is ready — the counter-example that shaped the gate", () => {
    // `ability_cooldown_haste` has NO family layout and still renders a full
    // champion band. A preflight keyed on the family layout would have blocked
    // 601 publishable rows.
    const r = evaluateContentReadiness(
      row({ presentation: { ...COOLDOWN_HASTE_PRESENTATION }, category: "Champion Ability Cooldowns" }),
    );
    expect(r.presentation).toBe("cinematic");
    expect(r.blocking).toBe(false);
  });

  it("a withheld, optional-unresolved or case-repaired asset does not block", () => {
    for (const status of [ASSET_WITHHELD, ASSET_OPTIONAL_UNRESOLVED, ASSET_CASE_REPAIRED]) {
      const r = evaluateContentReadiness(row({ asset_status: wire(status) }));
      expect(r.blocking).toBe(false);
      expect(assetIsUnresolved(wire(status))).toBe(false);
    }
  });
});

describe("blocked — required asset unresolved", () => {
  const r = evaluateContentReadiness(
    row({ asset_status: wire(ASSET_REQUIRED_UNRESOLVED) }),
  );

  it("is blocking and named", () => {
    expect(r.state).toBe("asset-unresolved");
    expect(r.blocking).toBe(true);
    expect(r.blockers).toContain("asset-unresolved");
  });

  it("agrees with the gate's own predicate", () => {
    expect(assetIsUnresolved(wire(ASSET_REQUIRED_UNRESOLVED))).toBe(true);
  });

  it("quotes the backend's own reason rather than inventing one", () => {
    expect(r.detail).toContain((wire(ASSET_REQUIRED_UNRESOLVED)).reason);
  });
});

describe("blocked — presentation incomplete", () => {
  it("Minion XP exact_minion blocks while its band is unmerged upstream", () => {
    const r = evaluateContentReadiness(
      row({ presentation: EXACT_MINION_PRESENTATION, category: "minion_xp_level_breakpoint" }),
    );
    expect(r.state).toBe("presentation-incomplete");
    expect(r.blocking).toBe(true);
    // And it agrees with the Step 1D gate's predicate over the same status.
    expect(presentationIsIncomplete(r.presentation!)).toBe(true);
  });

  it("pro_champion_scope_comparison blocks — its premise reaches no pixel", () => {
    const r = evaluateContentReadiness(
      row({ presentation: { ...PRO_SCOPE_PRESENTATION }, category: "Pro Play" }),
    );
    expect(r.presentation).toBe("text-only");
    expect(r.blocking).toBe(true);
  });

  it("names no band component — the preflight knows nothing about MinionXpBand", () => {
    const r = evaluateContentReadiness(row({ presentation: EXACT_MINION_PRESENTATION }));
    expect(r.detail).not.toContain("MinionXpBand");
  });
});

describe("blocked — unsupported question", () => {
  it("rejects a non-multiple-choice format with the ADAPTER's own reason", () => {
    const bad = row({ format: "free_text" });
    const r = evaluateContentReadiness(bad);
    expect(r.state).toBe("unsupported");
    expect(r.blocking).toBe(true);
    // Not a paraphrase: the runner's adapter produced this string.
    expect(r.unsupportedReason).toBe(adaptScreenshotQuestion(bad));
  });

  it("rejects fewer than two choices", () => {
    expect(evaluateContentReadiness(row({ choices: ["Only one"] })).state).toBe("unsupported");
  });

  it("rejects an answer that is not among the choices", () => {
    const r = evaluateContentReadiness(
      row({ correct_answer: { type: "exact", value: "Randuin's Omen" } }),
    );
    expect(r.state).toBe("unsupported");
    expect(r.unsupportedReason).toContain("not among choices");
  });

  it("rejects a missing prompt", () => {
    expect(evaluateContentReadiness(row({ question_text: "  " })).state).toBe("unsupported");
  });

  it("does not attempt a presentation verdict for a row it cannot adapt", () => {
    expect(evaluateContentReadiness(row({ format: "free_text" })).presentation).toBeNull();
  });
});

describe("unknown", () => {
  it("a row with no computed asset_status is not evaluated, and not blocked", () => {
    const { asset_status: _drop, ...noStatus } = PLAIN;
    const r = evaluateContentReadiness(noStatus);
    expect(r.state).toBe("unknown");
    expect(r.blocking).toBe(false);
    expect(r.assetStatus).toBeNull();
  });

  it("`unknown` from the backend is a real evaluation, not a missing one", () => {
    // "No asset tree in this checkout" is an answer; it passes.
    const r = evaluateContentReadiness(row({ asset_status: wire(ASSET_UNKNOWN) }));
    expect(r.state).toBe("ready");
    expect(r.assetStatus).toBe("unknown");
  });
});

describe("the reviewer's flag stays a separate claim", () => {
  it("a reviewer flag on an otherwise-ready row does not block it", () => {
    const r = evaluateContentReadiness(
      row({ missing_asset: true, asset_status: wire(ASSET_REQUIRED_RESOLVED) }),
    );
    expect(r.state).toBe("ready");
    expect(r.blocking).toBe(false);
    expect(r.reviewerFlaggedMissingAsset).toBe(true);
  });

  it("a computed failure on an unflagged row still blocks", () => {
    const r = evaluateContentReadiness(
      row({ missing_asset: false, asset_status: wire(ASSET_REQUIRED_UNRESOLVED) }),
    );
    expect(r.blocking).toBe(true);
    expect(r.reviewerFlaggedMissingAsset).toBe(false);
  });

  it("is never one of the blocking states", () => {
    expect(BLOCKING_READINESS_STATES).not.toContain("reviewer-flagged" as never);
    expect([...BLOCKING_READINESS_STATES].sort()).toEqual([
      "asset-unresolved",
      "presentation-incomplete",
      "unsupported",
    ]);
  });
});

describe("multiple blockers", () => {
  it("reports every blocker, not only the first", () => {
    const r = evaluateContentReadiness(
      row({
        presentation: EXACT_MINION_PRESENTATION,
        asset_status: wire(ASSET_REQUIRED_UNRESOLVED),
      }),
    );
    expect(r.blockers).toEqual(["asset-unresolved", "presentation-incomplete"]);
    expect(r.state).toBe("asset-unresolved");
  });
});

describe("determinism and parity with the production path", () => {
  it("is a pure function of the row", () => {
    const input = row({ presentation: COMBAT_PRESENTATION });
    expect(evaluateContentReadiness(input)).toEqual(evaluateContentReadiness({ ...input }));
  });

  it("its presentation verdict IS resolveScenarioPresentation's, for every fixture", () => {
    const presentations = [
      undefined,
      COMBAT_PRESENTATION,
      EXACT_MINION_PRESENTATION,
      { ...COOLDOWN_HASTE_PRESENTATION },
      { ...PRO_SCOPE_PRESENTATION },
    ];
    for (const presentation of presentations) {
      const r = row({ presentation });
      const adapted = adaptScreenshotQuestion(r);
      expect(typeof adapted).not.toBe("string");
      expect(evaluateContentReadiness(r).presentation).toBe(
        resolveScenarioPresentation(adapted as Exclude<typeof adapted, string>).status,
      );
    }
  });
});

describe("summarizeReadiness", () => {
  it("counts ready, blocked, unevaluated and reviewer-flagged independently", () => {
    const { asset_status: _drop, ...noStatus } = PLAIN;
    const results = [
      evaluateContentReadiness(PLAIN),
      evaluateContentReadiness(row({ asset_status: wire(ASSET_REQUIRED_UNRESOLVED) })),
      evaluateContentReadiness(noStatus),
      evaluateContentReadiness(row({ missing_asset: true })),
    ].map((r) => r);
    expect(summarizeReadiness(results)).toEqual({
      total: 4,
      ready: 2,
      blocked: 1,
      unevaluated: 1,
      reviewerFlagged: 1,
    });
  });
});
