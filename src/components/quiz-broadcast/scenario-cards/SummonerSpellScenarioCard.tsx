import { useMemo } from "react";
import type { ScenarioSectionData, SummonerSpellSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import {
  ConditionChip,
  ScenarioBadge,
  ScenarioDivider,
  ScenarioHeroIcon,
  ScenarioSection,
  ScenarioTitle,
} from "./primitives";

/**
 * Summoner Spell card — the SSM mastery slice's subject.
 *
 * WHY THIS EXISTS RATHER THAN `CollectibleCard`
 * `CollectibleCard` draws ONE framed icon and nothing else. That is a complete
 * card for "which rune is this?", and a semantically incomplete one for the
 * slice, whose questions are "Barrier has a 180s base cooldown; you are running
 * Cosmic Insight and Ionian Boots of Lucidity; what is the cooldown now?" — a
 * premise with a subject, two named sources and a stated total. Routing the
 * slice into a single-icon card would have been the cheap answer to the wrong
 * question.
 *
 * WHY IT IS NOT A NEW SYSTEM EITHER
 * It is pure composition of the same primitives the gold standard uses, in the
 * same four slots and the same bottom-anchored geometry:
 *
 *   ScenarioBadge      SUMMONER SPELL          (type chip, over clean art)
 *   ScenarioHeroIcon   the spell               (WHO — the subject itself)
 *   ScenarioTitle      the spell's name
 *   ConditionChip      Haste                   (UNDER WHAT CONDITIONS)
 *   ScenarioDivider    gold hairline
 *   ScenarioSection    Haste Sources           (USING WHAT — rune and/or boots)
 *
 * A summoner spell has no splash art, which is exactly the case
 * `ScenarioHeroIcon` was written for — and this is its first consumer, so it
 * was floored in the same commit.
 *
 * DISCLOSURE
 * Every phase's answer is a COOLDOWN, and no cooldown reaches this card: the
 * backend emits the spell, the sources and the haste the prompt already states,
 * and nothing else. The base-cooldown phase — whose answer is the base cooldown
 * — arrives with no sources and no haste, so it draws the spell alone.
 */
export function SummonerSpellScenarioCard({
  subject,
}: {
  subject: SummonerSpellSubject;
}) {
  const sections = useMemo<ScenarioSectionData[]>(() => {
    // Absent for an ordinary summoner-spell question (`summoner_spell_cooldown`),
    // whose premise is the spell and nothing else — the same empty case the SSM
    // slice's base-cooldown phase already produces, and for the same reason.
    const sources = subject.sources ?? [];
    if (!sources.length) return [];
    return [
      {
        title: "Haste Sources",
        entries: sources.map((source) => ({
          icon: source.icon,
          title: source.name,
          // The kind is DECLARED by the backend rather than guessed from the
          // name, so a rune can never be labelled as an item.
          subtitle: source.kind === "rune" ? "Rune" : "Item",
        })),
      },
    ];
  }, [subject.sources]);

  return (
    <ScenarioCardFrame
      // A summoner spell is a small square icon, not a splash. Pushing it
      // through the frame's full-bleed champion crop would be a hugely
      // upscaled photograph of a 64px asset; the icon is the SUBJECT here and
      // is drawn as one, over the frame's own ground.
      backgroundUrl={null}
      backgroundAlt={subject.spell}
      // The gold standard's scrim, cleared a little earlier: this card stacks
      // three rows over the art rather than four, and the focal icon sits in
      // the upper zone where a champion's face would be.
      gradientClass="bg-[linear-gradient(to_top,rgba(3,2,2,0.95)_0%,rgba(3,2,2,0.8)_26%,rgba(3,2,2,0.35)_44%,transparent_58%)]"
    >
      {/* Ground. Without one this card falls to the frame's flat slate
          gradient, which reads noticeably thinner than the gold standard's
          full-bleed splash beside it in the same match. The spell's own icon,
          blurred and faint, gives the card a ground made of its own subject —
          the technique already shipped elsewhere in this folder, and the only
          asset the payload has. Decorative: it is `aria-hidden`, and the
          legible copy is the focal icon and the stack below. */}
      {subject.spellIcon && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={subject.spellIcon}
            alt=""
            className="absolute left-1/2 top-[38%] h-[max(46cqmin,calc(26*var(--sc-fit)))] w-[max(46cqmin,calc(26*var(--sc-fit)))] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-[max(4cqmin,calc(2.5*var(--sc-fit)))] object-cover opacity-[0.12] blur-md saturate-[1.2]"
          />
        </div>
      )}

      <ScenarioBadge>{subject.badge ?? "Summoner Spell"}</ScenarioBadge>

      <ScenarioHeroIcon iconUrl={subject.spellIcon} alt={subject.spell} />

      {/* Same stack geometry as CombatCalculationScenarioCard: bottom
          anchored, 7% gutters, padding in cqh so it resolves against the
          band's HEIGHT rather than its width. */}
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[8.89cqh]">
        {/* No "Summoner Spell" sub-label under the title: the badge above
            already says exactly that, and a caption repeating its own chip
            reads as a bug. This mirrors the gold standard, where the badge says
            "Combat Calculation" and the title is the champion name alone. */}
        <ScenarioTitle>{subject.spell}</ScenarioTitle>

        {subject.totalHaste != null && (
          <div className="mt-[5.33cqh] flex flex-wrap gap-[max(0.8cqmin,calc(0.25*var(--sc-fit)))]">
            <ConditionChip label="Haste" value={subject.totalHaste} />
          </div>
        )}

        {sections.length > 0 && (
          <>
            <ScenarioDivider />
            {sections.map((section) => (
              <ScenarioSection key={section.title} section={section} />
            ))}
          </>
        )}
      </div>
    </ScenarioCardFrame>
  );
}
