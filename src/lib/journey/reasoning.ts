/**
 * JP4 — THE REASONING CHAIN: how an answer derives from the state.
 *
 * NOT the Journey Path (the header's "where am I in this lesson"). A Reasoning
 * Chain is a reveal's causal working, drawn as fixed-size nodes joined by
 * strong operators, so a learner recognises an equation at a glance:
 *
 *   Step 2   [70 · Base damage] + [70% of 21 = 15 · Bonus AD damage] = [85 · Raw damage]
 *   Step 3   [Ahri · Lv 2] → [24 · Armor]
 *   Step 4   [85 · Raw] → [24 · Ahri armor] → [100 / (100 + 24) ≈ 0.806] → [68 · Final]
 *
 * A chain is only ever a REAL derivation, from served structure: the taught
 * formula + a stated stat + the reveal (raw damage), a recall's own semantics
 * (a stat at a level), the server's `combat_working` (after armor). Anything
 * else gets no chain.
 *
 * PRIMARY vs EXACT. The nodes speak League: derived values whole (`displayWhole`),
 * taught decimals as taught. The exact working — the decimals that explain
 * where a whole number came from — is a separate list of lines (`exact`),
 * drawn behind an info control, never in the chain.
 *
 * NO SECOND COMBAT ENGINE. Every number is served: the formula's flat and
 * ratio, the stated stat, the reveal's exact result (from its own
 * explanation), the working's armor / multiplier / final. The only arithmetic
 * is laying a served total out as its served parts (raw − flat = the ratio
 * term) and CHECKING that the served multiplier is the known armor formula
 * before drawing it as that formula — it is never computed for display.
 */
import type { AbilitySlot } from "./contract";
import type { CombatWorking } from "./combatWorking";
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
}

export interface Reasoning {
  kind: "raw" | "stat" | "combat";
  /** The subject line above the chain ("Shadow Slash — Rank 1"). */
  subject: { icon: ReasonIcon | null; text: string } | null;
  /** A one-line formula the chain follows from (a Combat child that states it). */
  caption: string | null;
  nodes: ReasonNode[];
  /** Exact working, one line each; null when nothing was rounded. */
  exact: string[] | null;
}

const pct = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const slotOf = (s: string): AbilitySlot | null => (s === "Q" || s === "W" || s === "E" || s === "R" ? s : null);

/** "Rank 1" — never "R1", which reads as the R ability. */
export const rankWords = (rank: number) => `Rank ${rank}`;

/**
 * The exact number a served explanation states before rounding it
 * ("…: 84.56 damage, which rounds to 85 for this question."), or null.
 */
export function explainedExact(explanation: string | null | undefined): number | null {
  const m = /: (-?\d+(?:\.\d+)?) [a-z][a-z ]*, which rounds to -?\d+ for this question\.$/i.exec((explanation ?? "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * STEP 2 — a raw (before armor) result: the taught formula at the premise's
 * rank, the premise's stated stat, and the reveal. With one ratio and the
 * reveal's exact result, the ratio term is the served raw minus the served
 * flat — its value in the learner's words, "70% of 21 = 15".
 */
export function rawReasoning(parts: {
  champion: string; slot: string; ability: string; rank: number; flat: number;
  ratios: { ratio: number; stat: string; label: string; value: number }[];
  answer: string; exactRaw: number | null;
}): Reasoning {
  const slot = slotOf(parts.slot);
  const abilityIcon: ReasonIcon | null = slot ? { kind: "ability", champion: parts.champion, slot } : null;
  const single = parts.ratios.length === 1 ? parts.ratios[0] : null;
  const term = single && parts.exactRaw !== null ? parts.exactRaw - parts.flat : null;
  const nodes: ReasonNode[] = [
    { key: "base", label: "Base damage", value: String(parts.flat), icon: abilityIcon },
    ...parts.ratios.map((r, i): ReasonNode => {
      const stat = r.stat === "bonus_attack_damage" || r.stat === "attack_damage" ? r.stat : null;
      const words = `${pct(r.ratio)} of ${displayWhole(r.value)}`;
      return {
        key: `ratio-${i}`, op: "+",
        label: capitalize(`${ratioStatLabel(r.stat, r.label)} damage`),
        icon: stat && isJourneyStatKey(stat) ? { kind: "stat", stat } : null,
        ...(term !== null ? { expression: `${words} =`, value: displayWhole(term) } : { value: words }),
      };
    }),
    { key: "final", label: "Raw damage", value: parts.answer, op: "=", final: true, icon: abilityIcon },
  ];
  const exact: string[] = [];
  if (single) {
    const label = ratioStatLabel(single.stat, single.label);
    if (isRoundedForDisplay(single.value)) exact.push(`Exact ${label}: ${exactNumber(single.value)}`);
    if (term !== null && parts.exactRaw !== null) {
      exact.push(`${pct(single.ratio)} of ${exactNumber(single.value)} = ${exactNumber(term)}`);
      exact.push(`${parts.flat} + ${exactNumber(term)} = ${exactNumber(parts.exactRaw)}`);
      if (isRoundedForDisplay(parts.exactRaw)) exact.push(`Shown as ${displayWhole(parts.exactRaw)} · rounded for display`);
    }
  }
  return {
    kind: "raw",
    subject: { icon: abilityIcon, text: `${parts.ability || parts.slot} — ${rankWords(parts.rank)}` },
    caption: null, nodes, exact: exact.length ? exact : null,
  };
}

/** STEP 3 — a champion stat at a level: the recall's own semantics and the reveal. */
export function statReasoning(sem: {
  champion: string; championId: string | null; metric: string; level: number | null;
}, answer: string, exact: number | null): Reasoning | null {
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
    exact: exact !== null && isRoundedForDisplay(exact)
      ? [`Exact ${meta.long.toLowerCase()} at level ${sem.level}: ${exactNumber(exact)}`,
        `Shown as ${displayWhole(exact)} · rounded for display`]
      : null,
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
    { key: "raw", label: "Raw damage", value: displayWhole(w.rawDamage), icon: abilityIcon },
    { key: "armor", label: `${w.target.champion} armor`, value: displayWhole(w.targetArmor.value), op: "→",
      icon: { kind: "stat", stat: "armor" } },
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
  nodes.push(formula
    ? { key: "multiplier", label: "Damage taken", op: "→", icon: null,
      fraction: { top: "100", bottom: `100 + ${displayWhole(w.effectiveArmor)}` },
      value: `≈ ${w.mitigationMultiplier.toFixed(3)}` }
    : { key: "multiplier", label: "Armor multiplier", op: "→", icon: null, value: `×${w.mitigationMultiplier}` });
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
  return {
    kind: "combat",
    subject: rawRecalled ? null : { icon: abilityIcon, text: `${w.ability.name || w.ability.slot} — ${rankWords(w.ability.rank)}` },
    caption, nodes, exact,
  };
}
