/**
 * JOURNEY5 — THE STRUCTURED COMBAT REVEAL, as one compact progression:
 *
 *   Formula (E rank 1): 55 + 100% attack damage (68.8675) + …
 *   → Raw 123.8675 → Leona armor 50.08 (recalled from step 1)
 *   → No penetration → Effective armor 50.08 → × 0.6663 → 82.5343 → Answer 83
 *
 * Every number is the SERVER's (`combat_working.v1`, read by
 * `lib/journey/combatWorking.ts`), printed verbatim. This component performs
 * ZERO Combat arithmetic: no term is computed, nothing is summed, subtracted,
 * multiplied or rounded. The only conversions are presentational — a served
 * ratio coefficient written as a percentage (the premise's own `percent`), a
 * ratio's stat said in the Journey's AD wording (`ratioStatLabel`: "total
 * AD" beside "bonus AD", never a bare "attack damage"), and a 0-based teaching
 * child named as "step N", the Journey's existing wording.
 *
 * Colours inherit from the surface it sits in, so the same rows read on the
 * dark Journey card and on the light review ledger.
 */
import type { CombatWorking } from "@/lib/journey/combatWorking";
import { ratioStatLabel } from "@/lib/journey/statWording";
import { percent } from "./JourneyCombatQuestion";

interface Step {
  key: string;
  label: string;
  value?: string;
  note?: string;
  emphasis?: boolean;
}

/** The progression's rows, in order — served values only. */
export function combatWorkingSteps(w: CombatWorking): Step[] {
  const pen: string[] = [];
  if (w.penetration.lethality !== 0) pen.push(`Lethality ${w.penetration.lethality}`);
  if (w.penetration.armorPenPercent !== 0) pen.push(`Armor pen ${w.penetration.armorPenPercent}%`);
  if (w.penetration.armorPenFlat !== 0) pen.push(`Flat armor pen ${w.penetration.armorPenFlat}`);
  const armor = w.targetArmor;
  return [
    {
      key: "formula",
      label: `Formula (${w.ability.slot} rank ${w.ability.rank})`,
      value: `${w.formula.flat}${w.formula.ratios
        .map((r) => ` + ${percent(r.ratio)} ${ratioStatLabel(r.stat, r.label)} (${r.value})`).join("")}`,
    },
    { key: "raw", label: "Raw", value: String(w.rawDamage) },
    {
      key: "armor",
      label: `${w.target.champion} armor`,
      value: String(armor.value),
      note: armor.source === "recalled" && armor.establishedInChild !== null
        ? `recalled from step ${armor.establishedInChild + 1}` : undefined,
    },
    { key: "penetration", label: pen.length > 0 ? pen.join(" / ") : "No penetration" },
    { key: "effective", label: "Effective armor", value: String(w.effectiveArmor) },
    { key: "multiplier", label: "×", value: String(w.mitigationMultiplier) },
    { key: "final", label: "", value: String(w.finalDamage) },
    { key: "answer", label: "Answer", value: w.answer, emphasis: true },
  ];
}

/**
 * JP2 — the reveal's ROWS, three balanced lines of reasoning:
 *
 *   Formula (E rank 1): 70 + 70% bonus AD (20.8)
 *   Raw 84.56 → Ahri armor 24.024 (recalled from step 3) → No penetration
 *   Effective armor 24.024 × 0.8063 = 68.1804 → Answer 68
 *
 * Only the joins change (a row starts bare; the multiplier needs no arrow, and
 * its product reads "="). Every value is still the server's, verbatim.
 */
const ROW_STARTS = new Set(["raw", "effective"]);
const ROW_JOIN: Record<string, string | null> = { multiplier: null, final: "=" };
const joinFor = (key: string, rows: boolean) =>
  (rows && key in ROW_JOIN ? ROW_JOIN[key] : "→");

export function JourneyCombatWorking({ working, rows = false, className = "" }: {
  working: CombatWorking;
  /** JP2 — lay the progression out one reasoning step per line (the Journey reveal). */
  rows?: boolean;
  className?: string;
}) {
  const steps = combatWorkingSteps(working);
  return (
    <ol data-testid="journey-combat-working" aria-label="Working" data-layout={rows ? "rows" : "line"}
      className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${rows ? "" : "gap-y-0.5 text-[11.5px] leading-4 "}${className}`}>
      {steps.map((s, i) => {
        const rowStart = rows && ROW_STARTS.has(s.key);
        return [
          rowStart && <li key={`${s.key}-break`} aria-hidden className="journey-working__break" />,
        // Real spaces between the parts (not only flex gaps), so the row reads
        // and copies as one line of text.
        <li key={s.key} data-step={s.key} className="min-w-0 break-words">
          {i > 0 && !rowStart && joinFor(s.key, rows) && (
            <><span aria-hidden className="opacity-60">{joinFor(s.key, rows)}</span>{" "}</>
          )}
          {s.label && <span className={s.emphasis ? "font-semibold" : "opacity-80"}>{s.label}{s.key === "formula" ? ":" : ""}</span>}
          {s.label && s.value !== undefined && " "}
          {s.value !== undefined && (
            <span data-testid={`journey-combat-working-${s.key}`}
              className={`tabular-nums ${s.emphasis ? "font-black" : "font-semibold"}`}>
              {s.value}
            </span>
          )}
          {s.note && <>{" "}<span data-testid="journey-combat-working-armor-source" className="opacity-80">({s.note})</span></>}
        </li>,
        ];
      })}
    </ol>
  );
}
