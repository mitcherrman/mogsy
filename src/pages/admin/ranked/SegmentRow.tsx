// ---------------------------------------------------------------------------
// One row of the ordered module list.
//
// A row renders whatever the segment actually is, including a module the
// catalog does not offer. That case is real and must not be destructive: a
// saved config can legitimately contain a module that was exposed once and is
// not now, or one this build predates. Such a row is shown, labelled, and left
// intact — movable and removable, but not editable, because this build has no
// description of its fields and guessing would corrupt it.
// ---------------------------------------------------------------------------

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogModule, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";
import { ModuleConfigFields } from "./ModuleConfigFields";

export function SegmentRow({
  segment,
  index,
  total,
  module: catalogModule,
  onMoveUp,
  onMoveDown,
  onRemove,
  onFieldChange,
}: {
  segment: SegmentSpecJson;
  index: number;
  total: number;
  module: CatalogModule | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onFieldChange: (key: string, value: unknown) => void;
}) {
  const label = catalogModule?.label ?? segment.module_id;

  return (
    <li
      className="rounded-lg border border-border bg-background/40 p-3"
      data-testid={`segment-row-${index}`}
      data-module-id={segment.module_id}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            <span className="mr-1.5 text-muted-foreground">{index + 1}.</span>
            {label}
            <span className="ml-1.5 font-normal text-[10px] text-muted-foreground">
              {segment.module_id}.v{segment.module_version}
            </span>
          </p>
          {catalogModule && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {catalogModule.description}
            </p>
          )}
          {catalogModule?.fixed && (
            <p className="mt-0.5 text-[10px] text-muted-foreground/80">
              Fixed by this module:{" "}
              {Object.entries(catalogModule.fixed)
                .map(([key, value]) => `${key} ${String(value)}`)
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Move ${label} up`}
            data-testid={`move-up-${index}`}
            disabled={index === 0}
            onClick={onMoveUp}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={`Move ${label} down`}
            data-testid={`move-down-${index}`}
            disabled={index === total - 1}
            onClick={onMoveDown}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${label}`}
            data-testid={`remove-${index}`}
            // A pattern must be non-empty; a disabled control explains that
            // better than a save that fails for it.
            disabled={total <= 1}
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {catalogModule ? (
        <ModuleConfigFields
          fields={catalogModule.fields}
          segment={segment}
          index={index}
          onChange={onFieldChange}
        />
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
    </li>
  );
}
