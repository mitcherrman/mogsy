import type { EnvironmentScene, EnvironmentSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioTitle } from "./primitives";
import {
  ATMOSPHERE_DIM_SCENE,
  ATMOSPHERE_JUNGLE_GROUND,
  ATMOSPHERE_SCENE_GROUND,
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
/**
 * ENVVIS1 Batch 1 — the card takes a SUBJECT or a SCENE, never both.
 *
 * Expressed as a discriminated prop union rather than two optional props, so
 * `<EnvironmentScenarioCard subject={...} scene={...} />` is a type error at
 * the call site. That mirrors the backend, where `PublicPresentation` refuses
 * a subject and a scene at once for the same reason: they are two different
 * claims about what the reader is looking at, and a card that made both would
 * be making one of them falsely.
 *
 * Every existing call site passes `subject` and is untouched.
 */
export type EnvironmentCardProps =
  | { subject: EnvironmentSubject; scene?: never }
  | { scene: EnvironmentScene; subject?: never };

export function EnvironmentScenarioCard(props: EnvironmentCardProps) {
  if (props.scene) return <EnvironmentSceneBody scene={props.scene} />;
  return <EnvironmentSubjectBody subject={props.subject} />;
}

/**
 * The SCENE branch: a place, drawn as the whole panel.
 *
 * WHAT IT SHARES WITH ITS SIBLING, AND WHY THAT MATTERS
 * The frame, the Ken Burns pan, the vignette, the readability gradient, the
 * corner filigree, the badge, the caption block and its typography all come
 * from the same two modules the subject branch calls. Nothing here draws
 * geometry, and nothing here is a second card language: a reader moving from
 * a turret round to a fountain round sees the same panel with a different
 * picture in it, which is the point.
 *
 * TWO SHAPES, ONE BRANCH
 * A scene may carry a FOREGROUND — the shared minion art on a wave question,
 * the default turret art on a structure one. When it does, that object takes
 * the same `SubjectFocalZone` medallion an entity subject would, so a
 * lane+minion card and a turret-portrait card are the same composition with a
 * different background behind them.
 *
 * When it does not (`base_fountain` today), there is no medallion. Drawing one
 * empty, or around a "?", would be the gold-framed empty rectangle this whole
 * composition exists to remove — so the background carries the card alone and
 * the caption is the only foreground.
 *
 * The echo layer is `null` in BOTH shapes. An echo is an oversized wash of the
 * subject's own icon, used to light the panel's left when the subject IS the
 * picture. Here the background is the picture and already fills the panel; a
 * wash of the foreground over it would be a second copy of the same object.
 *
 * DISCLOSURE
 * This branch receives `id`, `name`, `caption` and up to two image URLs. There
 * is no field on `EnvironmentScene` a number, a count or a team could arrive
 * in, so whatever a row answers with, the card cannot state it. Which art a
 * row gets is the backend's reviewed decision (`quiz.environment_scene_assets`,
 * and the owner's art direction recorded there); which file an id draws is the
 * art table in `lib/question-surface/environmentScenes.ts`.
 */
function EnvironmentSceneBody({ scene }: { scene: EnvironmentScene }) {
  return (
    <ScenarioCardFrame
      // Same reasoning as the subject branch: the picture is composed in the
      // background slot, not pushed through the frame's splash crop.
      backgroundUrl={null}
      backgroundAlt={scene.name}
      backgroundSlot={
        <SubjectMediaBackdrop
          // No echo in either shape — see the branch note above.
          echoIcon={null}
          atmosphereSrc={scene.art}
          atmosphereSeating={ATMOSPHERE_SCENE_GROUND}
        />
      }
      gradientClass={SUBJECT_MEDIA_GRADIENT}
    >
      {/* A FAMILY word, not an entity and not the scene's own name. The
          badge says what kind of card this is ("Environment"); `scene.name`
          below says which place. Deliberately not "Scene", which is an
          implementation word the reader has no use for. */}
      <ScenarioBadge>Environment</ScenarioBadge>

      {/* The SAME medallion the entity-subject branch draws, called rather
          than copied, so the contextual object is seated and sized exactly as
          a turret portrait already is on its own rows. */}
      {scene.foreground && (
        <SubjectFocalZone iconUrl={scene.foreground} alt={scene.foregroundAlt || scene.name} />
      )}

      <PanelFiligree />

      <SubjectMediaCaption>
        <ScenarioTitle>{scene.name}</ScenarioTitle>
        {/* Suppressed when the caption would restate the title, the same rule
            the subject branch applies to its kind line. */}
        {scene.caption && scene.caption.toLowerCase() !== scene.name.toLowerCase() && (
          <div className="mt-[0.4cqmin] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-semibold uppercase tracking-[0.24em] text-white/70">
            {scene.caption}
          </div>
        )}
      </SubjectMediaCaption>
    </ScenarioCardFrame>
  );
}

function EnvironmentSubjectBody({ subject }: { subject: EnvironmentSubject }) {
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
