import type { EnvironmentSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioTitle } from "./primitives";
import {
  ATMOSPHERE_DIM_SCENE,
  ATMOSPHERE_JUNGLE_GROUND,
  PanelFiligree,
  SUBJECT_MEDIA_GRADIENT,
  SubjectFocalZone,
  SubjectMediaBackdrop,
  SubjectMediaCaption,
} from "./SubjectMediaComposition";
import academyHall from "@/assets/ranked/academy-hall.jpg";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";

/**
 * Environment card — the third consumer of the shared subject-media
 * composition, after the item and the summoner spell.
 *
 * WHY IT IS NOT A NEW CARD LANGUAGE
 * It is the same picture. Every layer — the lit ground, the oversized echo of
 * the subject's OWN portrait, the gold medallion with its rings, cardinal
 * diamonds and flourishes, the focal icon, the corner filigree, the bottom
 * ornament, the readability gradient and the `[data-subject-media]` sizing
 * tokens — comes from `SubjectMediaComposition.tsx` by CALL, not by copy. The
 * summoner-spell pass established that precedent deliberately; this pass is
 * the proof it generalises. Nothing in this file draws geometry.
 *
 * WHAT IT REPLACES
 * A caster minion is a 128x128 opaque portrait, the same shape of asset as an
 * item icon. It used to reach `CollectibleCard`, which draws that portrait at
 * `max(11cqmin, 2.5rem)` — a ~19px tile in the live Ranked band — inside a
 * frame that is otherwise empty. That is the pre-RIV2 item card exactly, and
 * it gets the post-RIV2 answer: the portrait becomes the focal subject at
 * `--subject-hero-icon`, roughly 4x the area, and the same art washes across
 * the left of the panel as the echo.
 *
 * THE ONE DELIBERATE DIFFERENCE FROM ITS SIBLINGS
 * The atmosphere art is the Academy hall rather than the shopkeeper or the
 * spellbook, seated with ATMOSPHERE_DIM_SCENE. That is an ASSET decision, not
 * a design one, and the preset carries the measurement behind it.
 *
 * DISCLOSURE
 * Four of these families ask HOW MANY minions a wave holds and the rest ask
 * for a base stat, so every answer in the family is a number. No number
 * reaches this card: `EnvironmentSubject` has no field one could arrive in,
 * and the art stays a SINGLE-UNIT portrait — the MAA1 Phase 4 rule — so the
 * picture cannot be counted either.
 */
export function EnvironmentScenarioCard({ subject }: { subject: EnvironmentSubject }) {
  // "Caster Minion" under a MINION chip: the class is the specific thing and
  // the family is the context, which is the same order the item card states
  // its own name and kind in. The chip is never the whole card any more, so it
  // no longer has to carry meaning it cannot hold.
  //
  // One entry per FAMILY the reader admits, and the table is exhaustive by
  // construction (`Record<EnvironmentSubject["kind"], string>`), so a future
  // family cannot reach this card without a deliberate line here. What must
  // never appear is a row per ENTITY: "Turret", "Inhibitor" and "Nexus" all
  // land on STRUCTURE, and their own names arrive in `subject.name` from the
  // backend, which is the only thing that knows them.
  const KIND_LABELS: Record<EnvironmentSubject["kind"], string> = {
    minion: "Minion",
    objective: "Objective",
    structure: "Structure",
    jungle_pet: "Jungle Companion",
  };
  const kindLabel = KIND_LABELS[subject.kind];
  // JPM1 — a jungle companion sits on the Jungle Systems ground rather than
  // the Academy hall, and its caption states the FORM the backend resolved.
  const jungle = subject.kind === "jungle_pet";
  const kindLine = jungle
    ? subject.form === "evolved"
      ? "Evolved Companion"
      : subject.form === "base"
        ? "Companion"
        : kindLabel
    : kindLabel;

  return (
    <ScenarioCardFrame
      // A minion portrait is a small square, not a splash. Pushing it through
      // the frame's full-bleed crop would be a hugely upscaled 128px asset;
      // the portrait is the SUBJECT and is drawn as one, inside the shared
      // composition — the same call the item and spell cards make.
      backgroundUrl={null}
      backgroundAlt={subject.name}
      backgroundSlot={
        <SubjectMediaBackdrop
          echoIcon={subject.icon}
          atmosphereSrc={jungle ? JUNGLE_GRASS_BACKGROUND : academyHall}
          atmosphereSeating={jungle ? ATMOSPHERE_JUNGLE_GROUND : ATMOSPHERE_DIM_SCENE}
        />
      }
      gradientClass={SUBJECT_MEDIA_GRADIENT}
    >
      <ScenarioBadge>{kindLabel}</ScenarioBadge>

      {/* The caption is a title and one kind line — a FOOTER, not a stack — so
          this takes the item card's centred proportions exactly. `beside` is
          the summoner spell's accommodation for its source rows and there is
          nothing here to sit beside. */}
      <SubjectFocalZone iconUrl={subject.icon} alt={subject.name} />

      <PanelFiligree />

      <SubjectMediaCaption>
        <ScenarioTitle>{subject.name}</ScenarioTitle>
        {/* Suppressed when the name already ENDS in the kind — "Caster Minion"
            under a "MINION" line reads as a bug, and the badge above already
            states the family. "Baron Nashor" keeps its OBJECTIVE line, because
            there the kind is the only place the family is named. */}
        {!subject.name.toLowerCase().endsWith(kindLine.toLowerCase()) && (
          <div className="mt-[0.4cqmin] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-semibold uppercase tracking-[0.24em] text-white/70">
            {kindLine}
          </div>
        )}
      </SubjectMediaCaption>
    </ScenarioCardFrame>
  );
}
