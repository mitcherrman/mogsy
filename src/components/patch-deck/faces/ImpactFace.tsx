import { useEffect, useState } from "react";
import type { DeckEntityCard, ImpactLine } from "@/lib/patch-deck/deck";
import { impactLines } from "@/lib/patch-deck/deck";
import { usePatchImpactLoader } from "@/hooks/usePatchImpactLoader";
import { IMPACT_CHECKPOINTS, IMPACT_MAX_LEVEL, IMPACT_MIN_LEVEL, clampImpactLevel } from "@/lib/patch-impact/math";
import type { ImpactUnavailableReason, PatchImpactAnalysis, StatProjection } from "@/lib/patch-impact/types";
import { formatDelta, formatParameterValue, formatRelative, formatStatValue, parameterLabel, projectedStatLabel } from "@/components/patch-impact/format";
import { PROVENANCE_COPY, describeProjectionInputs, impactProvenanceKind } from "@/components/patch-impact/provenance";
import { DeckImpactChart } from "../DeckImpactChart";
import { FaceLabel, Values } from "../shared";

/**
 * Why a projection is not available, for a reader. Each sentence states only
 * what the domain reason means; none promises a projection that does not exist.
 */
const REASON_COPY: Record<ImpactUnavailableReason, string> = {
  out_of_scope: "This line is outside Mogzy Impact's scope (Summoner's Rift champion base stats).",
  property_unmapped: "Mogzy has not mapped this line to one of its champion properties, so it is not projected.",
  property_unsupported: "This base stat is not one Mogzy Impact projects yet.",
  unparseable_value: "Riot's value is written in a form Mogzy's grammar does not read as plain numbers.",
  no_parameter_change: "Riot's before and after values are the same.",
  ambiguous_card_lines: "Several lines in this entry claim the same stat, so Mogzy does not pick one.",
  projection_deferred: "Attack speed is reported as a parameter fact only; Mogzy does not project it by level yet.",
  identity_unresolved: "Mogzy could not resolve this champion in its catalog, so it has no companion value.",
  history_incomplete: "Mogzy's evidence for the unchanged half of this stat has not been loaded.",
  unclassified_base_stat_change: "A base-stat line in this champion's history is one Mogzy cannot classify, so a projection would rest on an unproven value.",
  family_continuity_unproven: "Mogzy cannot prove the companion value stayed constant across later patches.",
  companion_chain_break: "Later patch notes for this stat do not line up with Mogzy's current data.",
  canonical_value_invalid: "Mogzy's stored companion value is not a usable number.",
  reconciliation_failed: "Mogzy's data update for a later patch did not finish, so the companion value is not trusted.",
  no_resource: "This champion has no mana pool, so there is nothing to project.",
};

const Scrubber = ({ projection, level, onLevel }: { projection: StatProjection; level: number; onLevel: (l: number) => void }) => {
  const point = projection.levels[level - 1] ?? projection.levels[projection.levels.length - 1];
  const stat = projectedStatLabel(projection.family);
  const ticks = Array.from(new Set<number>([...IMPACT_CHECKPOINTS, ...(projection.crossoverLevel ? [projection.crossoverLevel] : [])])).sort((a, b) => a - b);
  const fill = `${((level - IMPACT_MIN_LEVEL) / (IMPACT_MAX_LEVEL - IMPACT_MIN_LEVEL)) * 100}%`;
  return (
    <div className="space-y-2" data-testid="deck-impact-dial" data-level={level}>
      <div className="flex items-baseline justify-between">
        <label className="dk-eyebrow" htmlFor={`deck-level-${projection.family}`}>
          Champion level
        </label>
        <span className="dk-mono text-[0.9375rem] font-bold" aria-hidden>
          {point.level}
        </span>
      </div>
      <input
        id={`deck-level-${projection.family}`}
        type="range"
        className="dk-range"
        style={{ ["--dk-fill" as string]: fill }}
        min={IMPACT_MIN_LEVEL}
        max={IMPACT_MAX_LEVEL}
        step={1}
        value={level}
        onChange={(e) => onLevel(clampImpactLevel(Number(e.target.value)))}
        aria-valuetext={`Level ${point.level}: ${formatStatValue(point.before)} to ${formatStatValue(point.after)} ${stat}`}
      />
      <div className="dk-ticks" role="group" aria-label="Jump to level">
        {ticks.map((t) => (
          <button
            key={t}
            type="button"
            className="dk-tick"
            aria-pressed={level === t}
            data-crossover={t === projection.crossoverLevel ? "true" : undefined}
            onClick={() => onLevel(t)}
            aria-label={t === projection.crossoverLevel ? `Level ${t}, where the difference changes sign` : `Level ${t}`}
          >
            {t === projection.crossoverLevel ? `${t} ✦` : t}
          </button>
        ))}
      </div>
    </div>
  );
};

const Readout = ({ projection, level }: { projection: StatProjection; level: number }) => {
  const point = projection.levels[level - 1] ?? projection.levels[projection.levels.length - 1];
  const stat = projectedStatLabel(projection.family);
  const rel = formatRelative(point.relDelta);
  return (
    <div className="space-y-2">
      <div className="dk-readout">
        <div>
          <p className="dk-readout__k">
            Before · <abbr title={`level ${point.level}`}>L{point.level}</abbr>
          </p>
          <p className="dk-readout__v dk-readout__v--before">{formatStatValue(point.before)}</p>
        </div>
        <span aria-hidden className="dk-readout__arrow">
          →
        </span>
        <div>
          <p className="dk-readout__k">
            After · <abbr title={`level ${point.level}`}>L{point.level}</abbr>
          </p>
          <p className="dk-readout__v dk-readout__v--after">{formatStatValue(point.after)}</p>
        </div>
      </div>
      <p className="dk-delta">
        {formatDelta(point.absDelta, "flat", "projected")} {stat}
        {rel ? ` · ${rel}` : ""}
        {projection.crossoverLevel !== null && <span style={{ color: "var(--dk-ink-3)" }}> · sign changes at level {projection.crossoverLevel}</span>}
      </p>
    </div>
  );
};

const Provenance = ({ analysis }: { analysis: PatchImpactAnalysis }) => {
  const kind = impactProvenanceKind(analysis);
  if (!kind) return null;
  const rows = analysis.status === "projected" ? describeProjectionInputs(analysis.projection) : [];
  return (
    <details className="text-[0.8125rem]" style={{ color: "var(--dk-ink-3)" }}>
      <summary className="cursor-pointer select-none list-none py-1 [&::-webkit-details-marker]:hidden" style={{ color: "var(--dk-gold)" }}>
        Where these numbers come from · {PROVENANCE_COPY[kind].short}
      </summary>
      <div className="mt-1 space-y-1 border-l pl-3" style={{ borderColor: "var(--dk-line-2)" }}>
        <p>{PROVENANCE_COPY[kind].long}</p>
        {rows.map((row) => (
          <p key={row.key}>
            <span style={{ color: "var(--dk-ink-2)" }}>{row.label}:</span> <span className="dk-mono">{row.values}</span> — {row.source}
          </p>
        ))}
      </div>
    </details>
  );
};

const ImpactPanel = ({ card, line, patchVersion, active }: { card: DeckEntityCard; line: ImpactLine; patchVersion: string; active: boolean }) => {
  const loader = usePatchImpactLoader({ card: card.entity.card, change: line.change, patchVersion });
  const { analysis, state, canRequest, requestProjection } = loader;
  const [level, setLevel] = useState(IMPACT_MAX_LEVEL);

  // Opening the Impact face is the reader's request for the evidence. Nothing
  // loads while the face is closed; a retry is an explicit button.
  useEffect(() => {
    if (active && state.status === "idle" && canRequest) requestProjection();
  }, [active, state.status, canRequest, requestProjection]);

  const property = (line.change.property_name || "").trim();
  const projected = analysis.status === "projected" ? analysis.projection : null;

  const riot = (
    <header className="space-y-2">
      <p className="dk-eyebrow">Riot · Base Stats</p>
      <h4 className="text-[1.125rem] font-semibold dk-wrap">{property}</h4>
      <Values before={line.change.before_raw?.trim() || null} after={line.change.after_raw?.trim() || null} size="xl" />
    </header>
  );

  const facts =
    analysis.status === "unavailable" ? null : (
      <div>
        <p className="dk-eyebrow pb-1">Parameter change</p>
        <ul>
          {analysis.facts.map((f) => (
            <li key={f.property} className="dk-fact" data-testid="deck-impact-fact">
              <span className="font-medium">{parameterLabel(f.family, f.half)}</span>
              <span className="dk-mono text-right" style={{ color: "var(--dk-ink-2)" }}>
                {formatParameterValue(f.before, f.unit)} → <strong style={{ color: "var(--dk-ink)" }}>{formatParameterValue(f.after, f.unit)}</strong>
                <span className="block text-[0.8125rem]" style={{ color: "var(--dk-gold-2)" }}>
                  {formatDelta(f.absDelta, f.unit, "parameter")}
                  {formatRelative(f.relDelta) ? ` · ${formatRelative(f.relDelta)}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <article className="space-y-5" data-testid="deck-impact-panel" data-impact-status={analysis.status}>
      {analysis.status === "unavailable" ? (
        <>
          {riot}
          <p className="text-[0.9375rem] leading-relaxed" style={{ color: "var(--dk-ink-3)" }} data-testid="deck-impact-unavailable">
            {REASON_COPY[analysis.reason]}
          </p>
        </>
      ) : projected ? (
        <div className="dk-impact dk-impact--split">
          <div className="space-y-6">
            {riot}
            <Readout projection={projected} level={level} />
            {facts}
          </div>
          <div className="space-y-5">
            <DeckImpactChart projection={projected} level={level} onLevelChange={setLevel} />
            <Scrubber projection={projected} level={level} onLevel={setLevel} />
            <Provenance analysis={analysis} />
          </div>
        </div>
      ) : (
        <div className="dk-impact dk-impact--split">
          <div className="space-y-6">
            {riot}
            {facts}
          </div>
          <div className="space-y-4">
            {state.status === "loading" ? (
              <div className="space-y-3" aria-busy="true" data-testid="deck-impact-loading">
                <div className="dk-skeleton h-48 w-full" />
                <div className="dk-skeleton h-3 w-2/3" />
                <p className="text-[0.8125rem]" style={{ color: "var(--dk-ink-3)" }}>
                  Loading Mogzy&apos;s evidence for the unchanged half of this stat…
                </p>
              </div>
            ) : state.status === "failed" ? (
              <div className="space-y-3" data-testid="deck-impact-failed">
                <p className="text-[0.9375rem]" style={{ color: "var(--dk-ink-3)" }}>
                  {state.error.message}
                </p>
                {canRequest && (
                  <button type="button" className="dk-btn" onClick={requestProjection}>
                    Retry
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[0.9375rem] leading-relaxed" style={{ color: "var(--dk-ink-3)" }} data-testid="deck-impact-parameter-only">
                {analysis.status === "parameter_only" ? REASON_COPY[analysis.projectionUnavailable] : null}
              </p>
            )}
            <Provenance analysis={analysis} />
          </div>
        </div>
      )}
    </article>
  );
};

export const ImpactFace = ({ card, patchVersion, active }: { card: DeckEntityCard; patchVersion: string; active: boolean }) => {
  const lines = impactLines(card.entity);
  const name = card.entity.card.entity_name;
  return (
    <div className="space-y-8" data-testid="deck-face-impact">
      {lines.length === 0 ? (
        <>
          <FaceLabel>Mogzy Impact · base stats by level</FaceLabel>
          <div className="dk-tile dk-tile--muted space-y-2 text-[0.9375rem] leading-relaxed" style={{ color: "var(--dk-ink-2)" }} data-testid="deck-impact-none">
            <p>
              Mogzy Impact works on champion base-stat lines (health, AD, armor, MR, mana) from the Summoner&apos;s Rift Champions
              section, projecting Riot&apos;s before and after values from level 1 to 18.
            </p>
            <p style={{ color: "var(--dk-ink-3)" }}>
              {card.mode
                ? `${name}'s ${card.section.title} changes are mode-scoped, so Mogzy does not project them.`
                : `${name}'s changes this patch do not include a projectable base stat, so there is no Mogzy projection. Riot's exact values on the Changes face are the full picture.`}
            </p>
          </div>
        </>
      ) : (
        lines.map((line, i) => (
          <section key={line.anchor} className="space-y-5">
            <FaceLabel>
              Mogzy Impact{lines.length > 1 ? ` · ${i + 1} of ${lines.length}` : ""} · {name}
            </FaceLabel>
            <ImpactPanel card={card} line={line} patchVersion={patchVersion} active={active} />
          </section>
        ))
      )}
      <p className="text-[0.75rem] leading-relaxed" style={{ color: "var(--dk-ink-4)" }}>
        Impact describes parameters and projected base stats, before items and runes. It never estimates win rate, matchup effects or
        overall power.
      </p>
    </div>
  );
};
