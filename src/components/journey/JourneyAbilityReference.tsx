/**
 * MISC-W1B F08 — THE STATED ABILITY REFERENCE (`lib/journey/abilityReference.ts`).
 *
 * A formula a child STATED (Daily S-A: Pantheon E at Step 3) stays one tap away
 * on its ability's own tile for the rest of the Journey:
 *
 *   E · Aegis Assault
 *   ƒ 55 / 105 / 155 / 205 / 255 + 100% total AD + 150% bonus AD   stated Step 3
 *   Physical damage before armor: the value at the current rank, plus each %.
 *
 * REFERENCE, NOT KNOWLEDGE. "stated Step N", never K2's "learned Step N"; no
 * gold `!`, no Saved arrival. The served formula is printed, never evaluated —
 * the current rank is only underlined — so no unanswered result can leak.
 *
 * ONE CONTROL. With no `!` on the ability, the TILE is the control: a
 * transparent button over the tile (`journey-ref-btn`, the item / shard
 * reference's own) — same hover-preview / tap-to-pin / Enter-Space / Escape
 * grammar as every board popover. An ability that also wears a `!` keeps the
 * `!` as its one control and its card gains this section
 * (`JourneyKnowledgeMark`'s `reference`).
 */
import { SquareFunction } from "lucide-react";
import type { JourneyAbility } from "@/lib/journey/contract";
import { statedLabel, type StatedAbilityReference } from "@/lib/journey/abilityReference";
import { ratioStatLabel } from "@/lib/journey/statWording";
import { percent } from "./JourneyCombatQuestion";
import { ReferencePopover } from "./JourneyReferencePopover";

const MITIGATED_BY: Readonly<Record<string, string>> = { physical: "armor", magic: "magic resist" };

/** The formula in words, for a screen reader: "55, 105, … by rank, plus 100% total AD …". */
function statedReferenceSpoken(ref: StatedAbilityReference): string {
  const f = ref.formula;
  return `${f.flatByRank.join(", ")} by rank${f.ratios.map((r) => `, plus ${percent(r.ratio)} ${ratioStatLabel(r.stat, r.label)}`).join("")}`;
}

/** The reference's lines: the served formula (current rank marked) and what it means. */
export function StatedReferenceLines({ reference, rank, testId }: {
  reference: StatedAbilityReference;
  /** The board's current rank for the ability (marks that rank's value; 0 = none). */
  rank: number;
  testId: string;
}) {
  const f = reference.formula;
  const mitigation = MITIGATED_BY[f.damageType] ?? null;
  return (
    <>
      <ul className="journey-know-pop__lines" data-testid={`${testId}-formula`}>
        <li className="journey-know-pop__line journey-know-pop__line--wrap"
          aria-label={`${f.abilityName} damage formula: ${statedReferenceSpoken(reference)}, ${statedLabel(reference.child)}`}>
          <SquareFunction aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />
          <span aria-hidden className="journey-know-pop__fact">
            {f.flatByRank.map((n, i) => (
              <span key={i}>
                {i > 0 && <span className="text-white/50"> / </span>}
                <span data-rank-value={i + 1} data-current={rank === i + 1 ? "true" : undefined}
                  className={rank === i + 1 ? "font-black text-white underline decoration-[#e8c97a]" : "text-white/70"}>
                  {n}
                </span>
              </span>
            ))}
            {f.ratios.map((r) => (
              <span key={r.stat} className="font-bold text-white"> + {percent(r.ratio)} {ratioStatLabel(r.stat, r.label)}</span>
            ))}
          </span>
          <span aria-hidden className="journey-know-pop__step">{statedLabel(reference.child)}</span>
        </li>
      </ul>
      <p className="journey-ref-pop__note journey-ability-ref__meaning" data-testid={`${testId}-meaning`}>
        {f.damageType ? `${f.damageType[0].toUpperCase()}${f.damageType.slice(1)} damage` : "Damage"}
        {mitigation ? ` before ${mitigation}` : ""}: the value at the ability's rank, plus each % of that stat.
      </p>
    </>
  );
}

/** The tile control for an ability with a stated reference and no `!`. */
export function JourneyAbilityReference({ reference, ability, champion, testId }: {
  reference: StatedAbilityReference;
  ability: JourneyAbility;
  champion: string;
  testId: string;
}) {
  const name = reference.formula.abilityName || ability.name;
  return (
    <ReferencePopover testId={testId}
      label={`${champion} ${ability.slot}${name ? ` (${name})` : ""} damage formula, ${statedLabel(reference.child)}`}
      title={[ability.slot, name].filter(Boolean).join(" · ")}>
      <StatedReferenceLines reference={reference} rank={ability.rank} testId={testId} />
    </ReferencePopover>
  );
}
