/**
 * JOURNEY-PRES-V1 — the current question's focus object, drawn large on the
 * parchment's otherwise empty lower half.
 *
 * WHAT is drawn is decided by `journeyFocusMediaFor` (pure, pre-reveal
 * presentation only — see `lib/journey/focusMedia.ts`). This file only draws
 * it. It is decorative support for the question, never a second copy of it:
 * every word it prints (champion, ability, rank, metric) is already in the
 * prompt, and nothing here can name an answer.
 *
 * LAYOUT. The slot is the LAST child of the Journey question and takes only
 * the height the question leaves over (`.journey-focus-slot`, index.css). On a
 * height-locked desktop card that can be nothing: the slot is a size
 * container, and below a usable height the plate is hidden rather than
 * squeezed or scrolled into. It can never push the prompt, the answers or the
 * lock-in button, and it never overlaps them — it is in flow, after them.
 */
import { useMemo, useState } from "react";
import { journeyFocusMediaFor, type FocusChampion, type FocusMediaInput, type JourneyFocusMedia as Model } from "@/lib/journey/focusMedia";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";

/** Decorative art: the whole figure is `aria-hidden`, the prompt says it all. */
function Img({ src, className }: { src: string | null; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img src={src} alt="" draggable={false} loading="lazy" decoding="async"
      onError={() => setBroken(true)} className={className} />
  );
}

/** The champion's splash as a darkened, masked underlay. Decorative. */
function Splash({ champion }: { champion: FocusChampion }) {
  const assets = useMasteryAssets();
  const src = champion.splash ?? assets.championSplashUrl?.(champion.name.toLowerCase(), champion.name) ?? null;
  return (
    <span aria-hidden className="journey-focus-media__splash">
      <Img src={src} className="h-full w-full object-cover" />
    </span>
  );
}

function Portrait({ champion }: { champion: FocusChampion }) {
  const assets = useMasteryAssets();
  const src = champion.icon ?? assets.championIconUrl(champion.name.toLowerCase(), champion.name);
  return (
    <span className="journey-focus-media__portrait">
      <Img src={src} className="h-full w-full object-cover" />
    </span>
  );
}

function AbilityPlate({ m }: { m: Extract<Model, { kind: "ability" }> }) {
  return (
    <>
      <Splash champion={m.champion} />
      <span className="journey-focus-media__hero journey-focus-media__hero--ability">
        <Img src={m.abilityIcon} className="h-full w-full object-cover" />
        {m.abilitySlot && <span aria-hidden className="journey-focus-media__slot">{m.abilitySlot}</span>}
      </span>
      <span className="journey-focus-media__caption">
        <span className="journey-focus-media__who">
          <Portrait champion={m.champion} />
          <span className="truncate">{m.champion.name}</span>
        </span>
        {m.abilityName && <span className="journey-focus-media__what truncate">{m.abilityName}</span>}
        {m.abilityRank !== null && <span className="journey-focus-media__meta">Rank {m.abilityRank}</span>}
      </span>
    </>
  );
}

function ChampionPlate({ m }: { m: Extract<Model, { kind: "champion" }> }) {
  return (
    <>
      <Splash champion={m.champion} />
      <span className="journey-focus-media__hero journey-focus-media__hero--champion">
        <Portrait champion={m.champion} />
      </span>
      <span className="journey-focus-media__caption">
        <span className="journey-focus-media__what truncate">{m.champion.name}</span>
        {(m.label || m.level !== null) && (
          <span className="journey-focus-media__meta">
            {[m.label, m.level !== null ? `Level ${m.level}` : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </>
  );
}

function ItemPlate({ m }: { m: Extract<Model, { kind: "item" }> }) {
  return (
    <>
      <span className="journey-focus-media__hero journey-focus-media__hero--item">
        <Img src={m.icon} className="h-full w-full object-cover" />
      </span>
      <span className="journey-focus-media__caption">
        <span className="journey-focus-media__what truncate">{m.name}</span>
      </span>
    </>
  );
}

function MatchupPlate({ m, playerChampion }: { m: Extract<Model, { kind: "matchup" }>; playerChampion: string | null }) {
  // The comparison's A/B order is the backend's; the board's is subject left.
  // Follow the board (as `JourneyMatchupSides` does), so a champion never
  // changes sides between the board, the side tiles and this plate.
  const swap = playerChampion !== null && m.b.name === playerChampion;
  const left = swap ? { c: m.b, ability: m.abilityNameB } : { c: m.a, ability: m.abilityNameA };
  const right = swap ? { c: m.a, ability: m.abilityNameA } : { c: m.b, ability: m.abilityNameB };
  const half = (s: typeof left, side: "left" | "right") => (
    <span className={`journey-focus-media__half journey-focus-media__half--${side}`}
      data-testid={`journey-focus-matchup-${side}`} data-champion={s.c.name}>
      <Splash champion={s.c} />
      <span className="journey-focus-media__half-id">
        <Portrait champion={s.c} />
        <span className="min-w-0">
          <span className="journey-focus-media__what block truncate">{s.c.name}</span>
          {s.ability && (
            <span className="journey-focus-media__meta block truncate">
              {m.abilitySlot ? `${m.abilitySlot} · ` : ""}{s.ability}
            </span>
          )}
        </span>
      </span>
    </span>
  );
  return (
    <>
      {half(left, "left")}
      <span aria-hidden className="journey-focus-media__vs">
        <span>VS</span>
        {m.metricLabel && <span className="journey-focus-media__vs-metric">{m.metricLabel}</span>}
      </span>
      {half(right, "right")}
    </>
  );
}

export function JourneyFocusMedia({ challenge, playerChampion = null }: {
  /** Only the pre-reveal presentation is visible to this component. */
  challenge: FocusMediaInput;
  playerChampion?: string | null;
}) {
  const model = useMemo(
    () => journeyFocusMediaFor({ presentation: challenge.presentation, challengeIndex: challenge.challengeIndex }),
    [challenge.presentation, challenge.challengeIndex],
  );
  if (!model) return null;
  return (
    <div className="journey-focus-slot" data-testid="journey-focus-slot">
      <figure data-testid="journey-focus-media" data-focus-kind={model.kind}
        aria-hidden="true"
        className={`journey-focus-media journey-focus-media--${model.kind}`}>
        {model.kind === "ability" && <AbilityPlate m={model} />}
        {model.kind === "champion" && <ChampionPlate m={model} />}
        {model.kind === "item" && <ItemPlate m={model} />}
        {model.kind === "matchup" && <MatchupPlate m={model} playerChampion={playerChampion} />}
      </figure>
    </div>
  );
}
