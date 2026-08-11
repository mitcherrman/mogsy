/**
 * Focus-entity picker for the parameterized GRAPH1 families.
 *
 * A button trigger that opens a `role="listbox"` popup containing a search input
 * and one `role="option"` row per match. That is the convention already shipped
 * in this codebase (CombatLab's SearchSelect); the GRAPH1 control surface
 * deliberately avoids Radix to stay zero-bundle-weight, so this is hand-rolled
 * with native elements rather than pulling in cmdk — which is a dependency this
 * repo has never imported anywhere.
 *
 * Rendering is capped. A player domain has thousands of entities and dumping
 * them into a dropdown is exactly what this replaces; the caller supplies at most
 * a page of results and `hiddenCount` explains the rest.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { Graph1Entity } from "@/graph1/useGraph1Entities";

export interface EntityPickerProps {
  label: string;
  /** Rows to render, already filtered/ranked by the caller. */
  options: Graph1Entity[];
  selectedId?: string;
  /** Falls back to `selectedId` before the entity's own row has loaded. */
  selectedLabel?: string;
  onSelect: (entity: Graph1Entity) => void;
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  error?: boolean;
  /** How many further matches exist beyond `options`. */
  hiddenCount?: number;
  disabled?: boolean;
}

export default function EntityPicker({
  label,
  options,
  selectedId,
  selectedLabel,
  onSelect,
  query,
  onQueryChange,
  placeholder,
  loading = false,
  error = false,
  hiddenCount = 0,
  disabled = false,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useMemo(
    () => `graph1-entity-${label.toLowerCase().replace(/\W+/g, "-")}`,
    [label],
  );

  // Reset the cursor whenever the visible set changes, so Enter can never
  // select a row the reader is no longer looking at.
  useEffect(() => setActiveIdx(0), [options]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commit = (entity: Graph1Entity) => {
    onSelect(entity);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(0, options.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter" && options[activeIdx]) {
      event.preventDefault();
      commit(options[activeIdx]);
    }
  };

  const triggerText = selectedLabel || selectedId || `Select ${label}`;

  return (
    <div className="flex items-start gap-2 text-xs" ref={rootRef}>
      <span className="w-16 shrink-0 pt-1 text-muted-foreground">{label}</span>
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`${label}: ${triggerText}`}
          onClick={() => setOpen((v) => !v)}
          className="w-full max-w-xs truncate rounded border border-border bg-background px-2 py-1 text-left text-xs disabled:opacity-50"
        >
          {triggerText}
        </button>

        {open && (
          <div className="absolute left-0 z-20 mt-1 w-full max-w-xs rounded border border-border bg-background p-1 shadow-lg">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
              className="mb-1 w-full rounded border border-border bg-background px-1.5 py-1 text-xs"
            />
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              aria-live="polite"
              className="max-h-56 overflow-y-auto"
            >
              {loading && (
                <p className="px-1.5 py-1 text-muted-foreground">Searching…</p>
              )}
              {error && !loading && (
                <p className="px-1.5 py-1 text-destructive">
                  Could not load {label.toLowerCase()}s. Try again.
                </p>
              )}
              {!loading && !error && options.length === 0 && (
                <p className="px-1.5 py-1 text-muted-foreground">No matches</p>
              )}
              {options.map((entity, idx) => (
                <button
                  key={entity.id}
                  type="button"
                  role="option"
                  aria-selected={entity.id === selectedId}
                  data-active={idx === activeIdx || undefined}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => commit(entity)}
                  onKeyDown={onKeyDown}
                  className={`flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left ${
                    idx === activeIdx ? "bg-muted" : ""
                  } ${entity.id === selectedId ? "font-semibold" : ""}`}
                >
                  <span className="min-w-0 truncate">
                    {entity.label}
                    {entity.sublabel && (
                      <span className="ml-1 text-muted-foreground">
                        {entity.sublabel}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {entity.games.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
            {hiddenCount > 0 && (
              <p className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                {hiddenCount.toLocaleString()} more — refine the search
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
