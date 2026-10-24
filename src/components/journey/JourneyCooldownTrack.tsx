import type { CSSProperties } from "react";

import { exactNumber } from "@/lib/journey/stats";
import { approxTenths } from "@/lib/journey/reasoning";
import type { CooldownChange, CooldownContinuity } from "@/lib/journey/cooldownContinuity";

/**
 * Daily three acts — the PERSISTENT COOLDOWN TRACK across a Summoner Spell
 * Mastery set's three questions.
 *
 * The Journey's magnitude bar (`.journey-magnitude`, see `JourneyMagnitude`),
 * kept on the card for the whole set: the track is the spell's base cooldown,
 * the fill the SERVED share that remains. Each reveal moves the fill from the
 * previous stage's served multiplier to this one's (`--jm-from` →
 * `--jm-ratio`), and the line under it names what changed — a source added,
 * or Ionian Boots UPGRADED to Crimson Lucidity (replaced, never stacked).
 *
 * Nothing of the stage on screen is drawn before its reveal: its end reads
 * the withheld `?`, and the fill holds the previous stage's settled value.
 * Every number is served (`cooldown_working`); the only arithmetic is the
 * subtraction behind "shorter", as the Journey's own cooldown reasoning does.
 */
export function JourneyCooldownTrack({ continuity, testId = "journey-cooldown-track" }: {
  continuity: CooldownContinuity;
  testId?: string;
}) {
  const { stages, current } = continuity;
  const now = stages[current - 1]?.working ?? null;
  const before = current > 1 ? stages[current - 2]?.working ?? null : null;
  const first = stages[0]?.working ?? null;
  const base = first ? first.answer
    : before ? `${exactNumber(before.baseCooldown)}s` : "?";
  const fromRatio = before ? before.cooldownMultiplier : 1;
  const toRatio = now ? now.cooldownMultiplier : fromRatio;
  const change = now ? stages[current - 1].change : null;
  const delta = now && before
    ? `${approxTenths(before.effectiveCooldown - now.effectiveCooldown)}s shorter` : null;
  const title = continuity.spell ? `${continuity.spell} cooldown` : "Summoner spell cooldown";
  const nowWords = now ? `now ${now.answer}` : "the new cooldown is hidden until you answer";
  const spoken = `${title}: base ${base === "?" ? "hidden until you answer" : base}`
    + (before && !now ? `, previously ${before.answer}` : "")
    + `; ${nowWords}${delta ? ` (${delta})` : ""}${change ? `. ${changeWords(change)}` : ""}.`;

  return (
    <div className="journey-cdtrack" data-testid={testId} data-stage={current}
      data-revealed={now ? "true" : "false"}>
      <div className="journey-cdtrack__head">
        <span className="journey-cdtrack__title">{title}</span>
        <ol className="journey-cdtrack__steps" aria-hidden>
          {stages.map((s) => (
            <li key={s.stage} className="journey-cdtrack__step"
              data-state={s.stage < current || (s.stage === current && now) ? "done"
                : s.stage === current ? "current" : "upcoming"}>
              {s.stage}
            </li>
          ))}
        </ol>
      </div>
      <div className="journey-magnitude journey-magnitude--continuity" role="img"
        aria-label={spoken} data-testid={`${testId}-bar`} data-from={fromRatio} data-ratio={toRatio}
        style={{ "--jm-ratio": String(toRatio), "--jm-from": String(fromRatio) } as CSSProperties}>
        <span aria-hidden className="journey-magnitude__end">
          <b>{base}</b> base
        </span>
        <span aria-hidden className="journey-magnitude__track">
          {/* Keyed on the stage and its reveal, so each reveal plays the move
              from the previous served share to this one exactly once. */}
          <span key={`${current}:${now ? "r" : "q"}`} className="journey-magnitude__fill" />
        </span>
        <span aria-hidden className="journey-magnitude__end journey-magnitude__end--to"
          data-testid={`${testId}-now`}>
          <b>{now ? now.answer : before ? before.answer : "?"}</b> {now ? "now" : before ? "so far" : ""}
        </span>
      </div>
      {/* One fixed line under the bar, always present (nothing moves on a
          reveal): what changed and by how much once revealed, else a prompt
          that names no value. */}
      <p className="journey-cdtrack__foot" aria-hidden>
        <span className="journey-cdtrack__change" data-change-kind={change?.kind ?? "none"}
          data-testid={change ? `${testId}-change` : undefined}
          title={change ? changeWords(change) : undefined}>
          {change ? changeLabel(change) : now ? "Base cooldown set" : "Answer to update the cooldown"}
        </span>
        {delta && (
          <span className="journey-magnitude__delta" data-testid={`${testId}-delta`}>{delta}</span>
        )}
      </p>
      <span className="sr-only" aria-live="polite">{now ? spoken : ""}</span>
    </div>
  );
}

/** The compact visible line (the full sentence is the label and the title). */
function changeLabel(change: CooldownChange): string {
  const haste = (n: number) => `${exactNumber(n)} haste`;
  if (change.kind === "upgrade") {
    return `${change.to.name} replaces ${change.from} · ${haste(change.to.summonerSpellHaste)}`;
  }
  return `+ ${change.source.name} · ${haste(change.source.summonerSpellHaste)}`;
}

function changeWords(change: CooldownChange): string {
  if (change.kind === "upgrade") {
    return `${change.from} upgraded to ${change.to.name}: replaced, not stacked `
      + `(${exactNumber(change.to.summonerSpellHaste)} summoner spell haste)`;
  }
  return `+ ${change.source.name} (${exactNumber(change.source.summonerSpellHaste)} `
    + "summoner spell haste)";
}
