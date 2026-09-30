/**
 * JP4 — THE REASONING CHAIN: how an answer derives from the state.
 *
 * NOT the Journey Path (the header's "where am I in this lesson"). A Reasoning
 * Chain is a reveal's causal working, drawn as fixed-size nodes joined by
 * strong operators, so a learner recognises an equation at a glance:
 *
 *   Step 2   [70 · Base damage] + [70% of 21 ≈ 15 · Bonus AD damage] → [85 · Raw damage]
 *   Step 3   [Ahri · Lv 2] → [24 · Armor]
 *   Step 4   [85 · Raw] → [24 · Ahri armor] → [100 / (100 + 24) ≈ 0.806] → [68 · Final]
 *   Haste    [12s · Base cooldown] → [10 · Ability haste] → [100 / (100 + 10)] → [90.9%] → [11s · Effective]
 *
 * A chain is only ever a REAL derivation, from served structure: the server's
 * TYPED working (`combatWorking.ts` — raw damage, after armor, cooldown under
 * haste), or a recall's own semantics (a stat at a level). Anything else gets
 * no chain.
 *
 * PRIMARY vs EXACT. The nodes speak League: derived values whole (`displayWhole`),
 * taught decimals as taught. The exact working — the decimals that explain
 * where a whole number came from — is a separate list of lines (`exact`),
 * drawn behind an info control, never in the chain.
 *
 * NO SECOND COMBAT ENGINE. Every number is served: the formula's flat and
 * ratio, the exact stat the evaluator used, each term's contribution, the raw
 * total, the armor / haste multiplier, the final value. Nothing is parsed out
 * of prose. The only arithmetic is CHECKING a served number against the
 * formula it claims to be (the armor or haste multiplier; a term's product;
 * the terms' sum) before an `=` is written — never computing one to show.
 *
 * JP5 — THE SAME CHAIN, THREE MOMENTS. Not a second component:
 *
 *   LIVE        [85 · Raw damage] → [24 · Ahri armor] → [? · Final damage]
 *               the established facts this child RELIES ON, resurfaced
 *               (`JourneyPrerequisite`: relies_on → established → the reveal's
 *               display), then the asked value as `?`.
 *   EXPANDED    [85] → [24] → [100 / (100 + 24)] → [0.806] → [80.6% · Damage taken] → [68]
 *               the reveal's full derivation, all at once.
 *   COMPRESSED  [85] → [24] → [80.6% · Damage taken] → [68]
 *               the `detail` nodes folded into the `transform` node, which
 *               reopens them.
 *
 * The fraction, the decimal and the percent are three WRITINGS of one served
 * number (`mitigation_multiplier`); none is an operand. The chain is arrows,
 * never `×` or `=`: 85 × 0.806 is not how 68 was reached (the exact working is
 * 84.56 × 0.8063 ≈ 68.18, behind the Exact control).
 */
import type { JourneyAsks, JourneyPrerequisite } from "./adapter";
import { chainNoun } from "./chain";
import type { AbilitySlot } from "./contract";
import type { CombatWorking, CooldownWorking, RawDamageWorking } from "./combatWorking";
import { ratioStatLabel } from "./statWording";
import { displayWhole, exactNumber, isRoundedForDisplay, isJourneyStatKey, JOURNEY_STAT_META, type JourneyStatKey } from "./stats";

export type ReasonIcon =
  | { kind: "ability"; champion: string; slot: AbilitySlot }
  | { kind: "champion"; championId: string; champion: string }
  | { kind: "stat"; stat: JourneyStatKey };

export type ReasonOp = "+" | "−" | "=" | "→";

export interface ReasonNode {
  key: string;
  /** Small caps under the value: what this number is. */
  label: string;
  /** The primary value, League-style. */
  value: string;
  icon: ReasonIcon | null;
  /** A short expression above the value, in the learner's words ("70% of 21 ="). */
  expression?: string | null;
  /** A formula node's fraction ("100" over "100 + 24"). */
  fraction?: { top: string; bottom: string } | null;
  /** The operator drawn BEFORE this node. */
  op?: ReasonOp;
  final?: boolean;
  /** JP5 — established by an EARLIER step (a prerequisite): on screen before the reveal. */
  given?: boolean;
  /** JP5 — the asked value, not answered yet: its value is `?`. */
  asked?: boolean;
  /** JP5 — the label's one-word form, for the compact live chain ("Final"). */
  short?: string;
  /** JP5 — a derivation step the compressed chain folds away. */
  detail?: boolean;
  /** JP5 — what the `detail` steps fold INTO; it reopens them. */
  transform?: boolean;
}

/**
 * JP5 — how much of a magnitude survives a transformation: the bar under the
 * expanded chain. `ratio` is a SERVED coefficient (the working's
 * `mitigation_multiplier`), never a quotient of two displayed numbers.
 */
export interface ReasonMagnitude {
  ratio: number;
  /** The whole (raw damage) and what remains (the answer), as the chain shows them. */
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  /** `ratio` as a share ("80.6%"). */
  percent: string;
  /** What the share IS, in words: damage "taken" (default), cooldown "kept". */
  kept?: string;
}

/**
 * JP5 — a sum drawn as one bar: each served term a segment, in formula order,
 * together making the served total. `weight` is the SERVED term value (the
 * stylesheet sizes segments by it directly); `value` is how the chain shows it.
 */
export interface ReasonComposition {
  parts: { key: string; value: string; label: string; weight: number }[];
  total: string;
  totalLabel: string;
}

export interface Reasoning {
  kind: "raw" | "stat" | "combat" | "cooldown" | "live";
  /** The subject line above the chain ("Shadow Slash — Rank 1"). */
  subject: { icon: ReasonIcon | null; text: string } | null;
  /** A one-line formula the chain follows from (a Combat child that states it). */
  caption: string | null;
  nodes: ReasonNode[];
  /** Exact working, one line each; null when nothing was rounded. */
  exact: string[] | null;
  /** JP5 — the magnitude bar, when the chain is a served reduction of one. */
  magnitude?: ReasonMagnitude | null;
  /** JP5 — the composition bar, when the chain is a served sum of terms. */
  composition?: ReasonComposition | null;
}

const pct = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const slotOf = (s: string): AbilitySlot | null => (s === "Q" || s === "W" || s === "E" || s === "R" ? s : null);

/** "Rank 1" — never "R1", which reads as the R ability. */
export const rankWords = (rank: number) => `Rank ${rank}`;

/** Is `a` the same number as `b` (to float noise)? Decides `=` against `≈` only. */
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * STEP 2 — a raw (before armor) result, from the server's `raw_damage_working`:
 * the flat base at the rank, each ratio's CONTRIBUTION as the server laid it
 * out (the ratio of the exact stat the evaluator bound), and the raw total. In
 * the learner's words "70% of 21 ≈ 15": the stat and the term shown whole, so
 * `≈` unless both are exact already. The answer follows by an arrow — rounded
 * terms need not add up to the rounded answer, and nothing here pretends so.
 */
export function rawReasoning(w: RawDamageWorking): Reasoning {
  const slot = slotOf(w.ability.slot);
  const abilityIcon: ReasonIcon | null = slot ? { kind: "ability", champion: w.attacker.champion, slot } : null;
  const terms = w.terms.slice(1);
  const nodes: ReasonNode[] = [
    // A flat base is a canonical fact (92.5 stays 92.5), shown as served.
    { key: "base", label: "Base damage", value: exactNumber(w.formula.flat), icon: abilityIcon },
    ...w.formula.ratios.map((r, i): ReasonNode => {
      const stat = r.stat === "bonus_attack_damage" || r.stat === "attack_damage" ? r.stat : null;
      const term = terms[i].value;
      const exactTerm = !isRoundedForDisplay(r.value) && !isRoundedForDisplay(term) && same(r.ratio * r.value, term);
      return {
        key: `ratio-${i}`, op: "+",
        label: capitalize(`${ratioStatLabel(r.stat, r.label)} damage`),
        icon: stat && isJourneyStatKey(stat) ? { kind: "stat", stat } : null,
        expression: `${pct(r.ratio)} of ${displayWhole(r.value)} ${exactTerm ? "=" : "≈"}`,
        value: displayWhole(term),
      };
    }),
    { key: "final", label: "Raw damage", value: w.answer, op: "→", final: true, icon: abilityIcon },
  ];
  const exact: string[] = [];
  w.formula.ratios.forEach((r, i) => {
    const label = ratioStatLabel(r.stat, r.label);
    if (isRoundedForDisplay(r.value)) exact.push(`Exact ${label}: ${exactNumber(r.value)}`);
    const term = terms[i].value;
    exact.push(`${pct(r.ratio)} of ${exactNumber(r.value)} ${same(r.ratio * r.value, term) ? "=" : "≈"} ${exactNumber(term)}`);
  });
  const sum = w.terms.reduce((a, t) => a + t.value, 0);
  exact.push(`${w.terms.map((t) => exactNumber(t.value)).join(" + ")} ${same(sum, w.rawDamage) ? "=" : "≈"} ${exactNumber(w.rawDamage)}`);
  if (isRoundedForDisplay(w.rawDamage)) exact.push(`Shown as ${w.answer} · rounded for display`);
  const composition: ReasonComposition = {
    parts: [
      { key: "base", value: exactNumber(w.formula.flat), label: "base", weight: w.formula.flat },
      ...w.formula.ratios.map((r, i) => ({
        key: `ratio-${i}`, value: displayWhole(terms[i].value), weight: terms[i].value,
        label: JOURNEY_STAT_META[isJourneyStatKey(r.stat) ? r.stat : "attack_damage"].short,
      })),
    ],
    total: w.answer, totalLabel: "raw",
  };
  return {
    kind: "raw",
    subject: { icon: abilityIcon, text: `${w.ability.name || w.ability.slot} — ${rankWords(w.ability.rank)}` },
    caption: null, nodes, exact, composition,
  };
}

/**
 * STEP 2 on a reveal that carries NO served working (a backend before JP5):
 * the taught formula at the premise's rank and the premise's stated stat, in
 * WORDS only — "70% of 21", no contribution and no total arithmetic — then the
 * reveal's answer. Nothing is parsed from the explanation.
 */
export function rawWordsReasoning(parts: {
  champion: string; slot: string; ability: string; rank: number; flat: number;
  ratios: { ratio: number; stat: string; label: string; value: number }[]; answer: string;
}): Reasoning {
  const slot = slotOf(parts.slot);
  const abilityIcon: ReasonIcon | null = slot ? { kind: "ability", champion: parts.champion, slot } : null;
  const nodes: ReasonNode[] = [
    { key: "base", label: "Base damage", value: exactNumber(parts.flat), icon: abilityIcon },
    ...parts.ratios.map((r, i): ReasonNode => {
      const stat = r.stat === "bonus_attack_damage" || r.stat === "attack_damage" ? r.stat : null;
      // "70% of" over "21 · Bonus AD": the stat is the node's number; no
      // damage figure is drawn, because none is served.
      return {
        key: `ratio-${i}`, op: "+", label: capitalize(ratioStatLabel(r.stat, r.label)),
        icon: stat && isJourneyStatKey(stat) ? { kind: "stat", stat } : null,
        expression: `${pct(r.ratio)} of`, value: displayWhole(r.value),
      };
    }),
    { key: "final", label: "Raw damage", value: parts.answer, op: "→", final: true, icon: abilityIcon },
  ];
  const exact = parts.ratios.filter((r) => isRoundedForDisplay(r.value))
    .map((r) => `Exact ${ratioStatLabel(r.stat, r.label)}: ${exactNumber(r.value)}`);
  return {
    kind: "raw",
    subject: { icon: abilityIcon, text: `${parts.ability || parts.slot} — ${rankWords(parts.rank)}` },
    caption: null, nodes, exact: exact.length ? exact : null,
  };
}

/**
 * STEP 3 — a champion stat at a level: the recall's own semantics and the
 * reveal. JP5: no Exact line — the exact stat is served nowhere structured at
 * this child's own reveal (only in its prose, which is not parsed); it reaches
 * the next child as an established value.
 */
export function statReasoning(sem: {
  champion: string; championId: string | null; metric: string; level: number | null;
}, answer: string): Reasoning | null {
  const stat = sem.metric.replace(/^base_/, "");
  if (!isJourneyStatKey(stat) || sem.level === null || !sem.champion) return null;
  const meta = JOURNEY_STAT_META[stat];
  return {
    kind: "stat", subject: null, caption: null,
    nodes: [
      { key: "level", label: sem.champion, value: `Lv ${sem.level}`,
        icon: sem.championId ? { kind: "champion", championId: sem.championId, champion: sem.champion } : null },
      { key: "final", label: meta.long, value: answer, op: "→", final: true, icon: { kind: "stat", stat } },
    ],
    exact: null,
  };
}

/**
 * The served multiplier IS the positive-armor formula for the served effective
 * armor (to the server's 4-place rounding). Only then is it drawn as
 * 100 / (100 + armor); otherwise the served multiplier is shown as served.
 */
export function isArmorFormula(effectiveArmor: number, multiplier: number): boolean {
  return effectiveArmor >= 0 && Math.abs(100 / (100 + effectiveArmor) - multiplier) <= 0.00051;
}

/** STEP 4 — Combat after armor, from the server's `combat_working`. */
export function combatReasoning(w: CombatWorking, rawRecalled: boolean): Reasoning {
  const slot = slotOf(w.ability.slot);
  const abilityIcon: ReasonIcon | null = slot ? { kind: "ability", champion: w.attacker.champion, slot } : null;
  const nodes: ReasonNode[] = [
    { key: "raw", label: "Raw damage", value: displayWhole(w.rawDamage), icon: abilityIcon, given: rawRecalled },
    { key: "armor", label: `${w.target.champion} armor`, value: displayWhole(w.targetArmor.value), op: "→",
      icon: { kind: "stat", stat: "armor" }, given: w.targetArmor.source === "recalled" },
  ];
  const pen: string[] = [];
  if (w.penetration.lethality !== 0) pen.push(`${displayWhole(w.penetration.lethality)} lethality`);
  if (w.penetration.armorPenPercent !== 0) pen.push(`${w.penetration.armorPenPercent}% pen`);
  if (w.penetration.armorPenFlat !== 0) pen.push(`${displayWhole(w.penetration.armorPenFlat)} flat pen`);
  if (pen.length) {
    nodes.push({ key: "penetration", label: "Penetration", value: pen.join(" · "), op: "−",
      icon: w.penetration.lethality !== 0 ? { kind: "stat", stat: "lethality" } : null });
    nodes.push({ key: "effective", label: "Effective armor", value: displayWhole(w.effectiveArmor), op: "=",
      icon: { kind: "stat", stat: "armor" } });
  }
  const formula = isArmorFormula(w.effectiveArmor, w.mitigationMultiplier);
  if (formula) {
    // JP5 — the one served multiplier, written three ways: as the formula it
    // was checked against, as the decimal served, and as the share of the raw
    // damage taken. The first two are the derivation's DETAIL.
    nodes.push(
      // (A one-word label: the node is the narrowest tier's width on a phone.)
      { key: "armor-formula", label: "Formula", op: "→", icon: null, value: "", detail: true,
        fraction: { top: "100", bottom: `100 + ${displayWhole(w.effectiveArmor)}` } },
      { key: "decimal", label: "Multiplier", op: "→", icon: null, detail: true,
        value: w.mitigationMultiplier.toFixed(3) },
      { key: "multiplier", label: "Damage taken", op: "→", icon: null, transform: true,
        value: sharePercent(w.mitigationMultiplier) },
    );
  } else {
    nodes.push({ key: "multiplier", label: "Armor multiplier", op: "→", icon: null, value: `×${w.mitigationMultiplier}` });
  }
  nodes.push({ key: "final", label: "Final damage", value: w.answer, op: "→", final: true, icon: abilityIcon });
  // Not recalled: the served formula the raw damage follows from, under the subject line.
  const caption = rawRecalled ? null
    : `${w.formula.flat}${w.formula.ratios
      .map((r) => ` + ${pct(r.ratio)} ${ratioStatLabel(r.stat, r.label)} (${displayWhole(r.value)})`).join("")}`;
  const exact = [
    // The formula's own inputs, when a whole number stood for them in the caption.
    ...(rawRecalled ? [] : w.formula.ratios.filter((r) => isRoundedForDisplay(r.value))
      .map((r) => `Exact ${ratioStatLabel(r.stat, r.label)}: ${exactNumber(r.value)}`)),
    `Exact raw damage: ${exactNumber(w.rawDamage)}`,
    `${w.target.champion} armor: ${exactNumber(w.targetArmor.value)}`,
    ...(pen.length ? [`Effective armor: ${exactNumber(w.effectiveArmor)}`] : []),
    formula
      ? `100 ÷ (100 + ${exactNumber(w.effectiveArmor)}) = ${exactNumber(w.mitigationMultiplier)}`
      : `Armor multiplier: ${exactNumber(w.mitigationMultiplier)}`,
    `${exactNumber(w.rawDamage)} × ${exactNumber(w.mitigationMultiplier)} ≈ ${exactNumber(w.finalDamage)}`,
    ...(isRoundedForDisplay(w.finalDamage) ? [`Shown as ${w.answer} · rounded for display`] : []),
  ];
  // JP5 — the bar: the raw damage contracting to the share the armor lets
  // through. Only a real reduction is a magnitude (0 < served multiplier ≤ 1).
  const m = w.mitigationMultiplier;
  const magnitude: ReasonMagnitude | null = m > 0 && m <= 1
    ? { ratio: m, from: displayWhole(w.rawDamage), to: w.answer, fromLabel: "raw", toLabel: "final", percent: sharePercent(m) }
    : null;
  return {
    kind: "combat",
    subject: rawRecalled ? null : { icon: abilityIcon, text: `${w.ability.name || w.ability.slot} — ${rankWords(w.ability.rank)}` },
    caption, nodes, exact, magnitude,
  };
}

/**
 * The served haste multiplier IS the haste formula for the served ability
 * haste (to the server's 4-place rounding) — only then is it drawn as
 * 100 / (100 + haste).
 */
export function isHasteFormula(abilityHaste: number, multiplier: number): boolean {
  return abilityHaste >= 0 && Math.abs(100 / (100 + abilityHaste) - multiplier) <= 0.00051;
}

/** Seconds, as a League tooltip writes them ("12s", "7.5s"). */
const seconds = (v: string) => `${v}s`;

/**
 * HASTE — a cooldown under ability haste, from the server's `cooldown_working`:
 * the base cooldown, the haste, the served multiplier written three ways (the
 * formula and the decimal are DETAIL; the share is the TRANSFORM the chain
 * folds into), and the answer. The bar is the base DURATION shortening to the
 * served share. The same fold, reopen and timing as the armor unfold.
 */
export function cooldownReasoning(w: CooldownWorking): Reasoning {
  const slot = slotOf(w.ability.slot);
  const abilityIcon: ReasonIcon | null = slot ? { kind: "ability", champion: w.champion.champion, slot } : null;
  const m = w.cooldownMultiplier;
  const formula = isHasteFormula(w.abilityHaste, m);
  const nodes: ReasonNode[] = [
    // The base cooldown is a canonical fact: shown as served (7.5 stays 7.5).
    { key: "base", label: "Base cooldown", value: seconds(exactNumber(w.baseCooldown)), icon: abilityIcon },
    { key: "haste", label: "Ability haste", value: exactNumber(w.abilityHaste), op: "→",
      icon: { kind: "stat", stat: "ability_haste" } },
  ];
  if (formula) {
    nodes.push(
      { key: "haste-formula", label: "Formula", op: "→", icon: null, value: "", detail: true,
        fraction: { top: "100", bottom: `100 + ${exactNumber(w.abilityHaste)}` } },
      { key: "decimal", label: "Multiplier", op: "→", icon: null, detail: true, value: m.toFixed(3) },
      { key: "multiplier", label: "Cooldown kept", op: "→", icon: null, transform: true, value: sharePercent(m) },
    );
  } else {
    nodes.push({ key: "multiplier", label: "Cooldown multiplier", op: "→", icon: null, value: `×${m}` });
  }
  nodes.push({ key: "final", label: "New cooldown", value: seconds(w.answer), op: "→", final: true,
    icon: abilityIcon });
  const exact = [
    ...(formula ? [`100 ÷ (100 + ${exactNumber(w.abilityHaste)}) = ${exactNumber(m)}`]
      : [`Cooldown multiplier: ${exactNumber(m)}`]),
    `${exactNumber(w.baseCooldown)} × ${exactNumber(m)} ≈ ${exactNumber(w.effectiveCooldown)} ${w.unit}`,
    ...(isRoundedForDisplay(w.effectiveCooldown) ? [`Shown as ${w.answer} · rounded for display`] : []),
  ];
  return {
    kind: "cooldown",
    subject: { icon: abilityIcon, text: `${w.ability.name || w.ability.slot} — ${rankWords(w.ability.rank)}` },
    caption: null, nodes, exact,
    magnitude: { ratio: m, from: seconds(exactNumber(w.baseCooldown)), to: seconds(w.answer),
      fromLabel: "base", toLabel: "effective", percent: sharePercent(m), kept: "kept" },
  };
}

/** A served coefficient as the share it is (0.8063 → "80.6%"). Formatting only. */
export function sharePercent(coefficient: number): string {
  return `${Number((coefficient * 100).toFixed(1))}%`;
}

/** Does this chain fold (it has derivation detail, and a node to fold it into)? */
export const unfolds = (r: Reasoning) => r.nodes.some((n) => n.detail) && r.nodes.some((n) => n.transform);

/**
 * JP5 — LIVE: the prerequisites this child relies on, then the asked value.
 *
 * A prerequisite becomes a node only when it is a compact value the learner was
 * SHOWN (its reveal's display) of a kind this closed vocabulary can name — a
 * raw damage, a champion stat. A formula is not a number and has no node; a
 * fact a premise stated is on the card that states it. With no node there is
 * no live chain, and the question stands alone exactly as before.
 *
 * The asked node's value is the literal `?`: nothing of the answer is read.
 */
export function liveReasoning(prerequisites: readonly JourneyPrerequisite[],
  asks: Pick<JourneyAsks, "family" | "metric" | "subjectRef" | "subject">): Reasoning | null {
  const asked = chainNoun(asks);
  if (!asked) return null;
  const nodes: ReasonNode[] = [];
  for (const p of prerequisites) {
    if (p.display === null) continue;
    let node: Pick<ReasonNode, "label" | "value" | "icon"> | null = null;
    if (p.kind === "ability_raw_damage" && p.slot && p.champion) {
      node = { label: "Raw damage", value: p.display, icon: { kind: "ability", champion: p.champion, slot: p.slot } };
    } else if (p.kind === "champion_stat_at_level" && p.champion && isJourneyStatKey(p.stat)) {
      node = { label: `${p.champion} ${JOURNEY_STAT_META[p.stat].long.toLowerCase()}`, value: p.display,
        icon: { kind: "stat", stat: p.stat } };
    }
    if (node) nodes.push({ ...node, key: `given-${nodes.length}`, given: true, ...(nodes.length ? { op: "→" as const } : {}) });
  }
  if (nodes.length === 0) return null;
  const slot = slotOf(asks.subjectRef);
  // The compact form names a damage result by its kind alone ("Final", "Raw").
  const short = /^(Final|Raw) damage$/.exec(asked)?.[1];
  nodes.push({
    key: "asked", label: asked, value: "?", op: "→", final: true, asked: true, ...(short ? { short } : {}),
    icon: slot && typeof asks.subject === "string" ? { kind: "ability", champion: asks.subject, slot } : null,
  });
  return { kind: "live", subject: null, caption: null, nodes, exact: null };
}

// ── JP5 — THE UNFOLD'S TIMING, inside the server's reveal window ──────────────
//
// A reveal lasts exactly as long as the server grants THIS child
// (`own_reveal_window_ms`, else `reveal_window_ms`: the number its clocks were
// computed against). The chain only choreographs inside it, on MEASURED fixed
// phases rather than a share of the window:
//
//   0 ms         the whole derivation is on screen at once;
//   ~0.6 s       its bar has settled (the stylesheet's motion);
//   3.2 s        it folds to the compact chain (≈2.6 s of settled reading);
//   the rest     the compact chain, tappable to reopen until the child leaves.
//
// A window too short to leave the compact chain a usable stretch is never
// divided — the derivation stays open until the child leaves (1750 ms). Nothing
// here lengthens a reveal.

/** When the expanded derivation folds, in ms from the reveal's start. */
export const UNFOLD_COMPRESS_AT_MS = 3200;
/** The least the compressed chain must be on screen for compressing to be worth it. */
export const UNFOLD_MIN_COMPRESSED_MS = 1200;

/** Milliseconds into the reveal at which the chain compresses; null = never by itself. */
export function unfoldCompressAtMs(windowMs: number | null | undefined): number | null {
  if (typeof windowMs !== "number" || !(windowMs > 0)) return null;
  return windowMs - UNFOLD_COMPRESS_AT_MS >= UNFOLD_MIN_COMPRESSED_MS ? UNFOLD_COMPRESS_AT_MS : null;
}
