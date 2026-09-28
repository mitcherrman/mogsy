/**
 * JP3 — A REVEAL AS A CALCULATION, NOT A PARAGRAPH.
 *
 *   RAW DAMAGE      AHRI ARMOR      ARMOR MULTIPLIER      FINAL DAMAGE
 *      85      →       24       →       ×0.8063       →       68
 *
 * Compact cells in the reveal's reserved box (the prompt region), joined by
 * operators, the last cell the culmination. The cells wrap on a phone; their
 * text never shrinks below reading size to make them fit.
 *
 * EVERY NUMBER IS SERVED. The cells lay out the server's `combat_working`,
 * the learner ledger's taught formula with the premise's stat, or a recall's
 * own prompt semantics and answer — nothing is multiplied, summed or
 * subtracted here. The one presentational conversion is the owner's display
 * precision (`displayWhole`): a DERIVED game-state number (84.56, 24.024,
 * 20.8) reads as League shows it (85, 24, 21), its exact value one hover away
 * ("rounded for display"); the calculation itself was the server's, on the
 * exact values. A served coefficient (×0.8063, 70%) and a taught formula's
 * own decimals (92.5) are printed as served.
 */
import type { CombatWorking } from "@/lib/journey/combatWorking";
import { ratioStatLabel } from "@/lib/journey/statWording";
import { displayWhole, exactValueNote, isJourneyStatKey, JOURNEY_STAT_META } from "@/lib/journey/stats";
import { percent } from "./JourneyCombatQuestion";

export interface CalcCell {
  key: string;
  label: string;
  value: string;
  /** The operator drawn BEFORE this cell ("→", "+", "="); none on the first. */
  op?: string;
  /** The culmination (the answer). */
  final?: boolean;
  /** The exact served value, when display rounding hid digits. */
  exact?: string | null;
}

/** A derived number, whole, with its exact-value note. */
const whole = (n: number) => ({ value: displayWhole(n), exact: exactValueNote(n) });

/**
 * The Combat working as a calculation. `rawRecalled`: the raw damage is a
 * fact an earlier step established (it is on the board), so the formula is
 * not re-derived; otherwise the served formula leads as a one-line CAPTION
 * ("E R1: 55 + 100% total AD (69) + …") — a formula is a sentence, not a
 * cell — and the cells start from the raw damage it gives.
 */
export function combatCalc(w: CombatWorking, rawRecalled: boolean): { caption: string | null; exact: string | null; cells: CalcCell[] } {
  const caption = rawRecalled ? null
    : `${w.ability.slot} R${w.ability.rank}: ${w.formula.flat}${w.formula.ratios
      .map((r) => ` + ${percent(r.ratio)} ${ratioStatLabel(r.stat, r.label)} (${displayWhole(r.value)})`).join("")}`;
  const exact = rawRecalled ? null
    : w.formula.ratios.map((r) => exactValueNote(r.value)).filter(Boolean).join(" ") || null;
  const cells: CalcCell[] = [];
  cells.push({ key: "raw", label: "Raw damage", ...whole(w.rawDamage) });
  cells.push({ key: "armor", label: `${w.target.champion} armor`, ...whole(w.targetArmor.value), op: "→" });
  const pen: string[] = [];
  if (w.penetration.lethality !== 0) pen.push(`${displayWhole(w.penetration.lethality)} lethality`);
  if (w.penetration.armorPenPercent !== 0) pen.push(`${w.penetration.armorPenPercent}% pen`);
  if (w.penetration.armorPenFlat !== 0) pen.push(`${displayWhole(w.penetration.armorPenFlat)} flat pen`);
  if (pen.length) {
    cells.push({ key: "penetration", label: "Penetration", value: pen.join(" · "), op: "−" });
    cells.push({ key: "effective", label: "Effective armor", ...whole(w.effectiveArmor), op: "=" });
  }
  cells.push({ key: "multiplier", label: "Armor multiplier", value: `×${w.mitigationMultiplier}`, op: "→" });
  cells.push({
    key: "final", label: "Final damage", value: w.answer, op: "→", final: true,
    exact: exactValueNote(w.finalDamage),
  });
  return { caption, exact, cells };
}

/**
 * A raw (before armor) result from served parts: the taught formula's flat
 * value at the premise's rank, each ratio with the premise's stat, and the
 * reveal's answer. `null` when any part is not served.
 */
export function rawCalcCells(parts: {
  rank: number;
  flat: number;
  ratios: { ratio: number; stat: string; label: string; value: number }[];
  answer: string;
}): CalcCell[] {
  return [
    { key: "base", label: `Base · R${parts.rank}`, value: String(parts.flat) },
    ...parts.ratios.map((r, i): CalcCell => ({
      key: `ratio-${i}`,
      label: ratioStatLabel(r.stat, r.label),
      value: `${percent(r.ratio)} × ${displayWhole(r.value)}`,
      op: "+",
      exact: exactValueNote(r.value),
    })),
    { key: "final", label: "Raw damage", value: parts.answer, op: "=", final: true },
  ];
}

/**
 * A champion stat at a level, from the recall's own prompt semantics and the
 * reveal's answer: "Level 2 → Ahri armor 24". `null` when not phraseable.
 */
export function statCalcCells(sem: {
  champion: string; metric: string; level: number | null;
}, answer: string, exact: string | null): CalcCell[] | null {
  const stat = sem.metric.replace(/^base_/, "");
  if (!isJourneyStatKey(stat) || sem.level === null || !sem.champion) return null;
  return [
    { key: "level", label: sem.champion, value: `Level ${sem.level}` },
    { key: "final", label: `${sem.champion} ${JOURNEY_STAT_META[stat].long.toLowerCase()}`, value: answer, op: "→", final: true, exact },
  ];
}

export function JourneyCalcFlow({ cells, caption = null, captionExact = null, testId = "journey-calc" }: {
  cells: readonly CalcCell[];
  /** A one-line formula the cells follow from (served parts only). */
  caption?: string | null;
  captionExact?: string | null;
  testId?: string;
}) {
  return (
    <div data-testid={testId} aria-label="Working" role="group" className="journey-calc-wrap">
      {caption && (
        <p data-testid={`${testId}-formula`} className="journey-calc__caption" title={captionExact ?? caption}>{caption}</p>
      )}
    <ol className="journey-calc">
      {cells.map((c) => (
        <li key={c.key} className="journey-calc__step" data-step={c.key}>
          {c.op && <span aria-hidden className="journey-calc__op">{c.op}</span>}
          <span className={`journey-calc__cell${c.final ? " journey-calc__cell--final" : ""}`}
            data-testid={`${testId}-${c.key}`} title={c.exact ?? undefined}
            aria-label={`${c.label}: ${c.value}${c.exact ? " (rounded for display)" : ""}`}>
            <span aria-hidden className="journey-calc__label">{c.label}</span>
            <span aria-hidden className="journey-calc__value">{c.value}</span>
          </span>
        </li>
      ))}
    </ol>
    </div>
  );
}

/**
 * A served explanation that states a derived value AND its rounding
 * ("…: 24.024 armor, which rounds to 24 for this question.") reads with the
 * whole value only; the exact one moves to a hover note. Anything else is
 * returned verbatim — a sentence this does not recognise is never rewritten.
 */
export function displayExplanation(text: string): { text: string; exact: string | null } {
  const m = /^(.*): (-?\d+(?:\.\d+)?) ([a-z][a-z ]*), which rounds to (-?\d+) for this question\.$/i.exec(text.trim());
  if (!m) return { text, exact: null };
  const [, head, exact, unit, shown] = m;
  return {
    text: `${head}: ${shown} ${unit}.`,
    exact: `Exact value ${exact} · shown as ${shown}, rounded for display. Calculations use the exact value.`,
  };
}
