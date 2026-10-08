/**
 * PPQ2-A — the arena view the question-surface probe mounts.
 *
 * SYNTHETIC AND ANSWER-SAFE ON PURPOSE. Every string is visibly a probe
 * string, so nothing here can be mistaken for real content, and the one
 * "correct" option exists only in the two revealed states — which is exactly
 * when a real mode is allowed to know it.
 *
 * It exercises the solo arena path end to end with nothing Ranked in it: an
 * `ArenaQuestionSurface` (no public round), two `panel` flanks (no
 * combatants), no clock, no result beats, and the real `projectRoundTimeline`
 * fed a known plan length and mode-stated verdicts.
 */
import type { ReactNode } from "react";
import type { ArenaRail, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import {
  NO_INTERACTIONS,
  type AnswerOptionView,
  type InteractionPermissions,
  type QuestionView,
  type ResultKind,
} from "@/lib/ranked-core/viewTypes";

export type ProbeState = "pre" | "selected" | "revealed-correct" | "revealed-wrong";
export type ProbeRails = "panel" | "empty";

export interface QuestionProbeParams {
  state: ProbeState;
  /** 2, 3 or 4 options. */
  options: 2 | 3 | 4;
  /** "long" serves a 150-character prompt, the Pro Play scope-stem order. */
  prompt: "short" | "long";
  /** "long" serves 40-character option labels. */
  labels: "short" | "long";
  rails: ProbeRails;
}

export const DEFAULT_PROBE: QuestionProbeParams = {
  state: "pre", options: 4, prompt: "short", labels: "short", rails: "panel",
};

const PLAN = 10;
const CURRENT = 4;
/** The option the two revealed states name. Synthetic — no real answer exists. */
export const PROBE_REVEALED_OPTION = "1";

const SHORT_PROMPT = "Probe question: which synthetic option is this fixture's reference?";
// 150 characters: the longest Pro Play stem class (a scope stem that repeats
// its tournament label) seats in the prompt region or the page grows.
const LONG_PROMPT = (
  "Probe question with a long stem: in the Synthetic Probe Invitational Online "
  + "Qualifier (Probe Series, patch 00.00), which synthetic option is the reference?"
);

const LETTERS = ["A", "B", "C", "D"];

function optionLabel(i: number, labels: QuestionProbeParams["labels"]): string {
  return labels === "long"
    ? `Synthetic probe option ${LETTERS[i]} (long label)`
    : `Probe option ${LETTERS[i]}`;
}

export function probeQuestion(params: QuestionProbeParams): QuestionView {
  const options: AnswerOptionView[] = Array.from({ length: params.options }, (_, i) => ({
    id: String(i), index: i, label: optionLabel(i, params.labels),
  }));
  return {
    questionId: `probe-${params.options}-${params.prompt}-${params.labels}`,
    prompt: params.prompt === "long" ? LONG_PROMPT : SHORT_PROMPT,
    options,
    category: "Arena probe",
  };
}

function probePermissions(state: ProbeState): InteractionPermissions {
  return state === "pre"
    ? { ...NO_INTERACTIONS, canSelectAnswer: true }
    : NO_INTERACTIONS;
}

/** The questions before the current one, with probe verdicts the MODE states. */
function probeOutcomes(): Map<number, ResultKind> {
  return new Map<number, ResultKind>([[1, "correct"], [2, "incorrect"], [3, "correct"]]);
}

export function questionProbeView(
  params: QuestionProbeParams,
  handlers: {
    selectedOptionId?: string | null;
    onSelectOption?: (option: AnswerOptionView) => void;
    leftPanel?: ReactNode;
    rightPanel?: ReactNode;
  } = {},
): ArenaViewModel {
  const revealed = params.state === "revealed-correct" || params.state === "revealed-wrong";
  const selectedOptionId = handlers.selectedOptionId !== undefined
    ? handlers.selectedOptionId
    : params.state === "pre" ? null
      : params.state === "revealed-wrong" ? "0" : PROBE_REVEALED_OPTION;
  const panel = (node: ReactNode): ArenaRail => ({
    kind: "panel",
    node: params.rails === "panel" ? node : null,
  });
  return {
    header: {
      eyebrow: "Arena question probe",
      title: `Question ${CURRENT} / ${PLAN}`,
      transitionNote: null,
      playtestNote: null,
      presenceNote: null,
      timer: null,
      timerLabel: "",
    },
    roundBeat: null,
    segmentBeat: null,
    cardBeat: null,
    left: panel(handlers.leftPanel ?? null),
    right: panel(handlers.rightPanel ?? null),
    surface: {
      kind: "question",
      question: probeQuestion(params),
      selectedOptionId,
      permissions: probePermissions(params.state),
      onSelectOption: handlers.onSelectOption ?? (() => {}),
      // Post-grading only: null in `pre` and `selected`, always.
      reveal: revealed
        ? {
          revealed: true,
          isCorrect: params.state === "revealed-correct",
          correctOptionId: PROBE_REVEALED_OPTION,
          explanation: null,
        }
        : null,
      inputOpen: params.state === "pre",
    },
    abilityHud: null,
    status: null,
    hudAction: null,
    timeline: projectRoundTimeline({
      roundNumber: CURRENT,
      completedRounds: CURRENT - 1,
      segmentRoundNumber: CURRENT,
      settlements: [],
      viewerSlot: "p1",
      totalRounds: PLAN,
      outcomes: probeOutcomes(),
    }),
    revealHold: false,
    progressionEnabled: false,
  };
}

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

export function readProbeParams(search: string): QuestionProbeParams {
  const p = new URLSearchParams(search);
  const options = Number(p.get("opts"));
  return {
    state: pick(p.get("state"), ["pre", "selected", "revealed-correct", "revealed-wrong"] as const, "pre"),
    options: options === 2 || options === 3 ? options : 4,
    prompt: pick(p.get("prompt"), ["short", "long"] as const, "short"),
    labels: pick(p.get("labels"), ["short", "long"] as const, "short"),
    rails: pick(p.get("rails"), ["panel", "empty"] as const, "panel"),
  };
}
