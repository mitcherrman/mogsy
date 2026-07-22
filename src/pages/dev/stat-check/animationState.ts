export type PresentationStep =
  | "selecting"
  | "placing-card"
  | "returning-card"
  | "locking"
  | "opponent-reveal-1"
  | "opponent-reveal-2"
  | "opponent-reveal-3"
  | "resolve-lane-1"
  | "resolve-lane-2"
  | "resolve-lane-3"
  | "board-result"
  | "damage"
  | "resolved"
  | "discarding"
  | "dealing"
  | "match-over";

export type AnimationEvent =
  | { type: "select" }
  | { type: "place" }
  | { type: "return" }
  | { type: "lock" }
  | { type: "opponent"; lane: 1 | 2 | 3 }
  | { type: "resolve"; lane: 1 | 2 | 3 }
  | { type: "board-result" }
  | { type: "damage" }
  | { type: "resolved" }
  | { type: "match-over" }
  | { type: "discard" }
  | { type: "deal" }
  | { type: "cancel" };

export function animationStepReducer(_step: PresentationStep, event: AnimationEvent): PresentationStep {
  switch (event.type) {
    case "select":
    case "cancel":
      return "selecting";
    case "place":
      return "placing-card";
    case "return":
      return "returning-card";
    case "lock":
      return "locking";
    case "opponent":
      return `opponent-reveal-${event.lane}` as PresentationStep;
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
  if (["resolve-lane-1", "resolve-lane-2", "resolve-lane-3", "board-result", "damage", "resolved", "discarding", "dealing", "match-over"].includes(step)) return 3;
  return 0;
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
    "resolve-lane-1",
    "resolve-lane-2",
    "resolve-lane-3",
    "board-result",
  ].includes(step);
}
