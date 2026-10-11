import { useState, type ReactNode } from "react";
import type { MogzyStatus, PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import type { EditorialResolution, ReportChangeNode, ReportGroupNode } from "@/lib/patch-reports/report-structure";
import { hasExactValues, usableHistoricalContext } from "@/lib/patch-reports/report-structure";
import { MOGZY_STATUS_GLOSS, MOGZY_STATUS_LABEL, explainChangeStatus, trackedValueAtBuild } from "@/lib/patch-reports/mogzy-status";
import { storedPassiveIconUrl } from "@/components/patch-reports/passiveArt";
import { HistoricalContext } from "@/components/patch-reports/HistoricalContext";
import { isImpactScopedLine } from "@/lib/patch-impact/eligibility";
import { cn } from "@/lib/utils";
import { DIRECTION_WORD, SOURCE_WORD } from "./editorial";

/* -------------------------------------------------------------------------- */
/* Editorial direction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The direction as Riot (or, flagged, Mogzy) classified it. Never computed
 * locally: a null claim reads as "Change", not as a guess.
 */
export const DirectionLabel = ({ editorial, className }: { editorial: EditorialResolution; className?: string }) => {
  if (!editorial.direction) {
    return (
      <span className={cn("dk-direction", className)} data-testid="deck-direction" data-direction="none">
        Change
      </span>
    );
  }
  const source = editorial.source ? SOURCE_WORD[editorial.source] : null;
  return (
    <span
      className={cn("dk-direction", className)}
      data-testid="deck-direction"
      data-direction={editorial.direction}
      title={source ? `${DIRECTION_WORD[editorial.direction]} — ${source}` : undefined}
    >
      {DIRECTION_WORD[editorial.direction]}
      {editorial.inferred && <em>· inferred by Mogzy</em>}
    </span>
  );
};

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/** Riot's exact notation, untouched; the arrow is deliberately neutral. */
export const Values = ({
  before,
  after,
  isNew = false,
  size = "md",
}: {
  before: string | null;
  after: string | null;
  isNew?: boolean;
  size?: "md" | "lg" | "xl";
}) => (
  <p className={cn("dk-values dk-wrap", size === "lg" && "dk-values--lg", size === "xl" && "dk-values--xl")} data-testid="deck-values">
    {before ? (
      <>
        <span className="sr-only">From </span>
        <span className="dk-values__before">{before}</span>
      </>
    ) : (
      isNew && <span className="sr-only">Newly added. </span>
    )}
    {/* The arrow travels with the new value, so a wrap never strands it. */}
    <span className="dk-values__to">
      {before && (
        <>
          <span aria-hidden className="dk-values__arrow">
            →
          </span>
          <span className="sr-only"> to </span>
        </>
      )}
      {after ? (
        <span className="dk-values__after">{after}</span>
      ) : (
        <span style={{ color: "var(--dk-ink-3)", fontStyle: "italic", fontFamily: "Inter, system-ui, sans-serif" }}>no after value published</span>
      )}
    </span>
  </p>
);

/* -------------------------------------------------------------------------- */
/* Mogzy status                                                               */
/* -------------------------------------------------------------------------- */

const TONE: Record<MogzyStatus, "current" | "flagged" | "unchecked" | "none"> = {
  matches: "current",
  applied: "current",
  pending: "flagged",
  mismatch: "flagged",
  unresolved: "unchecked",
  needs_interpretation: "unchecked",
  not_represented: "none",
};

export const StatusMark = ({ status, className }: { status: MogzyStatus; className?: string }) => (
  <span className={cn("dk-status", className)} data-tone={TONE[status]} data-mogzy-status={status} title={MOGZY_STATUS_GLOSS[status]} data-testid="deck-status">
    <span className="sr-only">Mogzy data status: </span>
    {MOGZY_STATUS_LABEL[status]}
  </span>
);

/* -------------------------------------------------------------------------- */
/* Ability group                                                              */
/* -------------------------------------------------------------------------- */

export const GroupArt = ({ group, card, className }: { group: ReportGroupNode; card: PatchReportCard; className?: string }) => {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : group.iconUrl ?? storedPassiveIconUrl(card, group);
  const glyph = group.slot ?? (/^base stats$/i.test(group.title) ? "ST" : "•");
  return (
    <span className={className} aria-hidden>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span className="dk-group__slot">{glyph}</span>}
    </span>
  );
};

const slotWord = (slot: string | null) => (slot === "P" ? "Passive" : slot);

export const GroupHeader = ({ group, card }: { group: ReportGroupNode; card: PatchReportCard }) => (
  <header className="dk-group" data-testid="deck-group" data-ability-slot={group.slot ?? undefined}>
    <GroupArt group={group} card={card} className="dk-group__art" />
    <div className="min-w-0">
      {group.slotLabel && <p className="dk-group__kicker">{slotWord(group.slotLabel)}</p>}
      <h4 className="dk-group__name dk-wrap">{group.name || group.title || "Changes"}</h4>
    </div>
  </header>
);

/* -------------------------------------------------------------------------- */
/* Change row                                                                 */
/* -------------------------------------------------------------------------- */

const MogzyNote = ({ change, impactScoped }: { change: PatchReportChange; impactScoped: boolean }) => {
  const sentences = explainChangeStatus(change, { impactScoped });
  const tracked = trackedValueAtBuild(change);
  return (
    <details className="text-[0.8125rem]" style={{ color: "var(--dk-ink-3)" }} data-testid="deck-mogzy-note">
      <summary className="cursor-pointer select-none list-none py-1 [&::-webkit-details-marker]:hidden">
        <StatusMark status={change.mogzy_status} />
        <span className="sr-only"> (what this means)</span>
      </summary>
      <div className="mt-1 space-y-1 border-l pl-3" style={{ borderColor: "var(--dk-line-2)" }}>
        {sentences.map((s) => (
          <p key={s} className="leading-relaxed">
            {s}
          </p>
        ))}
        {tracked && (
          <p>
            Mogzy&apos;s value when this report was built: <span className="dk-mono dk-wrap">{tracked}</span>
          </p>
        )}
      </div>
    </details>
  );
};

export const ChangeRow = ({
  node,
  card,
  entityStatus,
  valueSize = "lg",
  children,
}: {
  node: ReportChangeNode;
  card: PatchReportCard;
  entityStatus: MogzyStatus;
  valueSize?: "md" | "lg" | "xl";
  /** Extra content under the line (Impact summary, actions). */
  children?: ReactNode;
}) => {
  const { change } = node;
  const exact = hasExactValues(change);
  const property = (change.property_name || "").trim();
  const prose = (change.detail_text || "").trim();
  const impactScoped = isImpactScopedLine(card, change);
  const history = usableHistoricalContext(change);
  // The entity header already states the aggregate status; a line note earns
  // its place when it says something more (same rule as the List View).
  const noteworthy =
    change.mogzy_status !== entityStatus ||
    impactScoped ||
    Boolean(change.proposal_status) ||
    change.proposal_id != null ||
    Boolean(change.mogzy_current_raw) ||
    Boolean(change.mogzy_property);

  return (
    <li id={`deck-${node.anchor}`} className={cn("dk-row", property && "dk-row--labelled")} data-testid="deck-change" data-change-kind={change.change_kind}>
      {property && (
        <p className="dk-row__prop dk-wrap">
          {change.is_new && <span className="dk-new mr-2">New</span>}
          {property}
        </p>
      )}
      <div className="min-w-0">
        {exact ? (
          <Values before={change.before_raw?.trim() || null} after={change.after_raw?.trim() || null} isNew={change.is_new} size={valueSize} />
        ) : prose ? (
          <p className="dk-row__prose dk-wrap">
            {!property && change.is_new && <span className="dk-new mr-2">New</span>}
            {change.change_kind === "mechanical" && <span className="sr-only">Mechanic change: </span>}
            {prose}
          </p>
        ) : (
          <p className="dk-row__prose italic" style={{ color: "var(--dk-ink-3)" }}>
            Riot published no exact values for this change.
          </p>
        )}
        {history && <HistoricalContext context={history} />}
      </div>
      {(noteworthy || children) && (
        <div className="dk-row__meta">
          {children}
          {noteworthy && <MogzyNote change={change} impactScoped={impactScoped} />}
        </div>
      )}
    </li>
  );
};

export const FaceLabel = ({ children, id }: { children: ReactNode; id?: string }) => (
  <p className="dk-label" id={id}>
    {children}
  </p>
);

/** Long shared prose (a mode intro) shows four lines until asked for more. */
export const Clamp = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 320;
  return (
    <>
      <span className={long && !open ? "dk-clamp" : "dk-clamp dk-clamp--open"}>{text}</span>
      {long && (
        <button type="button" className="dk-clamp-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Show less" : "Read Riot's full note"}
        </button>
      )}
    </>
  );
};
