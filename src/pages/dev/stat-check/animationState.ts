export type PresentationStep =
  | "selecting"
  | "placement-pickup"
  | "placement-hold"
  | "placement-launch"
  | "placement-travel"
  | "placement-approach"
  | "placement-impact"
  | "placement-rebound"
  | "placement-settle"
  | "placement-accepted"
  | "returning-card"
  | "locking"
  | "opponent-reveal-1"
  | "opponent-reveal-2"
  | "opponent-reveal-3"
  | "item-reveal"
  | "resolve-lane-1"
  | "resolve-lane-2"
  | "resolve-lane-3"
  | "board-result"
  | "damage"
  | "resolved"
  | "discarding"
  | "dealing"
  | "match-over";

/**
 * Presentation stages a resolved lane's fixed-size plaque moves through. The
 * authoritative result is computed once by the engine; these stages only
 * decide which slice of that result the plaque is currently showing.
 */
export type LanePlaqueStage = "category" | "winner" | "threshold" | "bonus";

export const LANE_PLAQUE_STAGES = ["category", "winner", "threshold", "bonus"] as const satisfies readonly LanePlaqueStage[];

/** Every lane starts on its category face. */
export function initialLanePlaqueStages(): LanePlaqueStage[] {
  return ["category", "category", "category"];
}

export type AnimationEvent =
  | { type: "select" }
  | { type: "pickup" }
  | { type: "hold" }
  | { type: "launch" }
  | { type: "travel" }
  | { type: "approach" }
  | { type: "impact" }
  | { type: "rebound" }
  | { type: "settle" }
  | { type: "accept" }
  | { type: "return" }
  | { type: "lock" }
  | { type: "opponent"; lane: 1 | 2 | 3 }
  | { type: "item-reveal" }
  | { type: "resolve"; lane: 1 | 2 | 3 }
  | { type: "board-result" }
  | { type: "damage" }
  | { type: "resolved" }
  | { type: "match-over" }
  | { type: "discard" }
  | { type: "deal" }
  | { type: "cancel" };

/** Ordered hero-play phases; used by the page to schedule phase dispatches. */
export const PLACEMENT_PHASES = [
  "placement-pickup",
  "placement-hold",
  "placement-launch",
  "placement-travel",
  "placement-approach",
  "placement-impact",
  "placement-rebound",
  "placement-settle",
  "placement-accepted",
] as const satisfies readonly PresentationStep[];

export function animationStepReducer(_step: PresentationStep, event: AnimationEvent): PresentationStep {
  switch (event.type) {
    case "select":
    case "cancel":
      return "selecting";
    case "pickup":
      return "placement-pickup";
    case "hold":
      return "placement-hold";
    case "launch":
      return "placement-launch";
    case "travel":
      return "placement-travel";
    case "approach":
      return "placement-approach";
    case "impact":
      return "placement-impact";
    case "rebound":
      return "placement-rebound";
    case "settle":
      return "placement-settle";
    case "accept":
      return "placement-accepted";
    case "return":
      return "returning-card";
    case "lock":
      return "locking";
    case "opponent":
      return `opponent-reveal-${event.lane}` as PresentationStep;
    case "item-reveal":
      return "item-reveal";
    case "resolve":
      return `resolve-lane-${event.lane}` as PresentationStep;
    case "board-result":
      return "board-result";
    case "damage":
      return "damage";
    case "resolved":
      return "resolved";
    case "match-over":
      return "match-over";
    case "discard":
      return "discarding";
    case "deal":
      return "dealing";
    default:
      return _step;
  }
}

export function revealedOpponentCount(step: PresentationStep) {
  if (step === "opponent-reveal-1") return 1;
  if (step === "opponent-reveal-2") return 2;
  if (step === "opponent-reveal-3") return 3;
  if (["item-reveal", "resolve-lane-1", "resolve-lane-2", "resolve-lane-3", "board-result", "damage", "resolved", "discarding", "dealing", "match-over"].includes(step)) return 3;
  return 0;
}

/**
 * True once the reveal has reached (or passed) the item-reveal beat: equipped
 * items, their bonuses, and FINAL contest values may be shown. Before this,
 * only natural champion values are visible and the opponent's item stays
 * hidden. Rounds with no items skip the beat; every at-or-after step here
 * still reports true so the final values render.
 */
export function itemsRevealedAtStep(step: PresentationStep) {
  return [
    "item-reveal",
    "resolve-lane-1",
    "resolve-lane-2",
    "resolve-lane-3",
    "board-result",
    "damage",
    "resolved",
    "discarding",
    "dealing",
    "match-over",
  ].includes(step);
}

export function activeResolvedLane(step: PresentationStep) {
  if (step === "resolve-lane-1") return 0;
  if (step === "resolve-lane-2") return 1;
  if (step === "resolve-lane-3") return 2;
  return -1;
}

export function stepAfterLane(step: PresentationStep, laneIndex: number) {
  const active = activeResolvedLane(step);
  if (active >= 0) return active > laneIndex;
  return ["board-result", "damage", "resolved", "discarding", "dealing", "match-over"].includes(step);
}

export function stepBeforeDamage(step: PresentationStep) {
  return [
    "locking",
    "opponent-reveal-1",
    "opponent-reveal-2",
    "opponent-reveal-3",
    "item-reveal",
    "resolve-lane-1",
    "resolve-lane-2",
    "resolve-lane-3",
    "board-result",
  ].includes(step);
}

export function allowsPreLockInteraction(step: PresentationStep) {
  // The whole hero-play choreography stays interactive: the player can queue the
  // next placement while a previous card is still in flight. Only lock/reveal
  // phases block pre-lock editing.
  return (
    step === "selecting" ||
    step === "returning-card" ||
    (PLACEMENT_PHASES as readonly string[]).includes(step)
  );
}
