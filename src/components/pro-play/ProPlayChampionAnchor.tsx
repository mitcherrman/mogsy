/**
 * The champion visual anchor — what makes a Pro Play question look like a
 * League question rather than a sentence with chips.
 *
 * MEDIA RESOLUTION IS NOT REIMPLEMENTED HERE. The backend emits
 * `anchor.media.key`, which IS the `/api/assets/champions` manifest key (the
 * champion's canonical name), precisely so this component can hand it
 * straight to the shipped `getChampionSplash` / `getChampionIcon` helpers.
 * That is why "Kai'Sa" works with no special case: the manifest is keyed on
 * the same string the backend already stores, and the folder-shaped
 * `safe_champion_name` spelling — which renders Kai'Sa as `KaiSa` against a
 * real `Kaisa` directory and 404s on Linux — never enters this path.
 *
 * No external fetch: every URL comes from the app's own manifest through
 * `resolveAssetUrl`.
 *
 * FAILS SOFT, ALWAYS. No manifest yet (it is a react-query fetch), an unknown
 * champion, a non-champion anchor, or an image that 404s all land on the same
 * outcome: the band renders as a plain gradient and the question above it is
 * unchanged. A missing picture must never cost a playable question.
 */
import { useState } from "react";

import {
  getChampionLoading,
  getChampionSplash,
  useChampionAssets,
} from "@/hooks/useChampionAssets";
import { cn } from "@/lib/utils";
import type { ProPlaySubject } from "@/lib/pro-play/contract";

export interface ProPlayChampionAnchorProps {
  anchor: ProPlaySubject | null;
  className?: string;
  children?: React.ReactNode;
}

/** The manifest key for a champion anchor, or null for any other anchor kind. */
export function championMediaKey(anchor: ProPlaySubject | null | undefined): string | null {
  if (!anchor || anchor.kind !== "champion") return null;
  return anchor.media?.key ?? null;
}

export default function ProPlayChampionAnchor({
  anchor,
  className,
  children,
}: ProPlayChampionAnchorProps) {
  const { data: manifest } = useChampionAssets();
  const [failed, setFailed] = useState(false);
  const key = championMediaKey(anchor);
  // LOADING ART FIRST, splash as the fallback. Both are 100% covered in the
  // manifest (cutouts are not — 5 of 173), and the choice is driven by the
  // shape of this band: it is short and wide, so a 1215x717 splash crops to a
  // thin horizontal strip that lands on background as often as on the
  // champion. Thresh, Sion and Viktor all rendered as an empty black band
  // from their splashes and read perfectly from their loading art, which is a
  // portrait already composed around the character.
  const art = failed
    ? null
    : getChampionLoading(manifest, key ?? undefined) ??
      getChampionSplash(manifest, key ?? undefined);

  return (
    <div
      data-pro-play-anchor={anchor?.kind ?? "none"}
      data-pro-play-anchor-champion={key ?? undefined}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[#c9a84c]/20 bg-[#0b0d14]",
        className,
      )}
    >
      {art ? (
        <img
          src={art}
          alt=""
          // Decorative: the champion is named in the stem and in the chip rail,
          // so announcing it here would repeat it to a screen reader.
          aria-hidden
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          data-testid="pro-play-anchor-splash"
          // Cropped near the top of the portrait, which is where the
          // champion's head and shoulders sit.
          className="absolute inset-0 h-full w-full object-cover object-[center_26%] opacity-[0.95] [filter:brightness(1.15)_saturate(1.15)]"
        />
      ) : null}
      {/* OPAQUE BEHIND EVERY WORD, CLEAR ABOVE THEM. A flat scrim strong
          enough to carry the stem washes the art out everywhere; a gentle one
          leaves gold chips sitting on a bright splash. So the ramp is solid
          for the lower third — where the chips and the stem live — and fades
          to almost nothing at the top, which is the part of the band that is
          purely art. Written as an inline gradient rather than an arbitrary
          Tailwind class because it needs five stops to hold that shape. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to top, #0b0d14 0%, #0b0d14 30%, " +
            "rgba(11,13,20,0.90) 52%, rgba(11,13,20,0.45) 74%, " +
            "rgba(11,13,20,0.12) 100%)",
        }}
      />
      {/* A floor so short content still leaves the art room to be
          recognisable, with the copy pinned to the bottom of it. It GROWS with
          the stem rather than being a fixed hero, so a long question never
          pushes the choices off a small screen. */}
      <div className="relative flex min-h-[13.5rem] flex-col justify-end p-4 sm:min-h-[15rem] sm:p-5">
        {children}
      </div>
    </div>
  );
}
