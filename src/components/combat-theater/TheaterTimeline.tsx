/**
 * Scrubbable timeline. One marker per beat at its authoritative `time`,
 * sized by applied HP damage (reading aid only), coloured by acting side or —
 * for abilities — by damage type. Pointer drag / click seeks the clock;
 * arrow keys nudge by 0.1 s; `[` and `]` step beats. The playhead reads the
 * controller's clock, so it is always where the HUD and stage are.
 */
import { useCallback, useMemo, useRef } from "react";
import { Skull } from "lucide-react";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { formatClock, type TheaterBeat, type TheaterScript } from "@/lib/combat-theater/theater";

import { DAMAGE_TYPE_VAR } from "./visuals";

export function TheaterTimeline({
  script,
  time,
  selectedIndex,
  manifest,
  onSeek,
  onSelectBeat,
  onStep,
}: {
  script: TheaterScript;
  time: number;
  selectedIndex: number;
  manifest: ChampionManifest | null;
  onSeek: (seconds: number) => void;
  onSelectBeat: (index: number) => void;
  onStep: (delta: 1 | -1) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(script.duration, 1e-6);
  const maxApplied = useMemo(() => Math.max(1, ...script.beats.map((b) => b.hp?.applied ?? 0)), [script]);
  const ticks = useMemo(() => {
    const step = duration > 20 ? 5 : duration > 8 ? 2 : 1;
    const out: number[] = [];
    for (let t = 0; t <= duration + 1e-9; t += step) out.push(t);
    return out;
  }, [duration]);

  const secondsAt = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      return Math.max(0, Math.min(duration, frac * duration));
    },
    [duration]
  );

  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-beat-index]")) return;
    dragging.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom */
    }
    onSeek(secondsAt(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onSeek(secondsAt(e.clientX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* jsdom */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        onSeek(Math.min(duration, time + (e.shiftKey ? 1 : 0.1)));
        break;
      case "ArrowLeft":
        e.preventDefault();
        onSeek(Math.max(0, time - (e.shiftKey ? 1 : 0.1)));
        break;
      case "Home":
        e.preventDefault();
        onSeek(0);
        break;
      case "End":
        e.preventDefault();
        onSeek(duration);
        break;
      case "]":
        e.preventDefault();
        onStep(1);
        break;
      case "[":
        e.preventDefault();
        onStep(-1);
        break;
      default:
        break;
    }
  };

  const pct = (t: number) => `${(t / duration) * 100}%`;

  return (
    <div
      className="ct-timeline"
      role="slider"
      tabIndex={0}
      aria-label="Combat timeline"
      aria-valuemin={0}
      aria-valuemax={Number(duration.toFixed(3))}
      aria-valuenow={Number(time.toFixed(3))}
      aria-valuetext={`${formatClock(time)} seconds`}
      onKeyDown={onKeyDown}
      data-testid="theater-timeline"
    >
      <div className="ct-timeline__legend">
        <span className="ct-kicker">Timeline</span>
        <span className="ct-kicker">
          {script.beats.length} actions · {formatClock(duration)} s
        </span>
      </div>
      <div
        ref={trackRef}
        className="ct-timeline__track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        data-testid="timeline-track"
      >
        <div className="ct-timeline__rail" aria-hidden />
        <div className="ct-timeline__elapsed" style={{ width: pct(Math.min(time, duration)) }} aria-hidden />
        {ticks.map((t) => (
          <span key={t} className="ct-timeline__tick ct-num" style={{ left: pct(t) }} aria-hidden>
            {t}s
          </span>
        ))}
        {script.beats.map((beat) => (
          <BeatMarker
            key={beat.seq}
            beat={beat}
            script={script}
            manifest={manifest}
            left={pct(beat.time)}
            height={0.3 + 0.7 * ((beat.hp?.applied ?? 0) / maxApplied)}
            selected={beat.index === selectedIndex}
            fired={beat.index <= selectedIndex}
            onSelect={() => onSelectBeat(beat.index)}
          />
        ))}
        <div className="ct-playhead" style={{ left: pct(Math.min(time, duration)) }} data-testid="playhead">
          <span className="ct-playhead__label ct-num">{formatClock(time)}</span>
        </div>
      </div>
    </div>
  );
}

function BeatMarker({
  beat,
  script,
  manifest,
  left,
  height,
  selected,
  fired,
  onSelect,
}: {
  beat: TheaterBeat;
  script: TheaterScript;
  manifest: ChampionManifest | null;
  left: string;
  height: number;
  selected: boolean;
  fired: boolean;
  onSelect: () => void;
}) {
  void manifest;
  const champion = script.combatants.find((c) => c.id === beat.actorId)?.champion ?? null;
  const icon = beat.slot ? getAbilityIconUrl(champion, beat.slot) : null;
  const sideVar = beat.actorSide === "left" ? "var(--ct-left)" : "var(--ct-right)";
  const classes = [
    "ct-beat",
    beat.kind === "ability" ? "ct-beat--ability" : "",
    !beat.ok ? "ct-beat--failed" : "",
    selected ? "is-selected" : "",
    fired ? "is-fired" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const title = `${champion ?? beat.actorId} · ${beat.label} · ${formatClock(beat.time)} s${beat.hp ? ` · −${Math.round(beat.hp.applied)} HP` : ""}${beat.killingBlow ? " · final blow" : ""}`;

  return (
    <button
      type="button"
      className={classes}
      style={{ left, height: `${height * 100}%`, ["--ct-side" as string]: sideVar, ["--ct-dmg" as string]: DAMAGE_TYPE_VAR[beat.damageType] }}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onSelect}
      data-beat-index={beat.index}
      data-seq={beat.seq}
      data-testid="beat-marker"
    >
      <span className="ct-beat__bar" style={{ height: "100%" }} />
      {icon && beat.kind === "ability" ? (
        <span className="ct-beat__chip" aria-hidden>
          <img src={icon} alt="" />
        </span>
      ) : null}
      {beat.killingBlow ? (
        <span className="ct-beat__skull" aria-hidden>
          <Skull className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
