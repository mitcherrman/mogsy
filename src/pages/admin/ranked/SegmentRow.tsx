// ---------------------------------------------------------------------------
// One row of the ordered module list.
//
// COMPACT BY DEFAULT. A row states its position, what the slot is, and a
// one-line summary of its settings; the fields open on demand. Every row
// rendering every field fully expanded turned a five-module cycle into a page
// of scrolling, which is what made the order — the thing this screen exists to
// edit — the hardest part of it to see.
//
// REORDERING IS DIRECT. The position control moves a row to any slot in ONE
// interaction, and the row is draggable onto another. The arrows remain
// because a one-place nudge is genuinely what an arrow is for, but they are no
// longer the only way: putting a newly added module in slot 1 used to cost one
// click per module already in the pattern.
//
// A row renders whatever the segment actually is, including a module the
// catalog does not offer. That case is real and must not be destructive: a
// saved config can legitimately contain a module that was exposed once and is
// not now, or one this build predates. Such a row is shown, labelled, and left
// intact — movable and removable, but not editable, because this build has no
// description of its fields and guessing would corrupt it.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogModule, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";
import { summarizeSegment } from "@/lib/admin/rankedSegmentSummary";
import { cn } from "@/lib/utils";
import { GenerationPolicyPanel } from "./GenerationPolicyPanel";
import { ModuleConfigFields } from "./ModuleConfigFields";

export function SegmentRow({
  segment,
  index,
  total,
  module: catalogModule,
  onMoveUp,
  onMoveDown,
  onMoveTo,
  onRemove,
  onFieldChange,
  dragging,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  segment: SegmentSpecJson;
  index: number;
  total: number;
  module: CatalogModule | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Move this row straight to `to`. One interaction, any distance. */
  onMoveTo: (to: number) => void;
  onRemove: () => void;
  onFieldChange: (key: string, value: unknown) => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label = catalogModule?.label ?? segment.module_id;
  const summary = summarizeSegment(segment, catalogModule);

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-background/40",
        dragging && "opacity-50",
      )}
      data-testid={`segment-row-${index}`}
      data-module-id={segment.module_id}
      // Native HTML5 drag/drop: the preferred interaction, and it costs no
      // dependency. It is deliberately NOT the only one — it is unavailable to
      // keyboard and touch users, which is what the position control is for.
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
    >
      {/* ---- the compact row: order, identity, summary, controls ---- */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        <GripVertical
          aria-hidden="true"
          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid={`toggle-${index}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="w-5 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
          <span
            className="truncate text-xs font-medium"
            data-testid={`segment-summary-${index}`}
          >
            {summary}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {/* THE direct reorder. Last-to-first is one change of this value. */}
          <select
            aria-label={`Position of ${label}`}
            data-testid={`position-${index}`}
            className="h-7 rounded border border-border bg-background px-1 text-[11px]"
            value={index}
            onChange={(e) => onMoveTo(Number(e.target.value))}
          >
            {Array.from({ length: total }, (_, i) => (
              <option key={i} value={i}>{i + 1}</option>
            ))}
          </select>
          <Button
            type="button" size="icon" variant="ghost" className="h-7 w-7"
            aria-label={`Move ${label} up`} data-testid={`move-up-${index}`}
            disabled={index === 0} onClick={onMoveUp}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" size="icon" variant="ghost" className="h-7 w-7"
            aria-label={`Move ${label} down`} data-testid={`move-down-${index}`}
            disabled={index === total - 1} onClick={onMoveDown}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" size="icon" variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${label}`} data-testid={`remove-${index}`}
            // A pattern must be non-empty; a disabled control explains that
            // better than a save that fails for it.
            disabled={total <= 1} onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ---- the settings, on demand ---- */}
      {open && (
        <div className="border-t border-border/60 px-3 py-2" data-testid={`segment-body-${index}`}>
          <p className="mb-1.5 text-[10px] text-muted-foreground">
            {segment.module_id}.v{segment.module_version}
            {catalogModule && <> · {catalogModule.description}</>}
          </p>
          {catalogModule?.fixed && (
            <p className="mb-1.5 text-[10px] text-muted-foreground/80">
              Fixed by this module:{" "}
              {Object.entries(catalogModule.fixed)
                .map(([key, value]) => `${key} ${String(value)}`)
                .join(" · ")}
            </p>
          )}
          {catalogModule ? (
            <>
              <ModuleConfigFields
                fields={catalogModule.fields}
                segment={segment}
                index={index}
                onChange={onFieldChange}
              />
              {/* Renders only for a module that DECLARES runtime-generation
                  capabilities, and only once its set is chosen. A module
                  without them is unchanged. */}
              <GenerationPolicyPanel
                segment={segment}
                capabilities={catalogModule.mastery_sets}
                index={index}
              />
            </>
          ) : (
            <p
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200"
              data-testid={`unsupported-module-${index}`}
            >
              This build has no editor for {segment.module_id}.v{segment.module_version}. The
              slot is kept exactly as saved — you can move or remove it, but its settings are
              not editable here.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
