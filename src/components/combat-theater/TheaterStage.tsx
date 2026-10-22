/**
 * The central combat theater: champions on opposing sides, a strike layer
 * driven by the selected beat's real event types, a synchronized damage
 * reveal, and a caption naming the action.
 *
 * Nothing here knows a position, a range or a projectile — the backend
 * publishes none (`unsupported_mechanics`). The streak is a *reading aid*
 * from the acting side to the target side, coloured by the reported
 * `damage_type`, sized by the kind of action (`meta.action_type`). Every
 * number is the beat's own.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimate } from "framer-motion";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import {
  formatClock,
  formatDamage,
  type CombatantState,
  type TheaterBeat,
  type TheaterCombatant,
  type TheaterScript,
} from "@/lib/combat-theater/theater";

import { ChampionArt } from "./ChampionArt";
import { anchorFor, DAMAGE_TYPE_LABEL, DAMAGE_TYPE_VAR, type Anchor } from "./visuals";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function Portrait({
  combatant,
  state,
  manifest,
  role,
  beatSeq,
  reduced,
  register,
}: {
  combatant: TheaterCombatant;
  state: CombatantState;
  manifest: ChampionManifest | null;
  role: "actor" | "target" | "idle";
  beatSeq: number | null;
  reduced: boolean;
  register: (id: string, el: HTMLElement | null) => void;
}) {
  const [scope, animate] = useAnimate();
  const dir = combatant.side === "left" ? 1 : -1;
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      (scope as React.MutableRefObject<HTMLDivElement | null>).current = el;
      register(combatant.id, el);
    },
    [combatant.id, register, scope]
  );

  useEffect(() => {
    if (reduced || beatSeq === null || !scope.current) return;
    try {
      if (role === "actor") {
        animate(scope.current, { x: [0, 22 * dir, 0], scale: [1, 1.03, 1] }, { duration: 0.55, ease: EASE_OUT });
      } else if (role === "target") {
        animate(scope.current, { x: [0, -9 * dir, 7 * dir, -4 * dir, 0] }, { duration: 0.42, delay: 0.08, ease: "easeOut" });
      }
    } catch {
      /* jsdom / no animation support: the static state is still correct */
    }
  }, [animate, beatSeq, dir, reduced, role, scope]);

  const classes = [
    "ct-portrait",
    `ct-portrait--${combatant.side}`,
    role === "idle" && beatSeq !== null && state.alive ? "is-idle" : "",
    !state.alive ? "is-dead" : "",
    role === "actor" ? "is-actor" : "",
    role === "target" ? "is-target" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.div
      ref={setRefs}
      className={classes}
      style={{ ["--ct-side" as string]: combatant.side === "left" ? "var(--ct-left)" : "var(--ct-right)" }}
      initial={false}
      animate={{ y: state.alive ? 0 : 14, opacity: state.alive ? 1 : 0.6 }}
      transition={reduced ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT }}
      data-testid={`portrait-${combatant.id}`}
      data-role={role}
      data-alive={state.alive}
    >
      <div className="ct-portrait__shadow" aria-hidden />
      <div className="ct-portrait__art">
        <ChampionArt manifest={manifest} champion={combatant.champion} variant="portrait" />
      </div>
      {!state.alive ? <span className="ct-portrait__tag ct-portrait__tag--dead">Defeated</span> : null}
    </motion.div>
  );
}

function StrikeLayer({
  script,
  beat,
  manifest,
  reduced,
  anchors,
}: {
  script: TheaterScript;
  beat: TheaterBeat;
  manifest: ChampionManifest | null;
  reduced: boolean;
  anchors: Record<string, Anchor>;
}) {
  const from = anchors[beat.actorId] ?? anchorFor(script, beat.actorId);
  const to = (beat.targetId ? anchors[beat.targetId] : null) ?? anchorFor(script, beat.targetId);
  const dmgVar = DAMAGE_TYPE_VAR[beat.damageType];
  const actorChampion = script.combatants.find((c) => c.id === beat.actorId)?.champion ?? null;
  const abilityIcon = beat.slot ? getAbilityIconUrl(actorChampion, beat.slot) : null;
  const applied = beat.hp?.applied ?? null;
  const primaryHit = beat.hits[0] ?? null;

  const path = useMemo(() => {
    if (!from || !to) return null;
    const midX = (from.x + to.x) / 2;
    // A basic attack arcs like a shot; an ability drives straight through.
    const lift = beat.kind === "basic_attack" ? 14 : 0;
    return `M ${from.x} ${from.y} Q ${midX} ${from.y - lift} ${to.x} ${to.y}`;
  }, [beat.kind, from, to]);

  const t = (d: number, delay = 0) => (reduced ? { duration: 0 } : { duration: d, delay, ease: EASE_OUT });
  // The number is wide; keep it inside the stage when the target stands near an edge.
  const numberX = to ? Math.max(14, Math.min(86, to.x)) : 50;

  return (
    <div className="ct-strike" style={{ ["--ct-dmg" as string]: dmgVar }} data-testid="strike-layer" data-seq={beat.seq}>
      {beat.killingBlow && !reduced ? (
        <motion.div className="ct-stage__flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 0.7, delay: 0.1 }} />
      ) : null}
      {path && beat.ok ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`ct-streak-${beat.seq}`} x1={from!.x < to!.x ? "0" : "1"} x2={from!.x < to!.x ? "1" : "0"} y1="0" y2="0">
              <stop offset="0" style={{ stopColor: `hsl(${dmgVar})`, stopOpacity: 0 }} />
              <stop offset="0.55" style={{ stopColor: `hsl(${dmgVar})`, stopOpacity: 0.95 }} />
              <stop offset="1" style={{ stopColor: `hsl(${dmgVar})`, stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <motion.path
            d={path}
            fill="none"
            stroke={`url(#ct-streak-${beat.seq})`}
            strokeWidth={beat.kind === "ability" ? 6 : 2.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={reduced ? { pathLength: 1, opacity: 0.55 } : { pathLength: 0, opacity: 1 }}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={reduced ? { duration: 0 } : { pathLength: { duration: beat.kind === "ability" ? 0.32 : 0.22, ease: "easeIn" }, opacity: { duration: 0.6, delay: 0.3 } }}
          />
        </svg>
      ) : null}
      {path && !beat.ok ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={path} fill="none" style={{ stroke: "hsl(var(--ct-ink-mute))" }} strokeWidth={2} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity={0.6} />
        </svg>
      ) : null}

      {from && (beat.kind === "ability" || abilityIcon) ? (
        <div className="ct-anchor" style={{ left: `${from.x}%`, top: `${from.y - 16}%` }}>
          <motion.div
            className="ct-cast"
            initial={reduced ? false : { opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={t(0.35)}
            data-testid="cast-badge"
          >
            {abilityIcon ? <img src={abilityIcon} alt={`${actorChampion ?? ""} ${beat.slot}`} /> : <span className="ct-cast__slot">{beat.slot ?? "•"}</span>}
          </motion.div>
        </div>
      ) : null}

      {to && beat.ok ? (
        <div className="ct-anchor" style={{ left: `${to.x}%`, top: `${to.y}%` }}>
          <motion.div
            className="ct-impact"
            initial={reduced ? { opacity: 0 } : { opacity: 0.9, scale: 0.35 }}
            animate={{ opacity: 0, scale: beat.killingBlow ? 2.2 : 1.5 }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, delay: 0.2, ease: "easeOut" }}
          />
        </div>
      ) : null}

      {to ? (
        <div className="ct-anchor" style={{ left: `${numberX}%`, top: `${to.y - 10}%` }}>
        <motion.div
          className="ct-damage"
          initial={reduced ? false : { opacity: 0, y: 18, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={t(0.45, 0.22)}
          data-testid="damage-reveal"
        >
          {beat.ok && applied !== null ? (
            <>
              <span className={`ct-damage__value ct-num ${beat.killingBlow ? "ct-damage__value--kill" : ""}`} data-testid="damage-value">
                −{formatDamage(applied, 0)}
              </span>
              <span className="ct-damage__meta">
                {DAMAGE_TYPE_LABEL[beat.damageType]}
                {primaryHit?.finalDamage !== null && primaryHit?.finalDamage !== undefined && Math.abs(primaryHit.finalDamage - applied) > 0.5
                  ? ` · hit ${formatDamage(primaryHit.finalDamage, 0)}`
                  : ""}
                {primaryHit?.mitigated ? " · mitigated" : ""}
              </span>
              {beat.killingBlow ? <span className="ct-damage__kill">Final blow</span> : null}
            </>
          ) : beat.ok ? (
            <span className="ct-damage__meta">no HP change</span>
          ) : (
            <span className="ct-damage__meta">action failed{beat.error ? ` · ${beat.error}` : ""}</span>
          )}
        </motion.div>
        </div>
      ) : null}
    </div>
  );
}

export function TheaterStage({
  script,
  beat,
  states,
  manifest,
  reduced,
  atEnd,
}: {
  script: TheaterScript;
  beat: TheaterBeat | null;
  states: Record<string, CombatantState>;
  manifest: ChampionManifest | null;
  reduced: boolean;
  atEnd: boolean;
}) {
  const roleFor = (id: string): "actor" | "target" | "idle" =>
    beat && id === beat.actorId ? "actor" : beat && id === beat.targetId ? "target" : "idle";

  // Measure where each portrait actually is so the strike, impact ring and
  // damage number land on the right champion whatever the side layout.
  const stageRef = useRef<HTMLDivElement>(null);
  const portraitEls = useRef(new Map<string, HTMLElement>());
  const [anchors, setAnchors] = useState<Record<string, Anchor>>({});
  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) portraitEls.current.set(id, el);
    else portraitEls.current.delete(id);
  }, []);
  const measure = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect();
    if (!stage || stage.width === 0 || stage.height === 0) return;
    const next: Record<string, Anchor> = {};
    for (const [id, el] of portraitEls.current) {
      const art = (el.querySelector(".ct-portrait__art") as HTMLElement | null) ?? el;
      const r = art.getBoundingClientRect();
      if (r.width === 0) continue;
      next[id] = {
        x: ((r.left + r.width / 2 - stage.left) / stage.width) * 100,
        y: ((r.top + r.height * 0.42 - stage.top) / stage.height) * 100,
      };
    }
    setAnchors((prev) => {
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(prev).length && keys.every((k) => prev[k] && Math.abs(prev[k].x - next[k].x) < 0.05 && Math.abs(prev[k].y - next[k].y) < 0.05);
      return same ? prev : next;
    });
  }, []);
  useLayoutEffect(() => {
    measure();
    // Portrait heights ease when focus changes; re-measure once that settles.
    const t = window.setTimeout(measure, 460);
    return () => window.clearTimeout(t);
  }, [measure, beat?.seq, script]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const actor = beat ? script.combatants.find((c) => c.id === beat.actorId) : null;
  const target = beat ? script.combatants.find((c) => c.id === beat.targetId) : null;
  const winnerLabel =
    script.termination.winner === script.leftTeam
      ? script.left.map((c) => c.champion).join(" & ")
      : script.termination.winner === script.rightTeam
        ? script.right.map((c) => c.champion).join(" & ")
        : null;

  return (
    <div className="ct-stage" ref={stageRef} data-testid="theater-stage" data-beat-seq={beat?.seq ?? ""}>
      <div className="ct-stage__grid" aria-hidden />
      <div className="ct-stage__floor" aria-hidden />

      <div className="ct-side ct-side--left" data-count={script.left.length}>
        {script.left.map((c) => (
          <Portrait key={c.id} combatant={c} state={states[c.id]} manifest={manifest} role={roleFor(c.id)} beatSeq={beat?.seq ?? null} reduced={reduced} register={register} />
        ))}
      </div>
      <div className="ct-side ct-side--right" data-count={script.right.length}>
        {script.right.map((c) => (
          <Portrait key={c.id} combatant={c} state={states[c.id]} manifest={manifest} role={roleFor(c.id)} beatSeq={beat?.seq ?? null} reduced={reduced} register={register} />
        ))}
      </div>

      {beat ? (
        <div key={beat.seq} style={{ position: "absolute", inset: 0 }}>
          <StrikeLayer script={script} beat={beat} manifest={manifest} reduced={reduced} anchors={anchors} />
        </div>
      ) : null}

      <div className="ct-stage__vignette" aria-hidden />

      {atEnd && winnerLabel ? (
        <motion.div
          className="ct-stage__result"
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT }}
          data-testid="stage-result"
        >
          {winnerLabel} wins · {script.termination.reason.replace(/_/g, " ")}
        </motion.div>
      ) : !beat ? (
        <div className="ct-stage__ready">Ready</div>
      ) : null}

      <div className="ct-caption" data-testid="stage-caption">
        {beat ? (
          <>
            <span className="ct-caption__line">
              <span className="ct-caption__who" style={{ color: `hsl(${actor?.side === "right" ? "var(--ct-right)" : "var(--ct-left)"})` }}>
                {actor?.champion ?? beat.actorId}
              </span>
              <span className="ct-caption__arrow" aria-hidden>→</span>
              <span className="ct-caption__who" style={{ color: `hsl(${target?.side === "right" ? "var(--ct-right)" : "var(--ct-left)"})` }}>
                {target?.champion ?? beat.targetId ?? "—"}
              </span>
              <span>· {beat.label}</span>
              <span className="ct-caption__time ct-num">{formatClock(beat.time)} s</span>
            </span>
            {beat.hits.length > 0 ? (
              <span className="ct-caption__sub">
                {beat.hits.map((h) => `${h.source ?? h.type} ${h.finalDamage !== null ? formatDamage(h.finalDamage, 0) : ""}`.trim()).join("  ·  ")}
              </span>
            ) : null}
          </>
        ) : (
          <span className="ct-caption__line">
            <span className="ct-caption__sub">Press play, scrub the timeline, or step through each action</span>
          </span>
        )}
      </div>
    </div>
  );
}
