/**
 * JOURNEY-UI1 — the Journey champion in a flank.
 *
 * `JourneyBannerCrest` takes the role mascot's place at the top of a desktop
 * duel banner. It reserves EXACTLY the mascot slot's box (the same classes as
 * `RoleCrest size="stage"`, around an invisible mascot-sized stand-in) and
 * draws over it, so the banner's score, module strip and status do not move
 * when a Journey starts or ends.
 *
 * `JourneyMatchBarCrest` replaces the phone match bar's 40px crest with the
 * champion's portrait and a level corner.
 */
import type { JourneyRailIdentity } from "@/lib/journey/rail";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import { MasteryAssetsProvider } from "@/features/mastery/live/MasteryAssetsProvider";
import { useMasteryAssets } from "@/features/mastery/player/MasteryAssets";
import { useState } from "react";

function Portrait({ identity, className }: { identity: JourneyRailIdentity; className: string }) {
  const assets = useMasteryAssets();
  const [broken, setBroken] = useState(false);
  const url = resolveAssetUrl(identity.icon) ?? assets.championIconUrl(identity.championId, identity.championName);
  return (
    <span className={`relative flex items-center justify-center overflow-hidden bg-black/70 ${className}`}>
      {url && !broken ? (
        <img src={url} alt="" draggable={false} onError={() => setBroken(true)} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden className="font-black uppercase text-[#e8c97a]">{identity.championName.slice(0, 1)}</span>
      )}
    </span>
  );
}

function BannerCrestBody({ identity }: { identity: JourneyRailIdentity }) {
  const rim = identity.side === "subject" ? "border-[#d4b35a]/70" : "border-[#7fb2d4]/75";
  return (
    <span className="relative flex h-full w-full flex-col items-center justify-end gap-[4%]">
      <span className="relative h-[56%] aspect-square">
        <Portrait identity={identity}
          className={`h-full w-full rounded-full border-2 ring-1 ring-[#f3dca0]/30 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.9)] ${rim}`} />
        <span data-testid={`journey-crest-level-${identity.side}`}
          data-changed={identity.levelFrom !== null ? "true" : undefined}
          className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border px-1 text-[0.625rem] font-black uppercase leading-4 tracking-[0.12em] ${
            identity.levelFrom !== null ? "border-[#8fd0a0]/70 bg-[#0d2418] text-[#c9f0d4]" : "border-[#d4b35a]/60 bg-black/85 text-[#f3dca0]"}`}>
          Lv {identity.level}
        </span>
      </span>
      <span className="max-w-full truncate text-[0.625rem] font-black uppercase leading-3 tracking-[0.1em] text-white">
        {identity.championName}
      </span>
      <span aria-hidden className="flex gap-[6%]" data-testid={`journey-crest-ranks-${identity.side}`}>
        {identity.abilities.map((a) => (
          <span key={a.slot} className="flex flex-col items-center gap-[2px]" data-rank={a.rank}>
            <span className={`text-[0.5625rem] font-black leading-none ${a.rank === 0 ? "text-white/35" : "text-[#e8c97a]"}`}>
              {a.slot}
            </span>
            {a.maxRank === null ? (
              <span className={`text-[0.5625rem] font-bold leading-none ${a.rank === 0 ? "text-white/35" : "text-white"}`}>
                {a.rank === 0 ? "–" : a.rank}
              </span>
            ) : (
              <span className="flex gap-[1px]">
                {Array.from({ length: a.maxRank }, (_, i) => (
                  <span key={i} className={`block h-[3px] w-[3px] rounded-full ${i < a.rank ? "bg-[#e8c97a]" : "bg-white/15"}`} />
                ))}
              </span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

export function JourneyBannerCrest({ identity }: { identity: JourneyRailIdentity }) {
  const label = `${identity.championName}, level ${identity.level}, ${identity.abilities
    .map((a) => `${a.slot} rank ${a.rank}`).join(", ")}`;
  return (
    <MasteryAssetsProvider>
      <span role="img" aria-label={label} data-testid={`journey-crest-${identity.side}`}
        // The role mascot slot's OWN classes (`RoleCrest size="stage"`), with
        // an invisible stand-in for the mascot: the box is the mascot slot's
        // box by construction, whatever the column width, so nothing below it
        // in the banner moves when a Journey starts or ends.
        className="relative flex shrink-0 items-end justify-center overflow-visible pt-[12%]">
        <span aria-hidden className="invisible relative aspect-[6/7] w-[52%] min-w-[3.5rem] max-w-[9rem]" />
        <span className="absolute inset-0">
          <BannerCrestBody identity={identity} />
        </span>
      </span>
    </MasteryAssetsProvider>
  );
}

export function JourneyMatchBarCrest({ identity, testId }: { identity: JourneyRailIdentity; testId: string }) {
  const rim = identity.side === "subject" ? "border-[#d4b35a]/60" : "border-[#7fb2d4]/70";
  return (
    <MasteryAssetsProvider>
      <span aria-label={`${identity.championName}, level ${identity.level}`} role="img" data-testid={testId}
        data-journey="true"
        className={`relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-[#0b1727] ${rim}`}>
        <Portrait identity={identity} className="h-full w-full" />
        <span data-testid={`${testId}-level`}
          className={`absolute bottom-0 right-0 rounded-tl-md px-[3px] text-[0.5625rem] font-black leading-3 ${
            identity.levelFrom !== null ? "bg-[#8fd0a0] text-[#0d2418]" : "bg-[#d4b35a] text-[#2a1f08]"}`}>
          {identity.level}
        </span>
      </span>
    </MasteryAssetsProvider>
  );
}
