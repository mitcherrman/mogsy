/**
 * PLAY1 — the plate: one mode's miniature, in its frame.
 *
 * The single piece of ornament the whole record shares. It appears at three
 * sizes and in four places, and it is ONE component so those four cannot
 * drift into four slightly different frames:
 *
 *   `card`   beside a clause on the menu.
 *   `hero`   at the head of Ranked matchmaking and of Invite & Play — the
 *            card the player just pressed, expanded into the state it opened.
 *            This is what makes matchmaking read as the Ranked card's next
 *            beat rather than as a different screen.
 *   `notice` in a refusal (Ranked closed, Ranked unreachable), muted.
 *
 * WHAT IS IN THE DOM AND WHAT IS IN CSS
 * ─────────────────────────────────────
 * This file contributes a picture, a frame element and a size. Everything the
 * frame IS — the double rule, the corner ticks, the etched inner line, the
 * vignette that marries a full-bleed painting to the parchment, the accent —
 * is `.play-plate*` in `index.css`, keyed off `data-mode` and `data-size`.
 * A component that emitted the ornament as inline style would be a component
 * that has to be edited to retune a corner tick.
 *
 * ALWAYS DECORATIVE. Every place a plate appears, the mode is also written
 * out in words next to it — the clause title, the beat headline, the notice
 * heading — so the picture is `alt=""` and `aria-hidden`. Identity is never
 * carried by art alone.
 *
 * A MISSING FILE IS NOT A BROKEN PAGE. `onError` drops the picture and keeps
 * the frame, so the card degrades to an empty illuminated plate rather than
 * to the browser's broken-image glyph.
 *
 * TONE IS NOT ONE SWITCH. There are two reasons a plate stops being at full
 * strength, and they must not look alike:
 *
 *   soft    the entry is DONE for today. A good outcome. The picture is eased
 *           back a little so the panel settles, and keeps its colour — a
 *           drained thumbnail is the visual language of a broken feature.
 *   muted   the entry REFUSED. Ranked is closed, or unreachable. Drained on
 *           purpose, so it cannot read as an invitation.
 */

import { useState } from "react";
import type { PlayModeId } from "@/lib/quiz/playModes";
import { PLAY_MODE_ART } from "./modeArt";

export type PlayPlateSize = "card" | "hero" | "notice";

/** How much of the picture's own strength this instance gets. See TONE above. */
export type PlayPlateTone = "full" | "soft" | "muted";

export default function PlayModePlate({
  mode,
  size = "card",
  tone = "full",
  className = "",
}: {
  mode: PlayModeId;
  size?: PlayPlateSize;
  tone?: PlayPlateTone;
  className?: string;
}) {
  const art = PLAY_MODE_ART[mode];
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`play-plate ${className}`}
      data-mode={mode}
      data-size={size}
      data-fit={art.fit}
      data-tone={tone === "full" ? undefined : tone}
      aria-hidden="true"
    >
      {!failed && (
        <img
          className="play-plate__art"
          src={art.src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
      {/* The illumination: vignette, etched inner rule and the four corner
          ticks, all painted by CSS on this one empty box so they sit OVER the
          picture without being part of it. */}
      <span className="play-plate__frame" />
    </span>
  );
}
