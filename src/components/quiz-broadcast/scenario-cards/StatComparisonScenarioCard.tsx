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
 * by call. The focal art is the stat's owner-locked mnemonic; a stat without
 * one (or an image that fails to load) draws a neutral comparison glyph —
 * never the generic "?".
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
        fallback={<StatComparisonGlyph />}
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

/**
 * Neutral comparison mark: four bars of rising height, none highlighted, in
 * the medallion's gold. It says "compare a quantity" and nothing about which
 * entry wins.
 */
export function StatComparisonGlyph() {
  return (
    <svg
      data-stat-comparison-glyph
      viewBox="0 0 64 64"
      aria-hidden
      className="h-[62%] w-[62%] text-[#e8c97a]"
    >
      {[
        [10, 38],
        [22, 28],
        [34, 20],
        [46, 12],
      ].map(([x, y]) => (
        <rect key={x} x={x} y={y} width="8" height={54 - y} rx="1.5" fill="currentColor" opacity="0.8" />
      ))}
      <rect x="6" y="54" width="52" height="2.5" rx="1.25" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
