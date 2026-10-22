/**
 * Broadcast-style top HUD: one plate per combatant on each side, the fight
 * clock in the middle. HP values come from the reconstructed `TheaterState`
 * (authoritative `hp_after` replay); the bar scale is `max_hp`.
 */
import { motion } from "framer-motion";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import {
  formatClock,
  formatHp,
  type CombatantState,
  type TheaterCombatant,
  type TheaterSide,
} from "@/lib/combat-theater/theater";

import { ChampionArt } from "./ChampionArt";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export function HpBar({
  side,
  hp,
  maxHp,
  reduced,
  testId,
}: {
  side: TheaterSide;
  hp: number;
  maxHp: number;
  reduced: boolean;
  testId?: string;
}) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const width = `${pct}%`;
  return (
    <div
      className={`ct-hpbar ct-hpbar--${side}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxHp)}
      aria-valuenow={Math.round(hp)}
      aria-label="Health"
      data-testid={testId}
      data-hp={Math.round(hp)}
    >
      {/* the ghost lags the real fill so a chunk of lost HP is readable for a beat */}
      <motion.div
        className="ct-hpbar__ghost"
        initial={false}
        animate={{ width }}
        transition={reduced ? { duration: 0 } : { duration: 0.8, delay: 0.28, ease: EASE_OUT }}
      />
      <motion.div
        className="ct-hpbar__fill"
        initial={false}
        animate={{ width }}
        transition={reduced ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT }}
      />
      <div className="ct-hpbar__ticks" aria-hidden />
    </div>
  );
}

export function ChampionPlate({
  combatant,
  state,
  manifest,
  role,
  reduced,
}: {
  combatant: TheaterCombatant;
  state: CombatantState;
  manifest: ChampionManifest | null;
  role: "actor" | "target" | "idle";
  reduced: boolean;
}) {
  const side = combatant.side;
  const sideVar = side === "left" ? "var(--ct-left)" : "var(--ct-right)";
  const classes = [
    "ct-plate",
    `ct-plate--${side}`,
    role === "actor" ? "is-actor" : "",
    role === "target" ? "is-target" : "",
    !state.alive ? "is-dead" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ ["--ct-side" as string]: sideVar }}
      data-testid={`plate-${combatant.id}`}
      data-role={role}
      data-alive={state.alive}
    >
      <div className="ct-plate__icon">
        <ChampionArt manifest={manifest} champion={combatant.champion} variant="icon" />
      </div>
      <div className="ct-plate__body">
        <div className="ct-plate__name-row">
          <span className="ct-plate__name">{combatant.champion}</span>
          {combatant.level !== null ? <span className="ct-plate__level">LV {combatant.level}</span> : null}
        </div>
        <HpBar side={side} hp={state.hp} maxHp={state.maxHp} reduced={reduced} testId={`hp-${combatant.id}`} />
        <div className="ct-plate__hp-row">
          <span className="ct-plate__hp ct-num" data-testid={`hp-text-${combatant.id}`}>
            {formatHp(state.hp)} <small>/ {formatHp(state.maxHp)}</small>
          </span>
          {combatant.items.length > 0 ? (
            <span className="ct-plate__items" title={combatant.items.join(", ")}>
              {combatant.items.join(" · ")}
            </span>
          ) : (
            <span className="ct-plate__items">No items</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TheaterHud({
  left,
  right,
  states,
  manifest,
  time,
  duration,
  actorId,
  targetId,
  reduced,
}: {
  left: TheaterCombatant[];
  right: TheaterCombatant[];
  states: Record<string, CombatantState>;
  manifest: ChampionManifest | null;
  time: number;
  duration: number;
  actorId: string | null;
  targetId: string | null;
  reduced: boolean;
}) {
  const roleFor = (id: string): "actor" | "target" | "idle" =>
    id === actorId ? "actor" : id === targetId ? "target" : "idle";

  return (
    <div className="ct-hud" data-testid="theater-hud">
      <div style={{ display: "grid", gap: "0.4rem" }}>
        {left.map((c) => (
          <ChampionPlate key={c.id} combatant={c} state={states[c.id]} manifest={manifest} role={roleFor(c.id)} reduced={reduced} />
        ))}
      </div>
      <div className="ct-hud__clock" aria-live="off">
        <span className="ct-hud__clock-value ct-num" data-testid="theater-clock">
          {formatClock(time)}
        </span>
        <span className="ct-hud__clock-total ct-num">of {formatClock(duration)} s</span>
      </div>
      <div style={{ display: "grid", gap: "0.4rem" }}>
        {right.map((c) => (
          <ChampionPlate key={c.id} combatant={c} state={states[c.id]} manifest={manifest} role={roleFor(c.id)} reduced={reduced} />
        ))}
      </div>
    </div>
  );
}
