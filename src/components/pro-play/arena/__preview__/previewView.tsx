/**
 * PPQ2-C — the arena view the isolated preview mounts. DEV ONLY.
 *
 * It feeds the REAL frozen Pro Play payloads (`PRO_PLAY_SAMPLES`) into the
 * production `CanonicalArena` through the PPQ2-A question member, with the
 * PPQ2-C pieces in the two panel flanks and — when the proposed
 * `regions` seam is present in the host (see docs/handoffs/PPQ2-C.md
 * §Integration request) — in the stage's media and answer regions.
 *
 * WHAT IS SYNTHETIC, AND SAYS SO
 *  - session score and earlier outcomes (the fixtures are single questions);
 *  - `names=long` / `prompt=long` stress labels, derived from the fixture by
 *    replacing labels on BOTH the options and their subjects, so the tablets
 *    stay aligned and symmetric exactly as a real payload would be.
 * The reveal states use the fixture's own `result.correct_answer`, which is
 * what a graded server response carries.
 */
import type { ReactNode } from "react";

import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import type { ProPlayQuestion } from "@/lib/pro-play/api";
import { asQuestionContext, type ProPlayQuestionContext } from "@/lib/pro-play/contract";
import type { ArenaViewModel } from "@/lib/ranked-core/arenaView";
import { projectRoundTimeline } from "@/lib/ranked-core/roundTimeline";
import {
  NO_INTERACTIONS,
  type AnswerOptionView,
  type ResultKind,
} from "@/lib/ranked-core/viewTypes";
import ProPlayAnchorPlate from "../ProPlayAnchorPlate";
import { proPlayAnswerSlots } from "../ProPlayOptionContent";
import ProPlayQuestionDossier from "../ProPlayQuestionDossier";
import ProPlaySessionPanel from "../ProPlaySessionPanel";
import type { ProPlayOutcome } from "../proPlayArenaModel";

export type PreviewState = "pre" | "selected" | "correct" | "wrong";

export interface PreviewParams {
  fixture: string;
  state: PreviewState;
  names: "real" | "long";
  prompt: "real" | "long";
  rails: "panel" | "none";
  /** "seam" puts the PPQ2-C plate/tablets in the stage (needs the seam). */
  stage: "seam" | "default";
}

export const FIXTURE_KEYS = Object.keys(PRO_PLAY_SAMPLES);

const LONG_LABELS: Record<string, string[]> = {
  champion: ["Nunu & Willump", "Aurelion Sol", "Twisted Fate", "Jarvan IV"],
  player: ["Wunderwaffe-Academy", "Shadowstrike Kim", "Xx_LongHandle_xX", "Kingen-Seo-Jin"],
  team: ["Hanwha Life Esports Challengers", "Rogue Warriors Shanghai", "Nongshim RedForce Academy", "Dplus KIA Challengers"],
};
const LONG_ANCHOR: Record<string, string> = {
  champion: "Nunu & Willump",
  player: "Wunderwaffe-Academy",
  team: "Nongshim RedForce Academy Esports",
};
const LONG_STEM =
  "In Esports World Cup 2026 Online Qualifier: EMEA (Esports World Cup, patch 26.09), "
  + "which of these synthetic stress-test options had the higher pick count overall?";

function stress(question: ProPlayQuestion, ctx: ProPlayQuestionContext | null, p: PreviewParams) {
  let choices = [...question.choices];
  let context = ctx;
  if (p.names === "long" && ctx) {
    const kind = ctx.subjects[0]?.kind ?? "player";
    const pool = LONG_LABELS[kind] ?? LONG_LABELS.player;
    const relabel = new Map(choices.map((c, i) => [c, pool[i % pool.length]]));
    choices = choices.map((c) => relabel.get(c) ?? c);
    context = {
      ...ctx,
      subjects: ctx.subjects.map((s) => ({
        ...s,
        label: relabel.get(s.label) ?? s.label,
        // Long names keep their real media key when it exists in the pool.
        media: s.kind === "champion" ? { kind: "champion", key: relabel.get(s.label) ?? s.label } : s.media,
      })),
      anchor: ctx.anchor && LONG_ANCHOR[ctx.anchor.kind]
        ? {
          ...ctx.anchor,
          label: LONG_ANCHOR[ctx.anchor.kind],
          media: ctx.anchor.kind === "champion" ? { kind: "champion", key: "Nunu & Willump" } : ctx.anchor.media,
        }
        : ctx.anchor,
    };
  }
  return {
    choices,
    context,
    prompt: p.prompt === "long" ? LONG_STEM : question.question_text,
    relabel: (label: string) => (p.names === "long"
      ? choices[question.choices.indexOf(label)] ?? label
      : label),
  };
}

function syntheticOutcomes(current: number): Map<number, ProPlayOutcome> {
  const m = new Map<number, ProPlayOutcome>();
  for (let n = 1; n < current; n += 1) m.set(n, n % 3 === 2 ? "incorrect" : "correct");
  return m;
}

export function previewView(
  p: PreviewParams,
  handlers: { selectedOptionId: string | null; onSelectOption: (o: AnswerOptionView) => void },
): { view: ArenaViewModel; note: string } {
  const sample = PRO_PLAY_SAMPLES[p.fixture] ?? PRO_PLAY_SAMPLES.champion_player;
  const q = sample.question;
  const baseContext = asQuestionContext(q.context);
  const { choices, context, prompt, relabel } = stress(q, baseContext, p);

  const options: AnswerOptionView[] = choices.map((label, index) => ({ id: String(index), index, label }));
  const correctLabel = relabel(sample.result.correct_answer);
  const correctId = String(choices.indexOf(correctLabel));
  const wrongId = options.find((o) => o.id !== correctId)?.id ?? "0";

  const graded = p.state === "correct" || p.state === "wrong";
  const selectedOptionId = p.state === "pre" ? handlers.selectedOptionId
    : p.state === "wrong" ? wrongId : correctId;
  const permissions = p.state === "pre" && handlers.selectedOptionId === null
    ? { ...NO_INTERACTIONS, canSelectAnswer: true }
    : NO_INTERACTIONS;

  const outcomes = syntheticOutcomes(q.number);
  if (graded) outcomes.set(q.number, p.state === "correct" ? "correct" : "incorrect");
  const answered = graded ? q.number : q.number - 1;
  const score = [...outcomes.values()].filter((o) => o === "correct").length;

  const slots = proPlayAnswerSlots({ options, context, revealed: graded });
  const panel = (node: ReactNode) => ({ kind: "panel" as const, node: p.rails === "panel" ? node : null });

  const surface = {
    kind: "question" as const,
    question: { questionId: `${q.question_id}-${p.names}-${p.prompt}`, prompt, options, category: q.topic },
    selectedOptionId,
    permissions,
    onSelectOption: handlers.onSelectOption,
    reveal: graded
      ? { revealed: true, isCorrect: p.state === "correct", correctOptionId: correctId, explanation: null }
      : null,
    inputOpen: permissions.canSelectAnswer,
    // PPQ2-C proposed seam (docs/handoffs/PPQ2-C.md). An unpatched host
    // ignores this field and renders its default band and grid.
    regions: p.stage === "seam"
      ? {
        media: <ProPlayAnchorPlate context={context} fallbackTitle={q.topic} />,
        optionContent: slots.optionContent,
        answerColumns: slots.columns,
        pairDivider: slots.pairDivider,
      }
      : null,
  };

  const view: ArenaViewModel = {
    header: {
      eyebrow: "Pro Play Quiz",
      title: `Question ${q.number} / ${q.total}`,
      transitionNote: null,
      playtestNote: null,
      presenceNote: null,
      timer: null,
      timerLabel: "",
    },
    roundBeat: null,
    segmentBeat: null,
    cardBeat: null,
    left: panel(<ProPlayQuestionDossier context={context} topic={q.topic} />),
    right: panel(
      <ProPlaySessionPanel number={q.number} total={q.total} score={score} answered={answered} outcomes={outcomes} />,
    ),
    surface,
    abilityHud: null,
    status: null,
    hudAction: null,
    timeline: projectRoundTimeline({
      roundNumber: q.number,
      completedRounds: answered,
      segmentRoundNumber: q.number,
      settlements: [],
      viewerSlot: "p1",
      totalRounds: q.total,
      outcomes: new Map<number, ResultKind>(outcomes),
    }),
    revealHold: false,
    progressionEnabled: false,
  };
  return {
    view,
    note: `${p.fixture} · ${p.state} · names=${p.names} · prompt=${p.prompt} · synthetic session score`,
  };
}

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;

export function readPreviewParams(search: string): PreviewParams {
  const q = new URLSearchParams(search);
  return {
    fixture: pick(q.get("fixture"), FIXTURE_KEYS, "champion_player"),
    state: pick(q.get("state"), ["pre", "selected", "correct", "wrong"] as const, "pre"),
    names: pick(q.get("names"), ["real", "long"] as const, "real"),
    prompt: pick(q.get("prompt"), ["real", "long"] as const, "real"),
    rails: pick(q.get("rails"), ["panel", "none"] as const, "panel"),
    stage: pick(q.get("stage"), ["seam", "default"] as const, "seam"),
  };
}
