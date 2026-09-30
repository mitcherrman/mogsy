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
  /** JP5 — established by an EARLIER step (a prerequisite): on screen before the reveal. */
  given?: boolean;
  /** JP5 — the asked value, not answered yet: its value is `?`. */
  asked?: boolean;
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
}

export interface Reasoning {
  kind: "raw" | "stat" | "combat" | "live";
  /** The subject line above the chain ("Shadow Slash — Rank 1"). */
  subject: { icon: ReasonIcon | null; text: string } | null;
  /** A one-line formula the chain follows from (a Combat child that states it). */
  caption: string | null;
  nodes: ReasonNode[];
  /** Exact working, one line each; null when nothing was rounded. */
  exact: string[] | null;
  /** JP5 — the magnitude bar, when the chain is a served reduction of one. */
  magnitude?: ReasonMagnitude | null;
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
  nodes.push({
    key: "asked", label: asked, value: "?", op: "→", final: true, asked: true,
    icon: slot && typeof asks.subject === "string" ? { kind: "ability", champion: asks.subject, slot } : null,
  });
  return { kind: "live", subject: null, caption: null, nodes, exact: null };
}

// ── JP5 — THE UNFOLD'S TIMING, inside the server's reveal window ──────────────
//
// A reveal lasts exactly as long as the server says (`reveal_window_ms`, the
// number its clock compensation was computed against). This only DIVIDES that
// window: expanded first, compressed for the rest. A window too short to leave
// the compressed chain a usable stretch is never divided — the derivation
// stays open until the child leaves. Nothing here lengthens a reveal.

/** The share of the window the full derivation is shown for. */
export const UNFOLD_EXPANDED_SHARE = 0.6;
/** The least the compressed chain must be on screen for compressing to be worth it. */
export const UNFOLD_MIN_COMPRESSED_MS = 1200;

/** Milliseconds into the reveal at which the chain compresses; null = never by itself. */
export function unfoldCompressAtMs(windowMs: number | null | undefined): number | null {
  if (typeof windowMs !== "number" || !(windowMs > 0)) return null;
  const at = Math.round(windowMs * UNFOLD_EXPANDED_SHARE);
  return windowMs - at >= UNFOLD_MIN_COMPRESSED_MS ? at : null;
}
