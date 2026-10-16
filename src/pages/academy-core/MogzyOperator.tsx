/**
 * Academy Core V2 — Mogzy at the controls.
 *
 * Mogzy stands beside the instrument, facing it. At rest he is the 512 px base
 * plate the Landing and the Hall already draw (so it is cached on arrival);
 * when a room is focused he switches to that room's reaction pose — the
 * existing ~10 KB compact derivatives — and his parchment bubble carries the
 * room's one-line preview. Leaving focus returns him to rest.
 *
 * Motion is two cheap CSS animations (an idle bob, a one-shot hop on a pose
 * change), both disabled under reduced motion and paused with the stage when
 * it is off screen. Pose plates are rendered as stacked <img>s in ONE reserved
 * box, so a swap never moves anything; a pose the warm has not finished yet
 * simply shows the rest plate until it is in.
 *
 * The bubble is decorative (aria-hidden): the same sentence reaches assistive
 * technology through the bay link's aria-describedby.
 */
import { useEffect, useRef, useState } from "react";

import type { MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { getMogzyArtDefaultAlt } from "@/components/mascot/mascot-assets";
import { CORE_MOGZY_REACTION_POSE, CORE_MOGZY_REST_SRC, coreReactionSrc } from "./academy-core-warm";
import type { CoreFocus } from "./academy-core-destinations";

export interface MogzyOperatorProps {
  focus: CoreFocus;
  /** The one-line preview for the focused room, or the idle line. */
  line: string;
  ambient: boolean;
  reduced: boolean;
  /** Which way Mogzy faces; the base art faces left natively. */
  facing?: "left" | "right";
  /**
   * Mount the reaction plates. The page flips this once the Core's critical
   * art has settled, so the four ~10 KB poses never compete with first paint.
   */
  reactionsReady?: boolean;
  className?: string;
}

const REACTION_POSES = Object.values(CORE_MOGZY_REACTION_POSE) as MogzyMascotPose[];

export default function MogzyOperator({
  focus,
  line,
  ambient,
  reduced,
  facing = "right",
  reactionsReady = false,
  className,
}: MogzyOperatorProps) {
  const pose: MogzyMascotPose | "rest" = focus === "idle" ? "rest" : CORE_MOGZY_REACTION_POSE[focus] ?? "rest";

  // A one-shot hop on every pose change (not on mount). Restarted by toggling
  // the class off and on across a frame so a quick second change still plays.
  const [hopping, setHopping] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduced) return;
    setHopping(false);
    const raf = requestAnimationFrame(() => setHopping(true));
    const t = window.setTimeout(() => setHopping(false), 520);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [pose, reduced]);

  return (
    <div
      className={["acore-operator", className].filter(Boolean).join(" ")}
      data-pose={pose}
      data-hop={hopping ? "true" : "false"}
      data-ambient={ambient && !reduced ? "on" : "off"}
      data-facing={facing}
      data-reactions={reactionsReady ? "ready" : "pending"}
      data-testid="academy-core-mogzy"
    >
      <div className="acore-operator-bubble" aria-hidden data-testid="academy-core-readout">
        <span className="acore-operator-line">{line}</span>
      </div>
      <div className="acore-operator-figure">
        {/* rest plate: always mounted, always decoded first */}
        <img
          src={CORE_MOGZY_REST_SRC}
          alt={getMogzyArtDefaultAlt({ category: "mascot", name: "base" })}
          width={512}
          height={768}
          decoding="async"
          draggable={false}
          className="acore-operator-plate"
          data-plate="rest"
        />
        {/* reaction plates: mounted after the critical art, hidden until their pose is active */}
        {reactionsReady && REACTION_POSES.map((p) => (
          <img
            key={p}
            src={coreReactionSrc(p)}
            alt=""
            aria-hidden
            width={192}
            height={288}
            decoding="async"
            draggable={false}
            className="acore-operator-plate"
            data-plate={p}
          />
        ))}
      </div>
      <div className="acore-operator-shadow" aria-hidden />
    </div>
  );
}
