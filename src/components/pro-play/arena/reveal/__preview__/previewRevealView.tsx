/**
 * PPQ2-D — the revealed arena view the isolated preview mounts. DEV ONLY.
 *
 * It starts from PPQ2-C's own preview view (the REAL frozen payloads through
 * the production `CanonicalArena`, PPQ2-C plate/tablets via the proposed
 * `regions` seam) in a graded state, then adds exactly what PPQ2-INT will:
 * `buildProPlayReveal` → `revealSlots` into `proPlayAnswerSlots`, and the
 * `ProPlayRevealFooter` (with a Next control) as the arena's `hudAction`.
 *
 * WHAT IS SYNTHETIC, AND SAYS SO
 *  - everything PPQ2-C's preview marks synthetic (session score, long names);
 *  - `grade=correct|wrong` re-grades the payload (`real` is the server's own
 *    grade, pick and verdict);
 *  - `evidence=partial` drops the evidence for option B; `absent` drops it all
 *    (an older backend);
 *  - `ids=plain` breaks one subject's label so PPQ2-C falls back to label-only
 *    tablets (the values then appear in the footer);
 *  - the Next button does nothing.
 * Evidence labels follow the preview's relabelling by option INDEX, so long
 * names keep each option's real server value.
 */
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { asEvidence, asQuestionContext, type ProPlayEvidence } from "@/lib/pro-play/contract";
import type { ArenaQuestionSurface, ArenaViewModel } from "@/lib/ranked-core/arenaView";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import { Button } from "@/components/ui/button";
import { proPlayAnswerSlots } from "../../ProPlayOptionContent";
import { previewView, readPreviewParams, type PreviewParams } from "../../__preview__/previewView";
import { ProPlayRevealFooter, buildProPlayReveal, revealValuesOnTablets } from "../index";

export interface RevealPreviewParams {
  base: PreviewParams;
  grade: "real" | "correct" | "wrong";
  evidence: "full" | "partial" | "absent";
  ids: "rich" | "plain";
}

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;

export function readRevealParams(search: string): RevealPreviewParams {
  const q = new URLSearchParams(search);
  const fixture = q.get("fixture") ?? "champion_player";
  const sample = PRO_PLAY_SAMPLES[fixture] ?? PRO_PLAY_SAMPLES.champion_player;
  const grade = pick(q.get("grade"), ["real", "correct", "wrong"] as const, "real");
  const correct = grade === "real" ? sample.result.is_correct : grade === "correct";
  const base = readPreviewParams(search);
  return {
    base: { ...base, state: correct ? "correct" : "wrong" },
    grade,
    evidence: pick(q.get("evidence"), ["full", "partial", "absent"] as const, "full"),
    ids: pick(q.get("ids"), ["rich", "plain"] as const, "rich"),
  };
}

export function previewRevealView(p: RevealPreviewParams): { view: ArenaViewModel; note: string } {
  const sample = PRO_PLAY_SAMPLES[p.base.fixture] ?? PRO_PLAY_SAMPLES.champion_player;
  const { view, note } = previewView(p.base, { selectedOptionId: null, onSelectOption: () => {} });
  const surface = view.surface as ArenaQuestionSurface & { regions?: Record<string, unknown> | null };
  const options: AnswerOptionView[] = surface.question.options;
  const choices = sample.question.choices;

  // The real server pick when showing the real grade.
  const selectedOptionId = p.grade === "real"
    ? String(choices.indexOf(sample.result.selected_answer))
    : surface.selectedOptionId;
  const correctOptionId = surface.reveal?.correctOptionId ?? null;

  // Evidence, relabelled by option index to follow the preview's labels.
  const raw = asEvidence(sample.result.evidence);
  let evidence: ProPlayEvidence | null = raw
    ? {
      ...raw,
      subjects: raw.subjects.map((s) => {
        const i = choices.indexOf(s.label);
        return i >= 0 ? { ...s, label: options[i].label } : s;
      }),
    }
    : null;
  if (evidence && p.evidence === "partial") {
    evidence = { ...evidence, subjects: evidence.subjects.filter((s) => s.label !== options[1].label) };
  }
  if (p.evidence === "absent") evidence = null;

  const reveal = buildProPlayReveal({
    options,
    reveal: {
      isCorrect: p.base.state === "correct",
      selectedOptionId,
      correctOptionId,
      explanation: sample.result.explanation,
      evidence,
    },
  })!;

  // PPQ2-C's context, as its preview built it (labels already relabelled on
  // the plate); `ids=plain` breaks one subject so the tablets fall back.
  let context = asQuestionContext(sample.question.context);
  if (context) {
    context = {
      ...context,
      subjects: context.subjects.map((s, i) => ({
        ...s,
        label: p.ids === "plain" && i === 0 ? `${options[i].label} (mismatch)` : options[i]?.label ?? s.label,
      })),
    };
  }
  const slots = proPlayAnswerSlots({ options, context, revealed: true, revealSlots: reveal.revealSlots });
  const regions = surface.regions
    ? { ...surface.regions, optionContent: slots.optionContent, answerColumns: slots.columns, pairDivider: slots.pairDivider }
    : surface.regions;

  const next = (
    <Button type="button" size="sm" data-pp-preview-next
      className="h-9 shrink-0 px-4 text-xs font-bold uppercase tracking-[0.12em]">
      Next
    </Button>
  );
  return {
    view: {
      ...view,
      surface: { ...surface, selectedOptionId, regions } as ArenaQuestionSurface,
      hudAction: (
        <ProPlayRevealFooter model={reveal.model}
          valuesOnTablets={revealValuesOnTablets(reveal, slots)} action={next} />
      ),
    },
    note: `${note} · reveal grade=${p.grade} evidence=${p.evidence} ids=${p.ids}`,
  };
}
