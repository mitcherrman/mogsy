import type { StatComparisonSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ScenarioBadge, ScenarioTitle } from "./primitives";
import {
  ATMOSPHERE_DIM_SCENE,
  PanelFiligree,
  SUBJECT_MEDIA_GRADIENT,
  SubjectFocalZone,
  SubjectMediaBackdrop,
  SubjectMediaCaption,
} from "./SubjectMediaComposition";
import academyHall from "@/assets/ranked/academy-hall.jpg";
import { STAT_COMPARISON_FALLBACK_ART } from "./statComparisonArt";

/**
 * CSP1 — the premise of a roster-wide stat superlative ("At level 1, which
 * champion has the highest Armor?").
 *
 * The ANSWER is a champion, so no champion may be drawn here. What the prompt
 * names is the stat and the level, and that is all this card can show:
 * `StatComparisonSubject` has no champion and no value field. The four
 * champion icons stay on the answer options, symmetric.
 *
 * Same shared subject-media composition as the item/spell/environment cards,
 * by call. The focal art is the stat's owner-locked mnemonic, or the existing
 * neutral stat art (Attack Range: `range.png`). If that image fails to load,
 * the existing neutral `scale.png` is drawn — never the generic "?".
 */
export function StatComparisonScenarioCard({ subject }: { subject: StatComparisonSubject }) {
  return (
    <ScenarioCardFrame
      backgroundUrl={null}
      backgroundAlt={subject.statName}
      backgroundSlot={
        <SubjectMediaBackdrop
          echoIcon={subject.icon}
          atmosphereSrc={academyHall}
          atmosphereSeating={ATMOSPHERE_DIM_SCENE}
        />
      }
      gradientClass={SUBJECT_MEDIA_GRADIENT}
    >
      <ScenarioBadge>{subject.badge}</ScenarioBadge>

      <SubjectFocalZone
        iconUrl={subject.icon}
        alt={subject.statName}
        fallback={
          <img
            data-stat-comparison-fallback
            src={STAT_COMPARISON_FALLBACK_ART}
            alt=""
            className="h-full w-full object-contain p-[12%]"
          />
        }
      />

      <PanelFiligree />

      <SubjectMediaCaption>
        <ScenarioTitle>{subject.statName}</ScenarioTitle>
        <div
          data-stat-comparison-level
          className="mt-[0.4cqmin] text-[max(0.95cqmin,calc(0.625*var(--sc-fit)))] leading-[min(1.5rem,1.25em)] font-semibold uppercase tracking-[0.24em] text-white/70"
        >
          Level {subject.level}
        </div>
      </SubjectMediaCaption>
    </ScenarioCardFrame>
  );
}
