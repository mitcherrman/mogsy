/**
 * Visual mathematics for the selected beat: a seven-step ledger revealed in
 * order (identity → formula → substitution → mitigation → shield → final →
 * HP). Every number is a `Sourced` value from `explainBeat` and prints the
 * wire field it came from; a step without data says so instead of showing a
 * placeholder figure. The formula line is `formula_text` verbatim; the
 * substituted line swaps bound identifiers for the server's own bindings and
 * the "=" result is the server's `raw_damage` — nothing is evaluated here.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import {
  explainBeat,
  formatDamage,
  formatHp,
  type MathStep,
  type Sourced,
  type TheaterBeat,
  type TheaterScript,
} from "@/lib/combat-theater/theater";

import { ChampionArt } from "./ChampionArt";
import { DAMAGE_TYPE_LABEL, DAMAGE_TYPE_VAR } from "./visuals";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const STEP_TITLES: Record<MathStep["id"], string> = {
  identity: "Ability & formula identity",
  formula: "Base damage and scaling",
  substitution: "Authoritative substituted values",
  mitigation: "Damage mitigation",
  shield: "Shield absorption",
  final: "Final HP damage",
  hp: "HP before → after",
};

function Prov({ fields }: { fields: string[] }) {
  if (fields.length === 0) return null;
  return (
    <div className="ct-step__prov" data-testid="step-provenance">
      ↳ {fields.join(" · ")}
    </div>
  );
}

function Rung({ label, value, hot, shield, delta }: { label: string; value: Sourced; hot?: boolean; shield?: boolean; delta?: string }) {
  return (
    <div className={`ct-rung ${hot ? "ct-rung--hot" : ""} ${shield ? "ct-rung--shield" : ""}`} data-testid="math-rung">
      <span className="ct-rung__label">{label}</span>
      <span className="ct-rung__value ct-num">
        {formatDamage(value.value)}
        {delta ? <span className="ct-rung__delta">{delta}</span> : null}
      </span>
    </div>
  );
}

function StepBody({ step, script, beat }: { step: MathStep; script: TheaterScript; beat: TheaterBeat }) {
  switch (step.id) {
    case "identity":
      return (
        <div className="ct-step__content">
          <div style={{ fontWeight: 700 }}>{step.ability}</div>
          <div style={{ fontSize: "0.74rem", color: "hsl(var(--ct-ink-dim))", marginTop: "0.15rem" }}>
            {DAMAGE_TYPE_LABEL[step.damageType]} damage
            {step.actionId ? <> · action <code className="ct-mono">{step.actionId}</code></> : null}
            {step.state ? <> · <code className="ct-mono">{step.state}</code></> : null}
          </div>
          {step.description ? <div className="ct-step__note">{step.description}</div> : null}
        </div>
      );
    case "formula":
      return (
        <div className="ct-step__content">
          {step.formulaText ? (
            <div className="ct-formula" data-testid="formula-text">
              {step.formulaText}
            </div>
          ) : null}
          {step.bindings.length > 0 ? (
            <div className="ct-bindings" data-testid="formula-bindings">
              {step.bindings.map((b) => (
                <span key={b.name} className="ct-binding">
                  <b>{b.name}</b> = {formatDamage(b.value, 3)}
                </span>
              ))}
              {step.rank !== null ? (
                <span className="ct-binding">
                  rank <b>{step.rank}</b>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      );
    case "substitution":
      return (
        <div className="ct-step__content">
          {step.tokens.length > 0 ? (
            <>
              <div className="ct-formula" data-testid="formula-highlighted">
                {step.tokens.map((t, i) =>
                  t.kind === "identifier" ? (
                    <span key={i} className="ct-ident" title={`${t.name} = ${t.value}`}>
                      {t.text}
                    </span>
                  ) : (
                    <span key={i}>{t.text}</span>
                  )
                )}
              </div>
              <div className="ct-formula" style={{ marginTop: "0.35rem" }} data-testid="formula-substituted">
                {step.tokens.map((t, i) =>
                  t.kind === "identifier" ? (
                    <span key={i} className="ct-ident ct-ident--value" title={t.name}>
                      {formatDamage(t.value, 3)}
                    </span>
                  ) : (
                    <span key={i}>{t.text}</span>
                  )
                )}
              </div>
            </>
          ) : step.reportedInputs.length > 0 ? (
            <div className="ct-bindings" data-testid="reported-inputs">
              {step.reportedInputs.map((i) => (
                <span key={i.name} className="ct-binding">
                  <b>{i.name}</b> = {typeof i.value === "number" ? formatDamage(i.value, 3) : String(i.value)}
                </span>
              ))}
            </div>
          ) : null}
          {step.result ? (
            <div className="ct-equals" data-testid="substitution-result">
              <span style={{ color: "hsl(var(--ct-ink-mute))" }}>= </span>
              <span className="ct-equals__value ct-num">{formatDamage(step.result.value)}</span>
              <span style={{ fontSize: "0.66rem", color: "hsl(var(--ct-ink-mute))" }}>engine result (pre-mitigation)</span>
            </div>
          ) : null}
        </div>
      );
    case "mitigation": {
      const reduction =
        step.before && step.after && step.before.value > 0
          ? `−${Math.round((1 - step.after.value / step.before.value) * 100)}%`
          : undefined;
      const resistanceLabel =
        step.resistance?.kind === "armor" ? "Effective armor" : step.resistance?.kind === "magic_resist" ? "Effective magic resist" : "Effective resistance";
      return (
        <div className="ct-step__content">
          <div className="ct-ladder">
            {step.before ? <Rung label="Before mitigation" value={step.before} /> : null}
            {step.resistance ? (
              <Rung label={resistanceLabel} value={{ value: step.resistance.value, field: step.resistance.field }} />
            ) : null}
            {step.after ? <Rung label="After mitigation" value={step.after} hot delta={reduction} /> : null}
            {step.modifiers
              .filter((m) => m.percent === null || m.percent.value !== 0 || (step.after && Math.abs(m.value.value - step.after.value) > 1e-6))
              .map((m) => (
                <Rung key={m.label} label={`${m.label}${m.percent ? ` (${formatDamage(m.percent.value)}%)`: ""}`} value={m.value} />
              ))}
          </div>
          {step.modifiers.length > 0 && step.modifiers.every((m) => m.percent && m.percent.value === 0) ? (
            <div className="ct-step__note">No amplification or reduction modifiers applied (all reported at 0%).</div>
          ) : null}
        </div>
      );
    }
    case "shield":
      return (
        <div className="ct-step__content">
          {step.absorbed ? (
            <div className="ct-ladder">
              {step.before ? <Rung label="Shield before" value={step.before} shield /> : null}
              <Rung label="Absorbed by shield" value={step.absorbed} shield />
              {step.after ? <Rung label="Shield after" value={step.after} shield /> : null}
            </div>
          ) : null}
        </div>
      );
    case "final":
      return (
        <div className="ct-step__content">
          <div className="ct-ladder">
            {step.finalDamage ? <Rung label="Hit (final damage)" value={step.finalDamage} /> : null}
            {step.appliedHpDamage ? <Rung label="Applied to HP" value={step.appliedHpDamage} hot /> : null}
            {step.overkill !== null ? (
              <Rung label="Overkill (not applied)" value={{ value: step.overkill, field: "derived: final_damage − applied_hp_damage" }} />
            ) : null}
          </div>
        </div>
      );
    case "hp": {
      const target = script.combatants.find((c) => c.id === step.targetId);
      const max = step.maxHp?.value ?? Math.max(step.before?.value ?? 0, 1);
      const sideVar = target?.side === "right" ? "var(--ct-right)" : "var(--ct-left)";
      return (
        <div className="ct-step__content">
          {step.before && step.after ? (
            <div className="ct-hpresult" style={{ ["--ct-side" as string]: sideVar }} data-testid="hp-result">
              <div className="ct-hpresult__row">
                <span>
                  {target?.champion ?? step.targetId}: <strong>{formatHp(step.before.value)}</strong> → <strong>{formatHp(step.after.value)}</strong>
                  {step.maxHp ? <span style={{ color: "hsl(var(--ct-ink-mute))" }}> / {formatHp(step.maxHp.value)}</span> : null}
                </span>
                {step.applied ? <span style={{ color: `hsl(${DAMAGE_TYPE_VAR[beat.damageType]})` }}>−{formatDamage(step.applied.value)}</span> : null}
              </div>
              <div className="ct-hpresult__bar">
                <div className="ct-hpresult__before" style={{ width: `${Math.min(100, (step.before.value / max) * 100)}%` }} />
                <div className="ct-hpresult__after" style={{ width: `${Math.min(100, (step.after.value / max) * 100)}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    default:
      return null;
  }
}

export function MathExplainer({
  script,
  beat,
  manifest,
  reduced,
}: {
  script: TheaterScript;
  beat: TheaterBeat | null;
  manifest: ChampionManifest | null;
  reduced: boolean;
}) {
  const explanation = useMemo(() => (beat ? explainBeat(script, beat) : null), [script, beat]);
  const [showRaw, setShowRaw] = useState(false);
  const actor = beat ? script.combatants.find((c) => c.id === beat.actorId) : null;
  const target = beat ? script.combatants.find((c) => c.id === beat.targetId) : null;
  const abilityIcon = beat?.slot ? getAbilityIconUrl(actor?.champion, beat.slot) : null;
  const dmgVar = beat ? DAMAGE_TYPE_VAR[beat.damageType] : "var(--ct-ink-dim)";

  return (
    <section className="ct-math" style={{ ["--ct-dmg" as string]: dmgVar }} aria-label="Calculation" data-testid="math-explainer">
      {beat && explanation ? (
          <motion.div
            key={beat.seq}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2 }}
          >
            <header className="ct-math__head">
              <div className="ct-math__icon">
                {abilityIcon ? (
                  <img src={abilityIcon} alt={`${actor?.champion ?? ""} ${beat.slot}`} />
                ) : actor ? (
                  <ChampionArt manifest={manifest} champion={actor.champion} variant="icon" />
                ) : null}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="ct-kicker">Why · event {beat.index + 1}</div>
                <div className="ct-math__title">{beat.label}</div>
                <div className="ct-math__subtitle">
                  {actor?.champion ?? beat.actorId} → {target?.champion ?? beat.targetId ?? "—"} · {formatDamage(beat.time, 3)} s
                </div>
              </div>
              {beat.hp ? (
                <div className="ct-math__applied">
                  <div className="ct-math__applied-value ct-num" data-testid="math-applied">
                    −{formatDamage(beat.hp.applied, 0)}
                  </div>
                  <div className="ct-kicker">HP damage</div>
                </div>
              ) : null}
            </header>

            <div className="ct-math__body">
              {explanation.steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  className={`ct-step ${step.status === "limited" ? "is-limited" : ""}`}
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduced ? { duration: 0 } : { duration: 0.35, delay: 0.05 + i * 0.07, ease: EASE_OUT }}
                  data-testid={`math-step-${step.id}`}
                  data-status={step.status}
                >
                  <div className="ct-step__n ct-num">{String(i + 1).padStart(2, "0")}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="ct-step__title">{STEP_TITLES[step.id]}</div>
                    <StepBody step={step} script={script} beat={beat} />
                    {"note" in step && step.note ? <div className="ct-step__note">{step.note}</div> : null}
                    <Prov fields={step.provenance} />
                  </div>
                </motion.div>
              ))}

              {explanation.limitations.length > 0 ? (
                <div className="ct-limits" data-testid="math-limitations">
                  <div className="ct-limits__title">Limitations</div>
                  <ul>
                    {explanation.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <details className="ct-raw" open={showRaw} onToggle={(e) => setShowRaw((e.currentTarget as HTMLDetailsElement).open)}>
                <summary>Raw kernel events for this action ({beat.action.kernelEvents.length})</summary>
                <pre>{JSON.stringify(beat.action.kernelEvents.map((e) => ({ seq: e.seq, type: e.type, payload: e.payload })), null, 1)}</pre>
              </details>
            </div>
          </motion.div>
        ) : (
          <div className="ct-math__body">
            <div className="ct-kicker" style={{ padding: "0.6rem 0" }}>
              Why
            </div>
            <p style={{ fontSize: "0.82rem", color: "hsl(var(--ct-ink-dim))", margin: 0 }}>
              Select an action on the timeline, or play the encounter, to see the authoritative calculation behind it.
            </p>
          </div>
        )}
    </section>
  );
}
