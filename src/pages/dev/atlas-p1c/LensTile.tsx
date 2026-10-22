/**
 * ATL-P1-C — a Lens plate.
 *
 * One component renders every subject kind; the body switches on what the
 * resolver returned (facets, evidence, a sealed gate) rather than on the
 * subject, so an "unavailable" ability and an "unavailable" Pro record look
 * the same and mean the same. Every action is a real button with a real
 * disabled reason; nothing here mutates data except through `act`.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Copy, GripVertical, Lock, Minus, Pin, Plus, Snowflake, Sparkles, Undo2, X, Scale, MoreHorizontal } from "lucide-react";
import { useId, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { contextChip, contextKey, contextLabel } from "@/lib/atlas-p1c/context";
import { CALENDAR_YEARS, PATCHES, PRO_SEASONS } from "@/lib/atlas-p1c/fixtures";
import type { Facet, LensView, TemporalContext } from "@/lib/atlas-p1c/types";
import { describeProTransform, subjectKey, type HistoryAction } from "@/lib/atlas-p1c/workspace";
import { ATLAS_DURATION, atlasTransition, chipVariants, facetVariants } from "./motion";

export interface LensTileProps {
  view: LensView;
  focused: boolean;
  collapsed: boolean;
  expanded: boolean;
  lifted: boolean;
  inTray: boolean;
  compact: boolean;
  reduced: boolean;
  position: { index: number; count: number };
  act: (action: HistoryAction) => void;
  onFocus: () => void;
  onToggleCollapse: () => void;
  onToggleExpand: () => void;
  onToggleTray: () => void;
  onGripPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMove: (delta: number) => void;
}

function formatValue(value: Facet["value"]): string {
  if (value === null) return "—";
  if (Array.isArray(value)) return value.join(" / ");
  return String(value);
}

function FacetRow({ facet, accentRanks }: { facet: Facet; accentRanks: boolean }) {
  const empty = facet.value === null;
  return (
    <li className={`facet${empty ? " facet--empty" : ""}`}>
      <span className="facet__label">{facet.label}</span>
      <span className="facet__value">
        {Array.isArray(facet.value) && accentRanks ? (
          <span className="facet__ranks" aria-label={`${facet.label} by rank: ${facet.value.join(", ")}`}>
            {facet.value.map((v, i) => (
              <span key={i} className="facet__rank" aria-hidden="true">
                {v}
              </span>
            ))}
          </span>
        ) : (
          <span>{empty ? facet.note ?? "not recorded" : formatValue(facet.value)}</span>
        )}
        {!empty && facet.unit ? <span className="facet__unit">{facet.unit}</span> : null}
      </span>
      {(facet.denominator || (facet.note && !empty)) && (
        <span className="facet__meta">
          {facet.denominator ? `n = ${facet.denominator.n} ${facet.denominator.label}` : null}
          {facet.denominator && facet.note ? " · " : null}
          {!empty && facet.note ? facet.note : null}
        </span>
      )}
    </li>
  );
}

function ContextPicker({ view, act, onClose }: { view: LensView; act: LensTileProps["act"]; onClose: () => void }) {
  const lens = view.lens;
  const universe = lens.subject.universe;
  const current = lens.override;
  const choose = (ctx: TemporalContext | null) => {
    act({ type: "setOverride", id: lens.id, context: ctx });
    onClose();
  };
  const option = (ctx: TemporalContext | null, label: string, hint?: string, disabled?: boolean) => {
    const checked = ctx === null ? current === null : current !== null && contextKey(current) === contextKey(ctx);
    return (
      <button
        key={ctx ? contextKey(ctx) : "inherit"}
        type="button"
        role="radio"
        aria-checked={checked}
        className="ctx-pop__option"
        onClick={() => choose(ctx)}
        disabled={disabled}
        title={disabled ? hint : undefined}
      >
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </button>
    );
  };
  return (
    <div role="radiogroup" aria-label="Temporal context for this Lens" className="ctx-pop__list" style={{ display: "grid", gap: 4 }}>
      {option(null, "Inherit global", "default")}
      {option({ kind: "current" }, universe === "leaguecraft" ? "Current (26.20)" : "Current season", universe === "leaguecraft" ? "patch" : "scope")}
      {universe === "leaguecraft"
        ? PATCHES.filter((p) => !p.isCurrent).map((p) => option({ kind: "lc-patch", patch: p.patch }, `Patch ${p.patch}`, p.orderingCertified ? "archive" : "ordering ?"))
        : [
            ...PRO_SEASONS.map((s) => option({ kind: "pro-season", season: s.season }, s.label, "season scope")),
            ...CALENDAR_YEARS.map((y) => option({ kind: "calendar-year", year: y }, `Calendar ${y}`, "date window")),
            option({ kind: "date-window", from: "2026-01-01", to: "2026-06-30" }, "Custom date window", "not audited in V0", true),
          ]}
    </div>
  );
}

export function LensTile(props: LensTileProps) {
  const { view, focused, collapsed, expanded, lifted, inTray, compact, reduced, position, act } = props;
  const lens = view.lens;
  const [ctxOpen, setCtxOpen] = useState(false);
  const titleId = useId();
  const isAbility = lens.subject.kind === "ability";
  const transform = isAbility ? describeProTransform(lens) : null;
  const lastTransform = lens.provenance[lens.provenance.length - 1] ?? null;
  const gated = view.capability === "gated";
  const bodyKey = `${subjectKey(lens.subject)}|${contextKey(view.effective.context)}`;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    switch (key) {
      case "p":
        act({ type: "pinLens", id: lens.id, pinned: !lens.pinned });
        break;
      case "h":
        act({ type: "holdLens", id: lens.id, held: !lens.held });
        break;
      case "s":
        props.onToggleTray();
        break;
      case "e":
        props.onToggleExpand();
        break;
      case "c":
        props.onToggleCollapse();
        break;
      case "d":
        act({ type: "cloneLens", id: lens.id });
        break;
      case "t":
        if (transform) act({ type: "transformToProChampion", id: lens.id });
        else if (lastTransform) act({ type: "revertTransform", id: lens.id });
        break;
      case "x":
      case "delete":
      case "backspace":
        act({ type: "removeLens", id: lens.id });
        break;
      default:
        if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowUp")) props.onMove(-1);
        else if (event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowDown")) props.onMove(1);
        else return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const contextOriginChip = (() => {
    const e = view.effective;
    if (e.origin === "held") return <span className="at-chip at-chip--ice">held</span>;
    if (e.origin === "override") return <span className="at-chip at-chip--gold">override</span>;
    return <span className="at-chip">inherits global</span>;
  })();

  const secondaryActions = (
    <>
      <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={() => act({ type: "cloneLens", id: lens.id })} title="Clone this Lens beside the original (D)">
        <Copy size={13} aria-hidden="true" /> Clone
      </button>
      {transform ? (
        <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={() => act({ type: "transformToProChampion", id: lens.id })} title={`Transform to Pro Play at champion level. ${transform.note} (T)`}>
          <Sparkles size={13} aria-hidden="true" /> To Pro Play
        </button>
      ) : lastTransform ? (
        <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={() => act({ type: "revertTransform", id: lens.id })} title="Revert the last transform; the ability Lens comes back exactly (T)">
          <Undo2 size={13} aria-hidden="true" /> Revert
        </button>
      ) : (
        <button type="button" className="at-btn at-btn--ghost at-btn--sm" disabled title="No transform is defined from this subject in V0.">
          <Sparkles size={13} aria-hidden="true" /> Transform
        </button>
      )}
      <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={props.onToggleExpand} aria-pressed={expanded} title="Expand across two columns (E)">
        <Plus size={13} aria-hidden="true" /> {expanded ? "Narrow" : "Expand"}
      </button>
      <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={props.onToggleCollapse} aria-pressed={collapsed} title="Collapse to the header (C)">
        <Minus size={13} aria-hidden="true" /> {collapsed ? "Open" : "Collapse"}
      </button>
      <button type="button" className="at-btn at-btn--ghost at-btn--sm" onClick={() => act({ type: "removeLens", id: lens.id })} title="Close this Lens; Undo brings it back (X)">
        <X size={13} aria-hidden="true" /> Close
      </button>
    </>
  );

  return (
    <motion.article
      layout={!reduced}
      transition={atlasTransition(ATLAS_DURATION.plate, reduced)}
      className={`lens${collapsed ? " lens--collapsed" : ""}`}
      data-universe={view.universe}
      data-focused={focused}
      data-lifted={lifted}
      data-held={Boolean(lens.held)}
      data-gated={gated}
      data-lens-id={lens.id}
      tabIndex={0}
      role="group"
      aria-roledescription="lens"
      aria-labelledby={titleId}
      aria-describedby={`${titleId}-ctx`}
      onFocus={(e) => {
        if (e.target === e.currentTarget) props.onFocus();
      }}
      onPointerDownCapture={props.onFocus}
      onKeyDown={onKeyDown}
    >
      <header className="lens__head">
        <button
          type="button"
          className="lens__grip"
          aria-label={`Drag to move ${view.title}. Position ${position.index + 1} of ${position.count}. Use Shift + arrow keys to move with the keyboard.`}
          onPointerDown={props.onGripPointerDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              props.onMove(-1);
            } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              props.onMove(1);
            }
          }}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <div className="lens__identity">
          <span className="lens__universe">{view.universe === "leaguecraft" ? "Leaguecraft" : "Pro Play"}</span>
          <h3 className="lens__title" id={titleId}>
            {view.title}
            <AnimatePresence initial={false}>
              {lens.pinned ? (
                <motion.span key="pin" className="at-chip at-chip--gold" variants={chipVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.chip, reduced)}>
                  <Pin size={10} aria-hidden="true" /> pinned
                </motion.span>
              ) : null}
              {lens.clonedFrom ? (
                <motion.span key="clone" className="at-chip" variants={chipVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.chip, reduced)}>
                  clone
                </motion.span>
              ) : null}
            </AnimatePresence>
          </h3>
          <p className="lens__subtitle">{view.subtitle}</p>
        </div>
        <div className="lens__seals">
          {compact ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="at-btn at-btn--ghost at-btn--icon" aria-label={`More actions for ${view.title}`}>
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="ctx-pop" style={{ width: 220, padding: 6 }}>
                <DropdownMenuItem onSelect={() => act({ type: "cloneLens", id: lens.id })}>Clone</DropdownMenuItem>
                {transform ? (
                  <DropdownMenuItem onSelect={() => act({ type: "transformToProChampion", id: lens.id })}>To Pro Play (drops {lens.subject.kind === "ability" ? lens.subject.slot : ""})</DropdownMenuItem>
                ) : lastTransform ? (
                  <DropdownMenuItem onSelect={() => act({ type: "revertTransform", id: lens.id })}>Revert transform</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>Transform (none defined)</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={props.onToggleCollapse}>{collapsed ? "Open" : "Collapse"}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onMove(-1)} disabled={position.index === 0}>Move earlier</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => props.onMove(1)} disabled={position.index >= position.count - 1}>Move later</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => act({ type: "removeLens", id: lens.id })}>Close</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="lens__context" id={`${titleId}-ctx`}>
        <Popover open={ctxOpen} onOpenChange={setCtxOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={`at-chip at-chip--accent at-chip--button`} aria-label={`Context: ${contextLabel(view.effective.context)}. Change this Lens's context.`} disabled={Boolean(lens.held)} title={lens.held ? "Release the hold to change this Lens's context." : "Set a per-Lens override"}>
              {contextChip(view.effective.context)}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="ctx-pop">
            <p className="ctx-pop__title">This Lens reads under</p>
            <ContextPicker view={view} act={act} onClose={() => setCtxOpen(false)} />
            <p className="at-why">Overrides apply to this Lens only. The global context keeps steering every Lens without one.</p>
          </PopoverContent>
        </Popover>
        {contextOriginChip}
        {view.effective.diverges ? <span className="at-chip at-chip--gold">diverges</span> : null}
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={view.effective.explanation}
            className="lens__context-explain"
            data-diverges={view.effective.diverges}
            variants={facetVariants(reduced)}
            initial="enter"
            animate="center"
            exit="exit"
            transition={atlasTransition(ATLAS_DURATION.facet, reduced)}
          >
            {view.effective.explanation}
          </motion.span>
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {lastTransform && !collapsed ? (
          <motion.div
            key={`ribbon-${lastTransform.seq}`}
            className="lens__ribbon"
            role="status"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={atlasTransition(ATLAS_DURATION.facet, reduced)}
            style={{ overflow: "hidden" }}
          >
            <div className="lens__ribbon-row">
              <span>
                <strong>Transformed</strong> from {lastTransform.from.kind === "ability" ? `${view.title} ${lastTransform.from.slot}` : "another universe"} · crosswalk {lastTransform.crosswalk.status}
              </span>
              <button type="button" className="at-btn at-btn--sm" onClick={() => act({ type: "revertTransform", id: lens.id })}>
                <Undo2 size={12} aria-hidden="true" /> Revert
              </button>
            </div>
            <span>
              Dropped: <strong>{lastTransform.droppedFacets.join(", ")}</strong>. No Pro ability-usage numbers exist, so nothing was approximated.
              {lastTransform.clearedContext ? " The Lens's own context override was cleared: a Leaguecraft patch does not crosswalk to a Pro season scope." : ""}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="lens__body">
        <AnimatePresence initial={false} mode="wait">
          <motion.div key={bodyKey} variants={facetVariants(reduced)} initial="enter" animate="center" exit="exit" transition={atlasTransition(ATLAS_DURATION.facet, reduced)} style={{ display: "grid", gap: 8 }}>
            {gated && view.gate ? (
              <div className="gate" aria-live="off">
                <span className="gate__seal" aria-hidden="true">
                  <Lock size={18} />
                </span>
                <strong style={{ fontFamily: "var(--at-display)", letterSpacing: "0.08em", fontSize: 12 }}>OWNER-ONLY · SEALED</strong>
                <span className="gate__route">{view.gate.route}</span>
                <button type="button" className="at-btn at-btn--sm" disabled title={view.gate.reason} style={{ justifySelf: "center" }}>
                  Request owner session
                </button>
                <span className="at-why">{view.gate.reason} The route is never called from this prototype.</span>
              </div>
            ) : null}
            {view.facets.length ? (
              <ul className="facets">
                {view.facets.map((facet) => (
                  <FacetRow key={facet.key} facet={facet} accentRanks={isAbility} />
                ))}
              </ul>
            ) : null}
            {view.evidence.length ? (
              <div>
                <span className="evidence__title">Recorded change evidence</span>
                <ul className="evidence" style={{ marginTop: 4 }}>
                  {view.evidence.map((line) => (
                    <li key={line.id} className="evidence__line">
                      <span className="evidence__patch" data-uncertified={!line.orderingCertified}>
                        {line.patch}
                      </span>
                      <span>{line.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {view.notices.length ? (
              <ul className="notices">
                {view.notices.map((n, i) => (
                  <li key={i} className={`notice notice--${n.tone}`}>
                    {n.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="lens__actions">
        <button type="button" className="at-btn at-btn--sm" aria-pressed={lens.pinned} onClick={() => act({ type: "pinLens", id: lens.id, pinned: !lens.pinned })} title="Pinned Lenses survive Clear and are listed in the deck (P)">
          <Pin size={13} aria-hidden="true" /> Pin
        </button>
        <button type="button" className="at-btn at-btn--sm" aria-pressed={Boolean(lens.held)} onClick={() => act({ type: "holdLens", id: lens.id, held: !lens.held })} title="Hold freezes this Lens on its current context; global changes pass it by (H)">
          <Snowflake size={13} aria-hidden="true" /> Hold
        </button>
        <button type="button" className="at-btn at-btn--sm" aria-pressed={inTray} onClick={props.onToggleTray} disabled={gated} title={gated ? "A sealed Lens cannot be compared." : "Select for comparison; pick two, then Compose (S)"}>
          <Scale size={13} aria-hidden="true" /> {inTray ? "Selected" : "Select"}
        </button>
        {compact ? null : secondaryActions}
      </div>
    </motion.article>
  );
}
