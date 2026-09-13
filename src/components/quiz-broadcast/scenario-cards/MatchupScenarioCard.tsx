import { useMemo, useState } from "react";
import { getChampionSplash, useChampionAssets } from "@/hooks/useChampionAssets";
import type { MatchupSubject } from "./types";
import { ScenarioCardFrame } from "./ScenarioCardFrame";
import { ConditionChip, ScenarioBadge, ScenarioDivider, ScenarioSubject } from "./primitives";

/**
 * Matchup card — "Champion A versus Champion B".
 *
 * WHY IT IS A CARD AND NOT A DASHBOARD
 * A Matchup Slice question is still a Ranked question: one prompt, one answer,
 * inside the same parchment folio as every other round. What makes it a matchup
 * is that the SUBJECT is a pair, so the only thing that differs from
 * `CombatCalculationScenarioCard` is that the media region carries two
 * champions at balanced weight instead of one. Everything else — the frame, the
 * Ken Burns pan, the gold hairline, the badge, the condition chips, the
 * bottom-anchored information stack, the answer tablets outside — is the shared
 * language, composed from the same primitives.
 *
 * BALANCED WEIGHT, LITERALLY
 * The two splashes are a 50/50 split of the same background layer, so neither
 * side is the "real" subject and the other a decoration. Each is cropped with
 * the frame's own head-safe anchor logic, mirrored inward so both champions
 * face the centre line rather than the outer edges.
 *
 * SPOILER SAFETY
 * A comparison question asks WHICH SIDE is higher. Drawing both sides equally,
 * with the same treatment and no ordering cue beyond the premise's own A/B, can
 * therefore never narrow the answer — and the card never receives the metric's
 * VALUES, only its name. The dimension label says what is being compared; it
 * does not say who wins.
 */
export function MatchupScenarioCard({ subject }: { subject: MatchupSubject }) {
  const { data: championManifest } = useChampionAssets();
  const [failedA, setFailedA] = useState(false);
  const [failedB, setFailedB] = useState(false);

  const splashA = useMemo(
    () => (!failedA && subject.championASplash) || getChampionSplash(championManifest, subject.championA),
    [failedA, subject.championASplash, subject.championA, championManifest],
  );
  const splashB = useMemo(
    () => (!failedB && subject.championBSplash) || getChampionSplash(championManifest, subject.championB),
    [failedB, subject.championBSplash, subject.championB, championManifest],
  );

  // Both names or neither: a card that named one side's ability and fell back
  // to "Ability W" for the other would be the exact emphasis this card refuses.
  const abilityPair =
    subject.abilityNameA && subject.abilityNameB
      ? `${subject.abilityNameA} vs ${subject.abilityNameB}`
      : null;
  const abilitySubtitle = subject.abilitySlot ? `Ability ${subject.abilitySlot}` : "Both champions";

  return (
    <ScenarioCardFrame
      backgroundUrl={null}
      backgroundAlt={`${subject.championA} versus ${subject.championB}`}
      // The same bottom-up scrim as the gold standard, but it CLEARS EARLIER.
      // Combat Calculation needs ink up to ~64% because it stacks four rows
      // (title, ability, chips, loadout) over the art. A matchup stacks two
      // champion names on ONE line plus chips, so carrying the same scrim
      // buried both splashes in the exact band where their faces are. The
      // stops are the gold standard's, compressed into the shorter stack.
      gradientClass="bg-[linear-gradient(to_top,rgba(3,2,2,0.94)_0%,rgba(3,2,2,0.78)_22%,rgba(3,2,2,0.3)_38%,transparent_52%)]"
      backgroundSlot={
        <div className="flex h-full w-full">
          <SplashHalf
            url={splashA}
            alt={subject.championA}
            onError={() => setFailedA(true)}
            side="left"
          />
          <SplashHalf
            url={splashB}
            alt={subject.championB}
            onError={() => setFailedB(true)}
            side="right"
          />
        </div>
      }
    >
      <ScenarioBadge>{subject.badge ?? "Matchup"}</ScenarioBadge>

      {/* The seam. A hairline and a VS mark on the centre line, so the split
          reads as one composed card rather than two cards pushed together. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#d4b35a]/45 to-transparent" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d4b35a]/50 bg-black/70 px-[max(1.4cqmin,calc(0.44*var(--sc-fit)))] py-[max(0.5cqmin,calc(0.16*var(--sc-fit)))] text-[max(1.1cqmin,calc(0.6*var(--sc-fit)))] font-black uppercase leading-none tracking-[0.2em] text-[#e8c97a] backdrop-blur-sm"
      >
        VS
      </div>

      {/* Same geometry as CombatCalculationScenarioCard's stack: bottom
          anchored, 7% side gutters, padding in cqh so it resolves against the
          band's HEIGHT rather than its width. */}
      <div className="absolute inset-x-0 bottom-0 px-[7%] pb-[8.89cqh]">
        <div className="flex items-end gap-[max(1.5cqmin,calc(0.5*var(--sc-fit)))]">
          <SideTitle name={subject.championA} align="left" />
          <SideTitle name={subject.championB} align="right" />
        </div>

        {/* The ability under comparison, when the premise names one.
            Both sides share the SLOT and not the NAME, so when the premise
            carries both names the title states both — in premise order, drawn
            identically, so the card still favours neither. When it carries
            neither (a payload frozen before the pair existed, or a store that
            does not name the slot) the old single label is the fallback, and
            the subtitle carries the "whose is it" the title no longer says. */}
        {(abilityPair || subject.abilityName) && (
          <ScenarioSubject
            iconUrl={subject.abilityIcon}
            slotBadge={subject.abilitySlot}
            title={abilityPair ?? (subject.abilityName as string)}
            // With two real names the slot badge is already beside the title,
            // so the subtitle names the SLOT rather than repeating it. Without
            // them the title is the literal "Ability W" and the subtitle says
            // whose it is — which is the fact the single-champion card gets
            // for free and this one does not.
            subtitle={abilityPair ? abilitySubtitle : "Both champions"}
          />
        )}

        {(subject.metricLabel || subject.level != null || subject.abilityRank != null) && (
          <div className="mt-[5.33cqh] flex flex-wrap gap-[max(0.8cqmin,calc(0.25*var(--sc-fit)))]">
            {subject.metricLabel && <ConditionChip label="Compare" value={subject.metricLabel} />}
            {subject.level != null && <ConditionChip label="Level" value={subject.level} />}
            {subject.abilityRank != null && <ConditionChip label="Rank" value={subject.abilityRank} />}
          </div>
        )}

        <ScenarioDivider />
      </div>
    </ScenarioCardFrame>
  );
}

/**
 * One half of the split background.
 *
 * `objectPosition` mirrors the frame's own head-safe anchor: the same 12%
 * vertical crop that keeps a champion's face in frame in a wide band, with the
 * horizontal anchor turned inward per side so both champions look toward the
 * centre seam instead of off the outer edges.
 */
function SplashHalf({
  url,
  alt,
  onError,
  side,
}: {
  url: string | null;
  alt: string;
  onError: () => void;
  side: "left" | "right";
}) {
  if (!url) {
    return <div className="h-full w-1/2 bg-gradient-to-br from-slate-900 to-slate-800" />;
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={onError}
      className="h-full w-1/2 object-cover"
      // A HALF-width crop is a much tighter window than the frame's full-width
      // one, so the frame's 60% anchor lands on a champion's shoulder rather
      // than their face. Each side is pulled toward the art's own centre — where
      // the character actually is — and slightly higher, since the shorter
      // matchup stack leaves the upper band visible.
      style={{ objectPosition: side === "left" ? "48% 8%" : "52% 8%" }}
      loading="eager"
      decoding="async"
    />
  );
}

/** One side's champion name, at the same weight as the gold standard's title. */
function SideTitle({ name, align }: { name: string; align: "left" | "right" }) {
  return (
    <div
      className={`min-w-0 flex-1 truncate text-[max(2.1cqmin,calc(0.875*var(--sc-fit)))] font-black uppercase leading-[min(1.5rem,1.25em)] tracking-[0.05em] text-white drop-shadow-[0_3px_14px_rgba(0,0,0,0.85)] ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {name}
    </div>
  );
}
