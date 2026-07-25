import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  resolvePatchReportAsset,
  type MogzyStatus,
  type PatchReportCard,
  type PatchReportChange,
} from "@/lib/patch-reports/api";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<MogzyStatus, string> = {
  matches: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  applied: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  mismatch: "bg-red-500/15 text-red-400 border-red-500/40",
  unresolved: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  needs_interpretation: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  not_represented: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const STATUS_TEXT: Record<MogzyStatus, string> = {
  matches: "Matches",
  applied: "Applied",
  pending: "Pending",
  mismatch: "Mismatch",
  unresolved: "Unresolved",
  needs_interpretation: "Needs interpretation",
  not_represented: "Not represented",
};

export const StatusBadge = ({ status }: { status: MogzyStatus }) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
      STATUS_STYLES[status],
    )}
  >
    {STATUS_TEXT[status]}
  </span>
);

const EntityImage = ({ card }: { card: PatchReportCard }) => {
  const [errored, setErrored] = useState(false);
  // Prefer Mogzy-served assets; fall back to the official image; degrade to initials.
  const src =
    (!errored && resolvePatchReportAsset(card.mogzy_image_path)) ||
    (!errored && card.official_image_url) ||
    null;
  if (!src) {
    return (
      <div
        aria-hidden
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg font-bold text-muted-foreground"
      >
        {card.entity_name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={card.entity_name}
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
    />
  );
};

const AbilityIcon = ({ change }: { change: PatchReportChange }) => {
  const [errored, setErrored] = useState(false);
  if (!change.ability_icon_url || errored) return null;
  return (
    <img
      src={change.ability_icon_url}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-5 w-5 rounded border border-border"
    />
  );
};

const ChangeRow = ({ change }: { change: PatchReportChange }) => (
  <li className="py-2">
    <div className="flex flex-wrap items-center gap-2">
      {change.is_new && (
        <span className="rounded bg-emerald-600/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
          New
        </span>
      )}
      <span className="text-sm font-medium">{change.property_name || "Change"}</span>
      <StatusBadge status={change.mogzy_status} />
      {change.proposal_status && (
        <span className="text-[11px] text-muted-foreground">
          review: {change.proposal_status.toLowerCase()}
        </span>
      )}
    </div>
    {change.change_kind === "numeric" ? (
      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm">
        <span className="text-muted-foreground line-through decoration-red-400/60">
          {change.before_raw}
        </span>
        <span aria-hidden className="text-[#c9a84c]">
          →
        </span>
        <span className="font-semibold text-foreground">{change.after_raw}</span>
      </div>
    ) : (
      <p className="mt-1 text-sm text-muted-foreground">{change.detail_text}</p>
    )}
    {change.change_kind === "numeric" && (
      <p className="mt-1 text-xs text-muted-foreground">
        Mogzy currently:{" "}
        {change.mogzy_current_raw ? (
          <span className="font-mono">{change.mogzy_current_raw}</span>
        ) : (
          <span className="italic">value not available in Mogzy</span>
        )}
      </p>
    )}
  </li>
);

export const PatchReportEntityCard = ({
  card,
  hideSectionBadge = false,
}: {
  card: PatchReportCard;
  hideSectionBadge?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const groups = new Map<string, PatchReportChange[]>();
  for (const change of card.changes) {
    const key = change.group_title || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(change);
  }

  return (
    <article
      data-testid="patch-report-card"
      className="rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-[#c9a84c]/40"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-4 text-left"
      >
        <EntityImage card={card} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold">{card.entity_name}</h3>
            <StatusBadge status={card.aggregate_status} />
            {!hideSectionBadge &&
              card.section_title !== "Champions" &&
              card.section_title !== "Items" &&
              card.section_title !== "Runes" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {card.section_title}
                </span>
              )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {card.changes.length} change{card.changes.length === 1 ? "" : "s"}
            {!card.mogzy_entity_ref && card.entity_type !== "system" && (
              <span className="ml-2 italic">not in Mogzy&apos;s catalog yet</span>
            )}
          </p>
          {card.context_text && (
            <p className={cn("mt-1 text-sm text-muted-foreground", !expanded && "line-clamp-2")}>
              {card.context_text}
            </p>
          )}
        </div>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          {[...groups.entries()].map(([title, changes]) => (
            <div key={title || "__default"} className="mt-3">
              {title && (
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[#c9a84c]">
                  <AbilityIcon change={changes[0]} />
                  {title}
                </h4>
              )}
              <ul className="divide-y divide-border/60">
                {changes.map((change, i) => (
                  <ChangeRow key={i} change={change} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};
