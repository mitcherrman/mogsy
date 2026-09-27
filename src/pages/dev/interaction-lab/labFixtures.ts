/**
 * MIG1.1 — the Interaction Lab's four fixtures, ADAPTED FROM EXISTING
 * AUTHORITY CAPTURES. No fact in this file is hand-written.
 *
 *   Data Duel · Pro Play     T1 vs KT Rolster, LCK games on Gragas
 *                            ← `PRO_PLAY_SAMPLES.t1_lineage` (generated against the
 *                              live Pro Play authority; see proPlaySamples.ts)
 *   Data Duel · Leaguecraft  Leona R vs Pantheon R cooldown at rank 1
 *                            ← J3 capture `pantheon.standard`, child 3 (a real
 *                              `comparison_left_right` Journey child + its reveal)
 *   Stat Drop · Pro Play     Peanut's pro games on Sejuani
 *                            ← `PRO_PLAY_SAMPLES.pro_play` (captured from
 *                              production `/api/pro-play/quiz/*`)
 *   Stat Drop · Leaguecraft  Olaf Undertow cooldown at 10 ability haste
 *                            ← J4 capture `olaf.standard`, child 2 (a real
 *                              `numeric` Journey child + its reveal)
 *
 * No trustworthy Faker fixture exists in the repo (the Faker row in
 * ProStatsExplorer.test.tsx is a hand-written mock), so the Pro Play slots use
 * T1 and Peanut from real authority payloads instead of inventing numbers.
 *
 * WHAT THE LAB ADDS, AND WHY IT IS NOT A SECOND AUTHORITY
 *   * The T1/KT duel is a PAIRWISE PROJECTION of the authority's four-team
 *     ranking: same metric, same scope, the authority's own two values. The
 *     side with the larger value is the canonical side. That one comparison is
 *     the lab's local stand-in for grading (MIG1.0 §11.3) and is lab-scoped.
 *   * The Leona/Pantheon deciding values are read out of the authority's own
 *     explanation sentence, fail-closed: the backend publishes no structured
 *     per-side values for a comparison child today (a MIG1.3/1.4 gap).
 *   * The Stat Drop SCALES (min/max) are lab presentation, chosen per metric
 *     family without reference to the answer. Step and decimals come from the
 *     authority's `input_constraints` where it publishes them.
 *
 * THE SPLIT. Each fixture is `{ content, hidden }`. `content` is the public
 * projection the primitive may see from the first frame; `hidden` is held by
 * the lab controller and handed to the primitive only after lock + suspense.
 */
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import { formatComparisonPrompt } from "@/features/mastery/interactions/formatComparisonSemantics";
import { formatRecallPrompt } from "@/features/mastery/interactions/formatPromptSemantics";
import type {
  DataDuelPublic, DataDuelReveal, StatDropPublic, StatDropReveal,
} from "@/lib/interaction-grammar/types";

export type LabMechanic = "data-duel" | "stat-drop";
export type LabDomain = "pro-play" | "leaguecraft";

interface FixtureBase {
  id: string;
  domain: LabDomain;
  /** Pre-reveal-safe provenance line for the lab rail. */
  provenance: string;
}
export interface DuelFixture extends FixtureBase {
  mechanic: "data-duel";
  content: DataDuelPublic;
  hidden: DataDuelReveal;
}
export interface DropFixture extends FixtureBase {
  mechanic: "stat-drop";
  content: StatDropPublic;
  hidden: StatDropReveal;
}
export type LabFixture = DuelFixture | DropFixture;

// ----------------------------------------------------------------- helpers

type Rec = Record<string, unknown>;
const rec = (v: unknown, what: string): Rec => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`lab fixture: ${what} is not an object`);
  return v as Rec;
};
const arr = (v: unknown, what: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`lab fixture: ${what} is not an array`);
  return v;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`lab fixture: ${what} is not a string`);
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`lab fixture: ${what} is not a number`);
  return v;
};

// Journey captures, eagerly — the lab chunk is DEV-only (see featureGate), so
// no production chunk carries them. Same files `realFixtures.ts` loads lazily.
const CAPTURES = import.meta.glob<unknown>(
  ["/src/lib/journey/__fixtures__/j3/pantheon.standard.json", "/src/lib/journey/__fixtures__/j4/olaf.standard.json"],
  { eager: true, import: "default" },
);

function snapshot(file: string, label: string): Rec {
  const snaps = arr(CAPTURES[file], file);
  const snap = snaps.map((s) => rec(s, file)).find((s) => s.label === label);
  if (!snap) throw new Error(`lab fixture: ${file} has no ${label}`);
  return rec(rec(snap.envelope, `${label}.envelope`).payload, `${label}.payload`);
}

/** The frozen challenge (question side) at `index` of a Journey capture. */
function journeyChallenge(file: string, label: string, index: number): Rec {
  const seg = rec(snapshot(file, label).segment_state, "segment_state");
  const list = arr(rec(seg.challenges, "challenges").challenges, "challenges.challenges");
  const ch = list.map((c) => rec(c, "challenge")).find((c) => c.challenge_index === index);
  if (!ch) throw new Error(`lab fixture: ${file}@${label} has no challenge ${index}`);
  return ch;
}

/** The authority's reveal for challenge `index`, from a reveal snapshot. */
function journeyReveal(file: string, label: string, index: number): Rec {
  const seg = rec(snapshot(file, label).segment_state, "segment_state");
  const list = arr(seg.own_challenge_reveals, "own_challenge_reveals");
  const r = list.map((c) => rec(c, "reveal")).find((c) => c.challenge_index === index);
  if (!r) throw new Error(`lab fixture: ${file}@${label} has no reveal ${index}`);
  return r;
}

/**
 * One side's deciding value out of the authority's comparison explanation
 * ("Leona R (Solar Flare) at rank 1: 90 seconds. Pantheon R …"). Fail-closed:
 * a sentence that does not parse throws rather than drawing a guess.
 */
export function sideValueFromExplanation(explanation: string, championDisplay: string): { value: number; unit: string } {
  const sentence = explanation.split(/(?<=\.)\s+/).find((s) => s.startsWith(`${championDisplay} `));
  const m = sentence?.match(/:\s*(\d+(?:\.\d+)?)\s+([a-z]+)\.?$/i);
  if (!m) throw new Error(`lab fixture: no value for ${championDisplay} in "${explanation}"`);
  return { value: Number(m[1]), unit: m[2] };
}

const shortUnit = (unit: string) => (unit === "seconds" ? "s" : ` ${unit}`);

// ------------------------------------------------------------- Data Duel ·

function proPlayDuel(): DuelFixture {
  const sample = rec(PRO_PLAY_SAMPLES.t1_lineage, "t1_lineage");
  const question = rec(sample.question, "question");
  const ctx = rec(question.context, "context");
  const result = rec(sample.result, "result");
  const evidence = rec(result.evidence, "evidence");
  const authority = rec(evidence.authority, "evidence.authority");
  const champion = str(rec(ctx.anchor, "anchor").label, "anchor.label");
  const league = str(rec(arr(ctx.scope_tags, "scope_tags")[0], "scope_tag").label, "scope_tag.label");
  const scopeLabel = str(evidence.scope_label, "evidence.scope_label");
  const subjects = arr(ctx.subjects, "subjects").map((s) => rec(s, "subject"));
  const values = arr(evidence.subjects, "evidence.subjects").map((s) => rec(s, "evidence.subject"));
  const pick = (label: string) => {
    const subject = subjects.find((s) => s.label === label);
    const row = values.find((s) => s.label === label);
    if (!subject || !row) throw new Error(`lab fixture: t1_lineage has no ${label}`);
    const seasons = (subject.seasons as Rec | undefined)?.label;
    return {
      token: str(subject.id, `${label}.id`),
      label,
      short: str(subject.short, `${label}.short`),
      seasons: typeof seasons === "string" ? `Seasons ${seasons}` : null,
      games: num(row.games, `${label}.games`),
      display: str(row.display, `${label}.display`),
    };
  };
  const a = pick("T1");
  const b = pick("KT Rolster");
  if (a.games === b.games) throw new Error("lab fixture: T1/KT tie cannot be a two-sided duel");
  const winner = a.games > b.games ? a : b;
  return {
    id: "duel.pro-play.t1-kt-gragas",
    mechanic: "data-duel",
    domain: "pro-play",
    provenance: "Pro Play authority · t1_lineage sample · pairwise projection of a 4-team ranking",
    content: {
      prompt: `In ${league}, which team has more games played on ${champion}: ${a.label} or ${b.label}?`,
      metricLabel: `Games on ${champion}`,
      context: `${league} · All time`,
      left: { token: a.token, label: a.label, sublabel: a.seasons, monogram: a.short },
      right: { token: b.token, label: b.label, sublabel: b.seasons, monogram: b.short },
    },
    hidden: {
      canonicalToken: winner.token,
      values: { [a.token]: a.display, [b.token]: b.display },
      evidence: `${scopeLabel}: ${a.label} ${a.display} games, ${b.label} ${b.display} games.`,
      source: `Pro Play authority · ${str(authority.metric_definition_version, "metric_definition_version")} · ${
        str(authority.policy_version, "policy_version")}`,
    },
  };
}

function leaguecraftDuel(): DuelFixture {
  const FILE = "/src/lib/journey/__fixtures__/j3/pantheon.standard.json";
  const ch = journeyChallenge(FILE, "child3-open", 3);
  const reveal = journeyReveal(FILE, "child3-reveal", 3);
  if (ch.interaction_kind !== "comparison_left_right") throw new Error("lab fixture: not a comparison child");
  const cs = readComparisonSemantics(ch.comparison_semantics);
  const subject = rec(rec(rec(ch.presentation, "presentation").assets, "assets").subject, "assets.subject");
  const [tokenA, tokenB] = arr(ch.answer_options, "answer_options").map((o, i) => str(o, `answer_options[${i}]`));
  const explanation = str(reveal.explanation, "reveal.explanation");
  const va = sideValueFromExplanation(explanation, cs.championADisplay);
  const vb = sideValueFromExplanation(explanation, cs.championBDisplay);
  const slot = cs.subjectRef;
  return {
    id: "duel.leaguecraft.leona-pantheon-r",
    mechanic: "data-duel",
    domain: "leaguecraft",
    provenance: "Mastery Journey capture · J3 pantheon.standard · child 3",
    content: {
      prompt: formatComparisonPrompt(cs),
      metricLabel: str(subject.metric_label, "metric_label"),
      context: str(ch.patch_display, "patch_display"),
      left: {
        token: tokenA, label: cs.championADisplay, sublabel: `${slot} · ${cs.abilityNameA}`,
        media: { src: resolveAssetUrl(str(subject.champion_a_splash, "champion_a_splash")), alt: "" },
      },
      right: {
        token: tokenB, label: cs.championBDisplay, sublabel: `${slot} · ${cs.abilityNameB}`,
        media: { src: resolveAssetUrl(str(subject.champion_b_splash, "champion_b_splash")), alt: "" },
      },
    },
    hidden: {
      canonicalToken: str(reveal.correct_answer, "reveal.correct_answer"),
      values: {
        [tokenA]: `${va.value}${shortUnit(va.unit)}`,
        [tokenB]: `${vb.value}${shortUnit(vb.unit)}`,
      },
      evidence: explanation,
      source: `Mogzy champion data · ${str(ch.patch_display, "patch_display")}`,
    },
  };
}

// ------------------------------------------------------------- Stat Drop ·

/**
 * Lab-authored scales, per metric family, chosen WITHOUT looking at the
 * answer. A production scale must come from the same kind of rule (never from
 * the value), or the scale itself becomes the hint.
 */
const LAB_SCALES = {
  /** A player's career games on one champion. */
  careerChampionGames: { min: 0, max: 200 },
  /** A basic ability's cooldown. */
  basicAbilityCooldown: { min: 0, max: 20 },
} as const;

function proPlayDrop(): DropFixture {
  const sample = rec(PRO_PLAY_SAMPLES.pro_play, "pro_play");
  const question = rec(sample.question, "question");
  const ctx = rec(question.context, "context");
  const result = rec(sample.result, "result");
  const evidence = rec(result.evidence, "evidence");
  const authority = rec(evidence.authority, "evidence.authority");
  const player = str(rec(ctx.anchor, "anchor").label, "anchor.label");
  const champion = str(result.correct_answer, "correct_answer");
  const row = arr(evidence.subjects, "evidence.subjects").map((s) => rec(s, "evidence.subject"))
    .find((s) => s.label === champion);
  if (!row) throw new Error(`lab fixture: pro_play evidence has no ${champion}`);
  return {
    id: "drop.pro-play.peanut-sejuani",
    mechanic: "stat-drop",
    domain: "pro-play",
    provenance: "Pro Play authority · production capture 2026-09-04 · player_ranking sample",
    content: {
      prompt: `How many pro games has ${player} played on ${champion}?`,
      metricLabel: `Games on ${champion}`,
      unit: "games",
      context: str(evidence.scope_label, "evidence.scope_label"),
      scale: { ...LAB_SCALES.careerChampionGames, step: 1, decimals: 0 },
      subject: {
        label: player,
        sublabel: champion,
        // The capture's own asset convention; the monogram covers a miss.
        media: { src: resolveAssetUrl(`assets/champions/${champion}/icon.png`), alt: "" },
      },
    },
    hidden: {
      canonicalValue: num(row.games, `${champion}.games`),
      canonicalDisplay: str(row.display, `${champion}.display`),
      evidence: str(result.explanation, "result.explanation"),
      source: `Pro Play authority · ${str(authority.metric_definition_version, "metric_definition_version")} · ${
        str(authority.policy_version, "policy_version")}`,
    },
  };
}

function leaguecraftDrop(): DropFixture {
  const FILE = "/src/lib/journey/__fixtures__/j4/olaf.standard.json";
  const ch = journeyChallenge(FILE, "child2-open", 2);
  const reveal = journeyReveal(FILE, "child2-reveal", 2);
  if (ch.answer_type !== "numeric") throw new Error("lab fixture: not a numeric child");
  const ps = readPromptSemantics(ch.prompt_semantics);
  const constraints = rec(ch.input_constraints, "input_constraints");
  const subject = rec(rec(rec(ch.presentation, "presentation").assets, "assets").subject, "assets.subject");
  return {
    id: "drop.leaguecraft.olaf-undertow-haste",
    mechanic: "stat-drop",
    domain: "leaguecraft",
    provenance: "Mastery Journey capture · J4 olaf.standard · child 2",
    content: {
      prompt: formatRecallPrompt(ps),
      metricLabel: "Cooldown",
      unit: str(constraints.unit, "input_constraints.unit"),
      context: str(ch.patch_display, "patch_display"),
      scale: {
        ...LAB_SCALES.basicAbilityCooldown,
        step: num(constraints.step, "input_constraints.step"),
        decimals: num(constraints.decimal_places, "input_constraints.decimal_places"),
      },
      subject: {
        label: `${ps.championDisplay} ${ps.subjectRef}`,
        sublabel: ps.abilityName,
        media: { src: resolveAssetUrl(str(subject.ability_icon, "ability_icon")), alt: "" },
      },
    },
    hidden: {
      canonicalValue: num(reveal.correct_answer, "reveal.correct_answer"),
      canonicalDisplay: str(reveal.correct_answer_display, "reveal.correct_answer_display"),
      evidence: str(reveal.explanation, "reveal.explanation"),
      source: `Mogzy champion data · ${str(ch.patch_display, "patch_display")}`,
    },
  };
}

// ------------------------------------------------------------------ lookup

const BUILDERS: Record<LabMechanic, Record<LabDomain, () => LabFixture>> = {
  "data-duel": { "pro-play": proPlayDuel, leaguecraft: leaguecraftDuel },
  "stat-drop": { "pro-play": proPlayDrop, leaguecraft: leaguecraftDrop },
};

const cache = new Map<string, LabFixture>();

export function labFixture(mechanic: "data-duel", domain: LabDomain): DuelFixture;
export function labFixture(mechanic: "stat-drop", domain: LabDomain): DropFixture;
export function labFixture(mechanic: LabMechanic, domain: LabDomain): LabFixture;
export function labFixture(mechanic: LabMechanic, domain: LabDomain): LabFixture {
  const key = `${mechanic}:${domain}`;
  let f = cache.get(key);
  if (!f) { f = BUILDERS[mechanic][domain](); cache.set(key, f); }
  return f;
}
