/**
 * Post-mitigation damage band (RA7).
 *
 * The family's premise is a RELATION plus three quantities: someone casts
 * something at someone else, for a stated amount of a stated damage type,
 * against a stated resistance. Drawn as a subject — which is what the shipped
 * cinematic card does, because it is the only card that draws a champion, an
 * ability and an item row — it became a full-bleed splash of the attacker over
 * an empty "Loadout · Items" row, with the target, the numbers and the damage
 * type left in the prompt paragraph.
 *
 * This band draws the relation instead, compactly:
 *
 *     ATTACKER  [portrait] Caitlyn ·  [icon] Piltover Peacemaker
 *            →  TARGET    [portrait] Ahri  ·  [icon] Chain Vest
 *     [RAW PHYSICAL 600] [ARMOR 60 → 100]
 *
 * WHAT IT MAY SHOW. Only what the backend states as premise: role-tagged
 * entities and the RA7 `assets.premise_facts` quantities, every one of which
 * the prompt states verbatim to the same reader. It computes NOTHING — no
 * mitigation multiplier, no post-mitigation damage, no difference between the
 * two resistances, no item bonus. A number on this band is always a number the
 * question already gave away, never a step toward the answer.
 *
 * It also never receives reveal state, so its geometry is identical before
 * selection, after selection and after the reveal — there is no input that
 * could change it.
 */

import type { CombatFamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  DAMAGE_TYPE_LABEL,
  RESIST_LABEL,
  formatQuantity,
} from "@/components/quiz-broadcast/scenario-cards/questionPremiseFacts";
import {
  BandLabel,
  EntityTile,
  FactTablet,
  FamilyBandFrame,
} from "./familyBandPrimitives";

/** One side of the premise: role word, portrait, name, and what it carries. */
function Side({
  role,
  name,
  icon,
  detail,
  accent,
}: {
  role: string;
  name: string;
  icon: string | null;
  detail?: { name: string; icon: string | null; slot?: string } | null;
  accent: "gold" | "cool";
}) {
  return (
    // Full width below `sm`, so the two sides STACK on a phone and each name
    // gets the whole row instead of being truncated into half of 375px. From
    // `sm` up they share the line and the arrow points across.
    <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
      <EntityTile icon={icon} name={name} shape="round" size="lg" accent={accent} />
      <div className="min-w-0">
        <BandLabel>{role}</BandLabel>
        <div className="truncate text-sm font-bold leading-tight text-white">{name}</div>
        {detail && (
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <EntityTile icon={detail.icon} name={detail.name} size="sm" accent={accent} />
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#e8c97a]/90">
              {detail.name}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The spoken form of the premise. Every fact the band draws appears here once,
 * in the order the question states them, so a screen-reader user gets the
 * relation as a sentence rather than as a grid of nouns.
 */
export function combatSummary(layout: CombatFamilyLayout): string {
  const { attacker, target, ability, facts, targetItems } = layout;
  const resist = RESIST_LABEL[facts.damageType].toLowerCase();
  const parts: string[] = [
    ability
      ? `Attacker ${attacker.name} hits target ${target.name} with ${ability.name}.`
      : `Attacker ${attacker.name} hits target ${target.name}.`,
  ];
  if (facts.rawDamage !== undefined) {
    parts.push(
      `${formatQuantity(facts.rawDamage)} raw ${facts.damageType} damage.`,
    );
  }
  if (facts.targetResist !== undefined) {
    parts.push(
      facts.targetResistAfter !== undefined
        ? `Target ${resist} ${formatQuantity(facts.targetResist)}, rising to ${formatQuantity(facts.targetResistAfter)}.`
        : `Target ${resist} ${formatQuantity(facts.targetResist)}.`,
    );
  }
  if (targetItems.length) {
    parts.push(`Target buys ${targetItems.map((i) => i.name).join(", ")}.`);
  }
  return parts.join(" ");
}

export function PostMitigationBand({ layout }: { layout: CombatFamilyLayout }) {
  const { attacker, target, ability, facts, targetItems } = layout;
  const resistLabel = RESIST_LABEL[facts.damageType];
  // At most one target item is drawn beside the target. The premise states a
  // defensive purchase, not a build: a wrapping item row here would compete
  // with the portraits for the band's only line and is not what the question
  // is about. Any further items stay in the summary, which lists them all.
  const purchase = targetItems[0] ?? null;

  return (
    <FamilyBandFrame
      testId="family-band-combat"
      label="Combat scenario"
      summary={combatSummary(layout)}
    >
      <div className="flex flex-col gap-2">
        {/* Relation. Wraps to two rows on narrow viewports; the arrow rotates
            so the direction still reads top-to-bottom rather than pointing off
            the side of a stacked layout. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <Side
            role="Attacker"
            name={attacker.name}
            icon={attacker.icon}
            accent="gold"
            detail={ability ? { name: ability.name, icon: ability.icon } : null}
          />
          <span
            data-testid="combat-arrow"
            className="shrink-0 rotate-90 text-base font-black leading-none text-[#d4b35a] sm:rotate-0"
          >
            →
          </span>
          <Side
            role="Target"
            name={target.name}
            icon={target.icon}
            accent="cool"
            detail={purchase ? { name: purchase.name, icon: purchase.icon } : null}
          />
        </div>

        {/* Stated quantities. Never a computed one. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {facts.rawDamage !== undefined && (
            <FactTablet
              testId="fact-raw-damage"
              label={`Raw ${DAMAGE_TYPE_LABEL[facts.damageType]}`}
              value={formatQuantity(facts.rawDamage)}
            />
          )}
          {facts.targetResist !== undefined && (
            <FactTablet
              testId="fact-resist"
              label={resistLabel}
              value={
                facts.targetResistAfter !== undefined ? (
                  <>
                    {formatQuantity(facts.targetResist)}
                    <span className="px-1 font-black text-[#d4b35a]">→</span>
                    {formatQuantity(facts.targetResistAfter)}
                  </>
                ) : (
                  formatQuantity(facts.targetResist)
                )
              }
            />
          )}
        </div>
      </div>
    </FamilyBandFrame>
  );
}
