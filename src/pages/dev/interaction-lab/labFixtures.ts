/**
 * MIG1 — the Interaction Lab's CERTIFICATION FIXTURES, adapted from existing
 * authority captures. No fact in this file is hand-written.
 *
 * Sources (all already in the repo):
 *   * `PRO_PLAY_SAMPLES` (lib/pro-play/__fixtures__/proPlaySamples.ts) — real
 *     Pro Play authority payloads: most captured from production
 *     `/api/pro-play/quiz/*` on 2026-09-04, `nuguri_clear` / `t1_lineage`
 *     generated against the live authority through the API's own builders.
 *   * Journey captures J3/J4 (lib/journey/__fixtures__) — real Bot-match
 *     envelopes from the canonical DB (see j3/CAPTURE.md), each child's frozen
 *     question plus the authority's own reveal.
 *   * `masterySlicePreviews.json` (lib/admin/__fixtures__) — verbatim
 *     `ranked_public/mastery_preview.py` output for the production generators.
 *
 * No trustworthy Faker fixture exists (the Faker row in ProStatsExplorer.test
 * is a hand-written mock), so no Faker fact appears here.
 *
 * WHAT THE LAB ADDS, AND WHY IT IS NOT A SECOND AUTHORITY
 *   * PROJECTIONS. `t1-kt` is a pairwise projection of a four-team ranking,
 *     and `olaf-lucian-tie` pairs two cooldowns captured on the same patch.
 *     Same metric, same scope, the authority's own values; the lab compares
 *     them to name the canonical side. That comparison is the lab's local
 *     stand-in for grading (MIG1.0 §11.3) and is lab-scoped.
 *   * VALUES FROM PROSE. Leaguecraft comparison values are read out of the
 *     authority's explanation sentence, fail-closed, because the backend
 *     publishes no structured per-side values for a comparison child. This is
 *     acceptable ONLY in this lab adapter; the production contract needs
 *     structured values (see the MIG1.2 handoff).
 *   * NUMERIC FROM DISPLAY. Pro Play side values are read from the evidence
 *     row's structured `display` field ("25.0%", "84").
 *   * SCALES. Stat Drop min/max are lab presentation chosen per metric family
 *     (`LAB_SCALES`) without reference to the answer. Step/decimals come from
 *     the authority's `input_constraints` where it publishes them.
 *   * STAT DROP FROM A CHOICE CHILD. `ahri-armor` and `zed-shadow-slash` were
 *     served as single_choice; the fact and its graded value are the
 *     authority's, the numeric presentation is the lab's.
 *
 * THE SPLIT. Each fixture is `{ content, hidden }`. `content` is the public
 * projection the primitive may see from the first frame; `hidden` is held by
 * the lab controller and handed over only after lock + suspense.
 */
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { PRO_PLAY_SAMPLES } from "@/lib/pro-play/__fixtures__/proPlaySamples";
import PREVIEWS from "@/lib/admin/__fixtures__/masterySlicePreviews.json";
import { readComparisonSemantics } from "@/features/mastery/contracts/comparisonSemantics";
import { readPromptSemantics } from "@/features/mastery/contracts/promptSemantics";
import { formatComparisonPrompt } from "@/features/mastery/interactions/formatComparisonSemantics";
import { formatRecallPrompt } from "@/features/mastery/interactions/formatPromptSemantics";
import { combatPremiseOf, combatQuestionSentence } from "@/components/journey/JourneyCombatQuestion";
import type {
  DataDuelPublic, DataDuelReveal, DuelSide, StatDropPublic, StatDropReveal,
} from "@/lib/interaction-grammar/types";

export type LabMechanic = "data-duel" | "stat-drop";
export type LabDomain = "pro-play" | "leaguecraft";

interface FixtureBase {
  id: string;
  domain: LabDomain;
  /** Short selector label. */
  title: string;
  /** What this fixture certifies (content shape), for the matrix. */
  shape: string;
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
/** A number from an authority-formatted display field ("25.0%", "84"). */
const fromDisplay = (display: string, what: string): number => {
  const n = Number(display.replace(/[%,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`lab fixture: ${what} display "${display}" is not numeric`);
  return n;
};

/** The Journey capture asset convention (`assets/champions/LeeSin/...`). */
const championArt = (key: string, kind: "splash" | "icon") =>
  resolveAssetUrl(`assets/champions/${key.replace(/[^A-Za-z0-9]/g, "")}/${kind === "icon" ? "icon.png" : "splash/0_default.jpg"}`);

// Journey captures, eagerly — the lab chunk is DEV-only (see featureGate), so
// no production chunk carries them. Same files `realFixtures.ts` loads lazily.
const CAPTURES = import.meta.glob<unknown>(
  [
    "/src/lib/journey/__fixtures__/j3/pantheon.standard.json",
    "/src/lib/journey/__fixtures__/j3/zed.standard.json",
    "/src/lib/journey/__fixtures__/j4/olaf.standard.json",
    "/src/lib/journey/__fixtures__/j4/lucian.standard.json",
  ],
  { eager: true, import: "default" },
);
const J3 = (name: string) => `/src/lib/journey/__fixtures__/j3/${name}.json`;
const J4 = (name: string) => `/src/lib/journey/__fixtures__/j4/${name}.json`;

function snapshot(file: string, label: string): Rec {
  const snaps = arr(CAPTURES[file], file);
  const snap = snaps.map((s) => rec(s, file)).find((s) => s.label === label);
  if (!snap) throw new Error(`lab fixture: ${file} has no ${label}`);
  return rec(rec(snap.envelope, `${label}.envelope`).payload, `${label}.payload`);
}

/** The frozen challenge (question side) at `index` of a Journey capture. */
function journeyChallenge(file: string, index: number): Rec {
  const seg = rec(snapshot(file, `child${index}-open`).segment_state, "segment_state");
  const list = arr(rec(seg.challenges, "challenges").challenges, "challenges.challenges");
  const ch = list.map((c) => rec(c, "challenge")).find((c) => c.challenge_index === index);
  if (!ch) throw new Error(`lab fixture: ${file} has no challenge ${index}`);
  return ch;
}

/** The authority's reveal for challenge `index`. */
function journeyReveal(file: string, index: number): Rec {
  const seg = rec(snapshot(file, `child${index}-reveal`).segment_state, "segment_state");
  const list = arr(seg.own_challenge_reveals, "own_challenge_reveals");
  const r = list.map((c) => rec(c, "reveal")).find((c) => c.challenge_index === index);
  if (!r) throw new Error(`lab fixture: ${file} has no reveal ${index}`);
  return r;
}

const subjectAssets = (ch: Rec) =>
  rec(rec(rec(ch.presentation, "presentation").assets, "assets").subject, "assets.subject");

/**
 * One side's deciding value out of the authority's comparison explanation
 * ("Leona R (Solar Flare) at rank 1: 90 seconds. Pantheon R …"). Fail-closed:
 * a sentence that does not parse throws rather than drawing a guess. LAB ONLY.
 */
export function sideValueFromExplanation(explanation: string, championDisplay: string): { value: number; unit: string } {
  const sentence = explanation.split(/(?<=\.)\s+/).find((s) => s.startsWith(`${championDisplay} `)
    || s.startsWith(`${championDisplay}:`));
  const m = sentence?.match(/:\s*(\d+(?:\.\d+)?)\s+([a-z]+)\.?$/i);
  if (!m) throw new Error(`lab fixture: no value for ${championDisplay} in "${explanation}"`);
  return { value: Number(m[1]), unit: m[2] };
}

const SHORT_UNIT: Record<string, string> = { seconds: "s", hitpoints: "HP" };
const shortUnit = (unit: string) => SHORT_UNIT[unit] ?? unit;
const valueText = (n: number, unit: string) => (shortUnit(unit) === "s" ? `${n}s` : `${n} ${shortUnit(unit)}`);

/** The canonical "same value" answer every Mastery comparison domain carries. */
function masteryTie(options: readonly string[]): { token: string; label: string } | null {
  return options.includes("tie") ? { token: "tie", label: "Same value" } : null;
}

// ------------------------------------------------------ Data Duel · Pro Play

interface PairwiseSpec {
  id: string; sample: string; title: string; shape: string; metricLabel: string;
  a: string; b: string; margin: { unit: string; decimals: number };
  /** The sample's authority answer is for a DIFFERENT question (a ranking). */
  projection?: { prompt: (league: string, anchor: string) => string };
}

function proPlayDuel(spec: PairwiseSpec): DuelFixture {
  const sample = rec(PRO_PLAY_SAMPLES[spec.sample], spec.sample);
  const question = rec(sample.question, "question");
  const ctx = rec(question.context, "context");
  const result = rec(sample.result, "result");
  const evidence = rec(result.evidence, "evidence");
  const authority = rec(evidence.authority, "evidence.authority");
  const anchor = str(rec(ctx.anchor, "anchor").label, "anchor.label");
  const tags = arr(ctx.scope_tags, "scope_tags").map((t) => str(rec(t, "scope_tag").label, "scope_tag.label"));
  const subjects = arr(ctx.subjects, "subjects").map((s) => rec(s, "subject"));
  const rows = arr(evidence.subjects, "evidence.subjects").map((s) => rec(s, "evidence.subject"));
  const side = (label: string) => {
    const subject = subjects.find((s) => s.label === label);
    const row = rows.find((s) => s.label === label);
    if (!subject || !row) throw new Error(`lab fixture: ${spec.sample} has no ${label}`);
    const kind = str(subject.kind, `${label}.kind`);
    const seasons = (subject.seasons as Rec | undefined)?.label;
    const mediaKey = (subject.media as Rec | undefined)?.key;
    const display = str(row.display, `${label}.display`);
    const duel: DuelSide = {
      token: typeof subject.id === "string" ? subject.id : label,
      label,
      sublabel: kind === "champion" ? null : typeof seasons === "string" ? `Seasons ${seasons}` : null,
      monogram: typeof subject.short === "string" ? subject.short : null,
      // Champions have canonical art; players and teams only have Pro Play
      // media behind a network API, which the lab does not call.
      media: kind === "champion" && typeof mediaKey === "string"
        ? { src: championArt(mediaKey, "splash"), alt: "" } : null,
    };
    return { duel, display, value: fromDisplay(display, label) };
  };
  const a = side(spec.a);
  const b = side(spec.b);
  let canonical: typeof a;
  let prompt: string;
  if (spec.projection) {
    if (a.value === b.value) throw new Error(`lab fixture: ${spec.id} projection is a tie`);
    canonical = a.value > b.value ? a : b;
    prompt = spec.projection.prompt(tags[0], anchor);
  } else {
    const answer = str(result.correct_answer, "correct_answer");
    canonical = answer === a.duel.label ? a : answer === b.duel.label ? b
      : (() => { throw new Error(`lab fixture: ${spec.id} answer ${answer} is neither side`); })();
    prompt = str(question.question_text, "question_text");
  }
  const scope = str(evidence.scope_label, "evidence.scope_label");
  return {
    id: spec.id, mechanic: "data-duel", domain: "pro-play", title: spec.title, shape: spec.shape,
    provenance: `Pro Play authority · ${spec.sample} sample${spec.projection ? " · pairwise projection of a ranking" : ""}`,
    content: {
      prompt, metricLabel: spec.metricLabel, context: tags.join(" · "),
      left: a.duel, right: b.duel, tie: null, margin: spec.margin,
    },
    hidden: {
      canonicalToken: canonical.duel.token,
      values: { [a.duel.token]: a.display, [b.duel.token]: b.display },
      numericValues: { [a.duel.token]: a.value, [b.duel.token]: b.value },
      evidence: spec.projection
        ? `${scope}: ${a.duel.label} ${a.display}, ${b.duel.label} ${b.display}.`
        : str(result.explanation, "result.explanation"),
      source: `Pro Play authority · ${str(authority.metric_definition_version, "metric_definition_version")} · ${
        str(authority.policy_version, "policy_version")}`,
    },
  };
}

// --------------------------------------------------- Data Duel · Leaguecraft

/** A served Mastery comparison (semantics + options + reveal) as a duel. */
function masteryDuel(args: {
  id: string; title: string; shape: string; provenance: string; patch: string;
  semantics: unknown; options: readonly string[]; correct: string; explanation: string;
  art?: { a: string; b: string } | null; metricLabel?: string;
}): DuelFixture {
  const cs = readComparisonSemantics(args.semantics);
  const [tokenA, tokenB] = args.options;
  const va = sideValueFromExplanation(args.explanation, cs.championADisplay);
  const vb = sideValueFromExplanation(args.explanation, cs.championBDisplay);
  const sub = (ability: string) => (cs.subjectRef ? `${cs.subjectRef} · ${ability}` : null);
  return {
    id: args.id, mechanic: "data-duel", domain: "leaguecraft", title: args.title, shape: args.shape,
    provenance: args.provenance,
    content: {
      prompt: formatComparisonPrompt(cs),
      metricLabel: args.metricLabel ?? (cs.metric.replace(/^base_/, "Base ").replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())),
      context: args.patch,
      left: {
        token: tokenA, label: cs.championADisplay, sublabel: sub(cs.abilityNameA),
        media: args.art ? { src: resolveAssetUrl(args.art.a), alt: "" } : null,
      },
      right: {
        token: tokenB, label: cs.championBDisplay, sublabel: sub(cs.abilityNameB),
        media: args.art ? { src: resolveAssetUrl(args.art.b), alt: "" } : null,
      },
      tie: masteryTie(args.options),
      margin: { unit: valueText(0, va.unit).replace(/^0/, ""), decimals: 0 },
    },
    hidden: {
      canonicalToken: args.correct,
      values: { [tokenA]: valueText(va.value, va.unit), [tokenB]: valueText(vb.value, vb.unit) },
      numericValues: { [tokenA]: va.value, [tokenB]: vb.value },
      evidence: args.explanation,
      source: `Mogzy champion data · ${args.patch}`,
    },
  };
}

function journeyDuel(id: string, title: string, shape: string, file: string, capture: string, index: number): DuelFixture {
  const ch = journeyChallenge(file, index);
  const reveal = journeyReveal(file, index);
  if (ch.interaction_kind !== "comparison_left_right") throw new Error(`lab fixture: ${id} is not a comparison`);
  const assets = subjectAssets(ch);
  return masteryDuel({
    id, title, shape, provenance: `Mastery Journey capture · ${capture} · child ${index}`,
    patch: str(ch.patch_display, "patch_display"),
    semantics: ch.comparison_semantics,
    options: arr(ch.answer_options, "answer_options").map((o, i) => str(o, `answer_options[${i}]`)),
    correct: str(reveal.correct_answer, "reveal.correct_answer"),
    explanation: str(reveal.explanation, "reveal.explanation"),
    art: { a: str(assets.champion_a_splash, "champion_a_splash"), b: str(assets.champion_b_splash, "champion_b_splash") },
    metricLabel: str(assets.metric_label, "metric_label"),
  });
}

function previewDuel(): DuelFixture {
  const matchup = rec(rec(PREVIEWS as unknown, "previews").matchup, "matchup");
  const ch = arr(matchup.challenges, "matchup.challenges").map((c) => rec(c, "challenge"))
    .find((c) => rec(c.comparison_semantics ?? {}, "cs").template === "compare_champion_base_stat");
  if (!ch) throw new Error("lab fixture: preview has no base-stat comparison");
  const patch = str(rec(matchup.mastery_artifact, "mastery_artifact").patch_display, "patch_display");
  return masteryDuel({
    id: "duel.lc.ahri-syndra-health", title: "Ahri vs Syndra · base health",
    shape: "champion stat · close margin · no art",
    provenance: "Mastery generator preview (verbatim mastery_preview.py capture) · matchup",
    patch, semantics: ch.comparison_semantics,
    options: arr(ch.answer_options, "answer_options").map((o, i) => str(o, `answer_options[${i}]`)),
    correct: str(ch.correct_answer, "correct_answer"),
    explanation: str(ch.explanation, "explanation"),
    art: null, // the preview publishes no presentation assets: certifies the no-art path
  });
}

/**
 * A TIE, from two captured facts on the same patch: Olaf Q (flat, J4 olaf
 * child 1) and Lucian Q at rank 1 (J4 lucian child 1) are both 9 seconds.
 * The pairing and the resulting "tie" answer are the lab's; each value is the
 * authority's, and the prompt is production's own formatter over the two
 * captured side contexts.
 */
function tieDuel(): DuelFixture {
  const olafCh = journeyChallenge(J4("olaf.standard"), 1);
  const lucianCh = journeyChallenge(J4("lucian.standard"), 1);
  const olafCs = rec(olafCh.comparison_semantics, "olaf cs");
  const lucianCs = rec(lucianCh.comparison_semantics, "lucian cs");
  const olafWhich = olafCs.champion_a_display === "Olaf" ? 0 : 1;
  const lucianWhich = lucianCs.champion_a_display === "Lucian" ? 0 : 1;
  const nameKey = (i: number) => (i === 0 ? "ability_name_a" : "ability_name_b");
  const sideCtx = (cs: Rec, i: number) => arr(cs.side_contexts, "side_contexts")[i];
  const olafV = sideValueFromExplanation(str(journeyReveal(J4("olaf.standard"), 1).explanation, "olaf expl"), "Olaf Q");
  const lucianV = sideValueFromExplanation(str(journeyReveal(J4("lucian.standard"), 1).explanation, "lucian expl"), "Lucian Q");
  if (olafV.value !== lucianV.value) throw new Error("lab fixture: olaf/lucian are no longer a tie");
  const semantics = {
    template: "compare_ability_cooldown",
    champion_a_display: "Olaf", champion_b_display: "Lucian",
    metric: "ability_cooldown", dimension: "duration", subject_ref: "Q",
    context: { ability_rank: null, champion_level: null, form: null }, unit: "seconds",
    ability_name_a: olafCs[nameKey(olafWhich)], ability_name_b: lucianCs[nameKey(lucianWhich)],
    rank_independent: false,
    side_contexts: [sideCtx(olafCs, olafWhich), sideCtx(lucianCs, lucianWhich)],
  };
  const olafArt = subjectAssets(olafCh)[olafWhich === 0 ? "champion_a_splash" : "champion_b_splash"];
  const lucianArt = subjectAssets(lucianCh)[lucianWhich === 0 ? "champion_a_splash" : "champion_b_splash"];
  return masteryDuel({
    id: "duel.lc.olaf-lucian-tie", title: "Olaf Q vs Lucian Q · tie",
    shape: "cooldown · exact tie · mixed rank context",
    provenance: "Lab pairing of two J4 captures (olaf child 1, lucian child 1), same patch",
    patch: str(olafCh.patch_display, "patch_display"), semantics,
    options: ["olaf", "lucian", "tie"], correct: "tie",
    explanation: `Olaf Q (Undertow): ${olafV.value} seconds. Lucian Q (Piercing Light) at rank 1: ${lucianV.value} seconds. Same cooldown.`,
    art: { a: str(olafArt, "olaf art"), b: str(lucianArt, "lucian art") },
    metricLabel: "Cooldown",
  });
}

// -------------------------------------------------------------- Stat Drop

/**
 * Lab-authored scales, per metric FAMILY, chosen WITHOUT looking at any
 * answer. A production scale must come from the same kind of rule (never
 * from the value), or the scale itself becomes the hint.
 */
export const LAB_SCALES = {
  /** A player's career games on one champion. */
  careerChampionGames: { min: 0, max: 200, step: 1, decimals: 0 },
  /** A team's games on one champion at one event. */
  eventChampionGames: { min: 0, max: 40, step: 1, decimals: 0 },
  /** Any win rate, in percent. */
  winRatePercent: { min: 0, max: 100, step: 0.1, decimals: 1 },
  /** A basic ability's cooldown (step/decimals from the authority when published). */
  basicAbilityCooldown: { min: 0, max: 20, step: 1, decimals: 0 },
  /** A champion's armor at a low level. */
  championArmor: { min: 0, max: 100, step: 1, decimals: 0 },
  /** Early-game single-ability damage. */
  earlyAbilityDamage: { min: 0, max: 300, step: 1, decimals: 0 },
} as const;

function proPlayDrop(args: {
  id: string; sample: string; title: string; shape: string; row: string; prompt: string;
  metricLabel: string; unit: string; scale: StatDropPublic["scale"];
  subject: { label: string; champion: string };
}): DropFixture {
  const sample = rec(PRO_PLAY_SAMPLES[args.sample], args.sample);
  const result = rec(sample.result, "result");
  const evidence = rec(result.evidence, "evidence");
  const authority = rec(evidence.authority, "evidence.authority");
  const row = arr(evidence.subjects, "evidence.subjects").map((s) => rec(s, "evidence.subject"))
    .find((s) => s.label === args.row);
  if (!row) throw new Error(`lab fixture: ${args.sample} evidence has no ${args.row}`);
  const display = str(row.display, `${args.row}.display`).replace(/%$/, "");
  return {
    id: args.id, mechanic: "stat-drop", domain: "pro-play", title: args.title, shape: args.shape,
    provenance: `Pro Play authority · ${args.sample} sample`,
    content: {
      prompt: args.prompt, metricLabel: args.metricLabel, unit: args.unit,
      context: str(evidence.scope_label, "evidence.scope_label"), scale: args.scale,
      subject: {
        label: args.subject.label, sublabel: args.subject.champion,
        // The capture's own asset convention; the monogram covers a miss.
        media: { src: championArt(args.subject.champion, "icon"), alt: "" },
      },
    },
    hidden: {
      canonicalValue: fromDisplay(display, args.row),
      canonicalDisplay: display,
      evidence: str(result.explanation, "result.explanation"),
      source: `Pro Play authority · ${str(authority.metric_definition_version, "metric_definition_version")} · ${
        str(authority.policy_version, "policy_version")}`,
    },
  };
}

function journeyDrop(args: {
  id: string; title: string; shape: string; file: string; capture: string; index: number;
  metricLabel: string; unit?: string; scale: StatDropPublic["scale"]; art: "ability_icon" | "champion_icon";
}): DropFixture {
  const ch = journeyChallenge(args.file, args.index);
  const reveal = journeyReveal(args.file, args.index);
  const raw = rec(ch.prompt_semantics, "prompt_semantics");
  const constraints = (ch.input_constraints ?? null) as Rec | null;
  const assets = subjectAssets(ch);
  let prompt: string;
  let context = str(ch.patch_display, "patch_display");
  let subjectLabel: string;
  let sublabel: string;
  if (raw.template === "ability_damage_under_state") {
    // Production's own combat sentence, plus the served scenario inputs the
    // answer depends on (the Journey board shows these beside the question).
    const premise = combatPremiseOf({ promptSemantics: raw } as never);
    if (!premise) throw new Error(`lab fixture: ${args.id} has no combat premise`);
    prompt = combatQuestionSentence(premise);
    const get = (k: string) => premise.pairs.find(([key]) => key === k)?.[1];
    context = `Target level ${get("target_level")} · Attacker level ${get("attacker_level")} · ${
      get("attacker_items") === "none" ? "No items" : `Items: ${get("attacker_items")}`}`;
    subjectLabel = `${premise.champion} ${premise.slot}`;
    sublabel = premise.ability;
  } else {
    const ps = readPromptSemantics(raw);
    prompt = formatRecallPrompt(ps);
    subjectLabel = ps.subjectRef ? `${ps.championDisplay} ${ps.subjectRef}` : ps.championDisplay;
    sublabel = ps.abilityName || ps.metric.replace(/^base_/, "").replace(/_/g, " ");
  }
  const correct = reveal.correct_answer;
  const canonicalValue = typeof correct === "number" ? correct : Number(str(correct, "correct_answer"));
  if (!Number.isFinite(canonicalValue)) throw new Error(`lab fixture: ${args.id} answer is not numeric`);
  const display = typeof reveal.correct_answer_display === "string" ? reveal.correct_answer_display : String(correct);
  const scale = constraints
    ? { ...args.scale, step: num(constraints.step, "step"), decimals: num(constraints.decimal_places, "decimal_places") }
    : args.scale;
  return {
    id: args.id, mechanic: "stat-drop", domain: "leaguecraft", title: args.title, shape: args.shape,
    provenance: `Mastery Journey capture · ${args.capture} · child ${args.index}`,
    content: {
      prompt, metricLabel: args.metricLabel,
      unit: constraints ? str(constraints.unit, "input_constraints.unit") : args.unit ?? "",
      context, scale,
      subject: { label: subjectLabel, sublabel, media: { src: resolveAssetUrl(str(assets[args.art], args.art)), alt: "" } },
    },
    hidden: {
      canonicalValue, canonicalDisplay: display,
      evidence: str(reveal.explanation, "reveal.explanation"),
      source: `Mogzy champion data · ${str(ch.patch_display, "patch_display")}`,
    },
  };
}

// ------------------------------------------------------------ the matrix

const BUILDERS: readonly (() => LabFixture)[] = [
  // Data Duel · Pro Play
  () => proPlayDuel({
    id: "duel.pp.t1-kt-gragas", sample: "t1_lineage", title: "T1 vs KT · Gragas games",
    shape: "team vs team · count · no art (monogram)", metricLabel: "Games on Gragas",
    a: "T1", b: "KT Rolster", margin: { unit: " games", decimals: 0 },
    projection: { prompt: (league, champ) => `In ${league}, which team has more games played on ${champ}: T1 or KT Rolster?` },
  }),
  () => proPlayDuel({
    id: "duel.pp.weiwei-h4cker-udyr", sample: "champion_player", title: "Weiwei vs H4cker · Udyr win rate",
    shape: "player vs player · rate · large margin", metricLabel: "Win rate on Udyr",
    a: "Weiwei", b: "H4cker", margin: { unit: " pts", decimals: 1 },
  }),
  () => proPlayDuel({
    id: "duel.pp.viktor-jarvan-picks", sample: "recent", title: "Viktor vs Jarvan IV · picks",
    shape: "champion vs champion · long scope label · art", metricLabel: "Pick count",
    a: "Viktor", b: "Jarvan IV", margin: { unit: " picks", decimals: 0 },
  }),
  // Data Duel · Leaguecraft
  () => journeyDuel("duel.lc.leona-pantheon-r", "Leona R vs Pantheon R", "ultimate cooldown · large margin · art",
    J3("pantheon.standard"), "J3 pantheon.standard", 3),
  previewDuel,
  tieDuel,
  // Stat Drop · Pro Play
  () => proPlayDrop({
    id: "drop.pp.peanut-sejuani", sample: "pro_play", title: "Peanut · Sejuani games",
    shape: "integer · broad range (0–200)", row: "Sejuani",
    prompt: "How many pro games has Peanut played on Sejuani?", metricLabel: "Games on Sejuani",
    unit: "games", scale: LAB_SCALES.careerChampionGames, subject: { label: "Peanut", champion: "Sejuani" },
  }),
  () => proPlayDrop({
    id: "drop.pp.nuguri-kennen-wr", sample: "nuguri_clear", title: "Nuguri · Kennen win rate",
    shape: "decimal percent · 0.1 step", row: "Nuguri",
    prompt: "What is Nuguri's win rate on Kennen in LCK?", metricLabel: "Win rate on Kennen",
    unit: "%", scale: LAB_SCALES.winRatePercent, subject: { label: "Nuguri", champion: "Kennen" },
  }),
  () => proPlayDrop({
    id: "drop.pp.splyce-gangplank", sample: "champion_team", title: "Splyce · Gangplank at Worlds",
    shape: "integer · small range (0–40)", row: "Splyce",
    prompt: "How many World Championship games has Splyce played on Gangplank?", metricLabel: "Games on Gangplank",
    unit: "games", scale: LAB_SCALES.eventChampionGames, subject: { label: "Splyce", champion: "Gangplank" },
  }),
  // Stat Drop · Leaguecraft
  () => journeyDrop({
    id: "drop.lc.olaf-undertow-haste", title: "Olaf Q · cooldown @ 10 AH", shape: "decimal · narrow range (0–20, 0.1)",
    file: J4("olaf.standard"), capture: "J4 olaf.standard", index: 2, metricLabel: "Cooldown",
    scale: LAB_SCALES.basicAbilityCooldown, art: "ability_icon",
  }),
  () => journeyDrop({
    id: "drop.lc.ahri-armor-l3", title: "Ahri · armor at level 3", shape: "champion stat · integer (0–100)",
    file: J3("zed.standard"), capture: "J3 zed.standard", index: 0, metricLabel: "Armor", unit: "armor",
    scale: LAB_SCALES.championArmor, art: "champion_icon",
  }),
  () => journeyDrop({
    id: "drop.lc.zed-shadow-slash", title: "Zed E · damage vs Ahri", shape: "combat calculation · broad (0–300)",
    file: J3("zed.standard"), capture: "J3 zed.standard", index: 2, metricLabel: "Physical damage", unit: "damage",
    scale: LAB_SCALES.earlyAbilityDamage, art: "ability_icon",
  }),
];

let built: readonly LabFixture[] | null = null;
/** Every certification fixture, in matrix order. */
export function allLabFixtures(): readonly LabFixture[] {
  built ??= BUILDERS.map((b) => b());
  return built;
}

export function labFixturesFor(mechanic: LabMechanic, domain?: LabDomain): LabFixture[] {
  return allLabFixtures().filter((f) => f.mechanic === mechanic && (!domain || f.domain === domain));
}

export function labFixtureById(id: string): LabFixture | null {
  return allLabFixtures().find((f) => f.id === id) ?? null;
}

/** The first fixture for a mechanic × domain (the MIG1.1 pair). */
export function labFixture(mechanic: "data-duel", domain: LabDomain): DuelFixture;
export function labFixture(mechanic: "stat-drop", domain: LabDomain): DropFixture;
export function labFixture(mechanic: LabMechanic, domain: LabDomain): LabFixture;
export function labFixture(mechanic: LabMechanic, domain: LabDomain): LabFixture {
  return labFixturesFor(mechanic, domain)[0];
}
