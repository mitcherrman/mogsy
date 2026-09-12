import { useMemo } from "react";
import type { ScenarioSectionData, SummonerSpellSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import {
  ConditionChip,
  ScenarioBadge,
  ScenarioDivider,
  ScenarioSection,
  ScenarioTitle,
} from "./primitives";
import {
  ATMOSPHERE_WIDE_SCENE,
  PanelFiligree,
  SUBJECT_MEDIA_GRADIENT,
  SubjectFocalZone,
  SubjectMediaBackdrop,
  SubjectMediaCaption,
} from "./SubjectMediaComposition";
import spellcaster from "@/assets/ranked/Spellcaster.jpg";

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
 * The media panel is the SHARED subject-media composition the item-primary
 * card is built from (SubjectMediaComposition.tsx) — the same lit ground, the
 * same oversized echo of the subject's own icon, the same gold medallion and
 * focal icon, the same corner filigree and bottom ornament, the same
 * readability gradient and the same `[data-subject-media]` sizing tokens. It
 * is not a spell-shaped copy of that card: both cards call the same functions.
 *
 * Before this, the spell had the exact problem the item card had before RIV2 —
 * a 64px icon alone in a ~700x310 panel, over a 12%-opacity ghost, reading as
 * an empty box. It now gets the same picture.
 *
 * THE ONE DELIBERATE DIFFERENCE
 * The atmosphere art is `Spellcaster.jpg` rather than the item shopkeeper.
 * It is seated with ATMOSPHERE_WIDE_SCENE rather than ATMOSPHERE_TALL_CUTOUT
 * for a reason that is about the ASSET, not the design: the shopkeeper is a
 * tall alpha cut-out of a figure, and this is an opaque 320x180 landscape.
 * Seating it by height the way the shopkeeper is seated would upscale a
 * 320px-wide source past 880px. Same layer, same mask, same opacity, same
 * role — sized to the art it actually is.
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

  const badge = subject.badge ?? "Summoner Spell";
  // Whether the caption carries more than a title: the haste chip, the divider
  // and the source rows together are what can reach the focal icon on a phone.
  const hasStack = subject.totalHaste != null || sections.length > 0;

  return (
    <ScenarioCardFrame
      // A summoner spell is a small square icon, not a splash. Pushing it
      // through the frame's full-bleed champion crop would be a hugely
      // upscaled photograph of a 64px asset; the icon is the SUBJECT here and
      // is drawn as one, inside the shared subject-media composition.
      backgroundUrl={null}
      backgroundAlt={subject.spell}
      // The same panel the item-primary card is built from — see
      // SubjectMediaComposition.tsx. The echo is the spell's own icon, and the
      // atmospheric art is the spellcaster's book, seated as a wide scene
      // because the asset is a 320x180 landscape rather than a tall cut-out.
      backgroundSlot={
        <SubjectMediaBackdrop
          echoIcon={subject.spellIcon}
          atmosphereSrc={spellcaster}
          atmosphereSeating={ATMOSPHERE_WIDE_SCENE}
        />
      }
      gradientClass={SUBJECT_MEDIA_GRADIENT}
    >
      <ScenarioBadge>{badge}</ScenarioBadge>

      {/* A spell with haste sources stacks four rows under the title. That
          stack is a column running most of the band's height, so the icon is
          centred in the panel's RIGHT half to sit beside it rather than on top
          of it. With no sources the caption is a title alone and the card
          carries the item card's own centred proportions exactly. */}
      <SubjectFocalZone
        iconUrl={subject.spellIcon}
        alt={subject.spell}
        beside={hasStack}
      />

      <PanelFiligree />

      <SubjectMediaCaption>
        <ScenarioTitle>{subject.spell}</ScenarioTitle>
        {/* The caption the item card carries under its title. It is suppressed
            when the badge above ALREADY says exactly this, because a caption
            repeating its own chip reads as a bug — the SSM slice can override
            the badge, and in that case the caption is the only place the
            subject's kind is stated. */}
        {badge !== "Summoner Spell" && (
          <div className="mt-[0.4cqmin] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-semibold uppercase tracking-[0.24em] text-white/70">
            Summoner Spell
          </div>
        )}

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
      </SubjectMediaCaption>
    </ScenarioCardFrame>
  );
}
