/**
 * UX-1 — objective encounter definitions (SYNTHETIC outcome tables).
 *
 * Qualitative mapping follows the owner-approved Baron ladder (master plan §21):
 * 3 = Baron + ace (+ game win only when a closeout was legally offered),
 * 2 = Baron + trades + Late edge, 1 = Baron + heavy losses (mixed),
 * 0 = enemy Baron + wipe + Late disadvantage. All magnitudes are placeholders.
 */

export type EffectScope = "stage" | "next_stage" | "later";
export type EffectKind = "lane" | "team" | "lead" | "confidence" | "fatigue" | "cohesion" | "trait";
export interface Effect {
  scope: EffectScope;
  kind: EffectKind;
  /** Role for `lane`; 'all' | 'one' | player id for confidence/fatigue/trait. */
  target?: string;
  amount: number;
  label: string;
}

export type ObjectiveKind = "baron" | "dragon" | "elder";

export interface ObjectiveDef {
  kind: ObjectiveKind;
  title: string;
  /** When in the stage flow it is offered. */
  timing: "pre-score" | "post-stage";
  stage: "early" | "mid" | "late";
  questions: 1 | 3;
  /** Short explanation of why it is on offer, with its legal reach. */
  intro: string;
}

export const OBJECTIVES: Record<ObjectiveKind, ObjectiveDef> = {
  dragon: {
    kind: "dragon", title: "Dragon", timing: "pre-score", stage: "early", questions: 1,
    intro: "Early Dragon fight. Affects this stage and what follows. It never ends the game.",
  },
  baron: {
    kind: "baron", title: "Baron Nashor", timing: "post-stage", stage: "mid", questions: 3,
    intro: "Mid Baron window. Decides the advantage you carry into Late.",
  },
  elder: {
    kind: "elder", title: "Elder Dragon", timing: "pre-score", stage: "late", questions: 3,
    intro: "Late Elder fight in a tight game. Shapes the final stage. Late still decides by seven points.",
  },
};

export interface ObjectiveOutcome {
  kind: ObjectiveKind;
  correct: number;
  total: number;
  tier: string;
  title: string;
  summary: string;
  effects: Effect[];
  /** True only for Baron 3/3 when a closeout opportunity was offered. */
  closeout: boolean;
  tone: "great" | "good" | "mixed" | "bad";
}

export interface LadderRow { correct: number; tier: string; summary: string }

export function ladderFor(kind: ObjectiveKind, closeoutOffered: boolean): LadderRow[] {
  const rows: Record<ObjectiveKind, [string, string][]> = {
    baron: [
      ["Enemy Baron", "Your team is wiped. Significant disadvantage entering Late."],
      ["Costly Baron", "Baron secured but most allies fall. Mixed edge and cost."],
      ["Baron with trades", "Baron and favourable trades. Clear edge entering Late."],
      [closeoutOffered ? "Baron, ace, push" : "Baron and ace", closeoutOffered ? "The base falls. The game ends here." : "Strong edge entering Late. No instant win here."],
    ],
    dragon: [
      ["Enemy Dragon", "They take it. A small setback this stage."],
      ["Dragon secured", "A team boost this stage and a small edge in Mid."],
      ["Dragon secured", "A team boost this stage and a small edge in Mid."],
      ["Dragon secured", "A team boost this stage and a small edge in Mid."],
    ],
    elder: [
      ["Elder lost", "A heavy swing against you in the final stage."],
      ["Elder, costly", "A small edge but your team is spent."],
      ["Elder, clean", "A solid edge in the final stage."],
      ["Elder, decisive", "A large edge. The seven-point Late stage still decides."],
    ],
  };
  const all = rows[kind];
  if (kind === "dragon") return [{ correct: 0, tier: all[0][0], summary: all[0][1] }, { correct: 1, tier: all[1][0], summary: all[1][1] }];
  return all.map(([tier, summary], correct) => ({ correct, tier, summary }));
}

export function objectiveOutcome(kind: ObjectiveKind, correctRaw: number, opts: { closeoutOffered?: boolean } = {}): ObjectiveOutcome {
  const total = OBJECTIVES[kind].questions;
  const correct = Math.max(0, Math.min(total, Math.floor(correctRaw)));
  const base = { kind, correct, total, closeout: false };
  if (kind === "dragon") {
    return correct >= 1
      ? { ...base, tier: "Dragon secured", title: "Dragon secured", tone: "good",
          summary: "Your team takes the Dragon and the early tempo.",
          effects: [
            { scope: "stage", kind: "team", amount: 0.8, label: "Team this stage" },
            { scope: "next_stage", kind: "lead", amount: 1, label: "Advantage into Mid" },
          ] }
      : { ...base, tier: "Enemy Dragon", title: "Enemy Dragon", tone: "bad",
          summary: "They take the Dragon; you give ground this stage.",
          effects: [{ scope: "stage", kind: "team", amount: -0.5, label: "Team this stage" }] };
  }
  if (kind === "baron") {
    if (correct === 3) {
      const closeout = !!opts.closeoutOffered;
      return { ...base, closeout, tier: closeout ? "Baron, ace, push" : "Baron and ace", title: closeout ? "Game won at Mid" : "Baron and ace", tone: "great",
        summary: closeout ? "Baron, an ace, and the push ends the game." : "Baron and an ace: a large edge into Late.",
        effects: closeout ? [] : [{ scope: "next_stage", kind: "lead", amount: 3, label: "Advantage into Late" }] };
    }
    if (correct === 2) {
      return { ...base, tier: "Baron with trades", title: "Baron with trades", tone: "good",
        summary: "Baron secured with several trades. A clear edge into Late.",
        effects: [
          { scope: "next_stage", kind: "lead", amount: 2, label: "Advantage into Late" },
          { scope: "later", kind: "cohesion", amount: 1, label: "Cohesion" },
        ] };
    }
    if (correct === 1) {
      return { ...base, tier: "Costly Baron", title: "Costly Baron", tone: "mixed",
        summary: "Baron secured but most allies fall. A mixed picture entering Late.",
        effects: [
          { scope: "next_stage", kind: "lead", amount: 1, label: "Advantage into Late" },
          { scope: "later", kind: "fatigue", target: "all", amount: 1, label: "Fatigue, all starters" },
          { scope: "later", kind: "confidence", target: "one", amount: -1, label: "Confidence, one starter" },
        ] };
    }
    return { ...base, tier: "Enemy Baron", title: "Enemy Baron", tone: "bad",
      summary: "They take Baron and wipe your team. Comeback paths remain.",
      effects: [
        { scope: "next_stage", kind: "lead", amount: -2, label: "Disadvantage into Late" },
        { scope: "later", kind: "confidence", target: "all", amount: -1, label: "Confidence, all starters" },
        { scope: "later", kind: "fatigue", target: "all", amount: 1, label: "Fatigue, all starters" },
      ] };
  }
  // elder: never a closeout (Late finality).
  if (correct === 3) return { ...base, tier: "Elder, decisive", title: "Elder, decisive", tone: "great", summary: "A decisive Elder fight. Large edge in the final stage.", effects: [{ scope: "stage", kind: "team", amount: 1.6, label: "Team this stage" }] };
  if (correct === 2) return { ...base, tier: "Elder, clean", title: "Elder, clean", tone: "good", summary: "Elder secured cleanly. A solid edge in the final stage.", effects: [{ scope: "stage", kind: "team", amount: 0.9, label: "Team this stage" }] };
  if (correct === 1) return { ...base, tier: "Elder, costly", title: "Elder, costly", tone: "mixed", summary: "Elder falls but your team is spent.", effects: [{ scope: "stage", kind: "team", amount: 0.4, label: "Team this stage" }, { scope: "later", kind: "fatigue", target: "all", amount: 1, label: "Fatigue, all starters" }] };
  return { ...base, tier: "Elder lost", title: "Elder lost", tone: "bad", summary: "They take Elder and swing the final stage.", effects: [{ scope: "stage", kind: "team", amount: -1.3, label: "Team this stage" }, { scope: "later", kind: "confidence", target: "all", amount: -1, label: "Confidence, all starters" }] };
}
