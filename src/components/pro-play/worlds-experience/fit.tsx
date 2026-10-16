/**
 * UX4 — how the Worlds experience fits a fixed viewport without scrolling.
 *
 * Nothing in the experience scrolls: not the document, not a panel. Content
 * is made to FIT, never clipped to look as if it does. Two tools do that:
 *
 * - `FitCascade` tries a component's compositions from the most spacious to
 *   the most compact and keeps the first one whose content fits its box,
 *   measured in the real layout before the browser paints. A bracket that is
 *   readable whole is drawn whole; one that is not is drawn as focused
 *   regions with explicit controls. The last level is the design's floor and
 *   must fit at every supported viewport (the browser audit checks it).
 *
 * - `FitPages` shows as many rows of a list as its region really holds,
 *   derived from the measured region and row heights, and pages the rest
 *   behind visible Previous / Next controls ("Matches 5–8 of 8"). Every item
 *   stays reachable; a selected item's page is the one shown.
 *
 * Both measure with layout effects, so a change of composition or page size
 * happens before paint, and both re-measure when their box resizes. Without a
 * layout engine (jsdom) nothing measures: the first composition and the whole
 * list are rendered, which is what the unit tests read.
 *
 * The boxes use `overflow: clip`, not `hidden`: a clip box is not a scroll
 * container, so not even focus or `scrollIntoView` can scroll it.
 */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const overflows = (el: HTMLElement) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

/**
 * NESTED FITS. A box inside a box: the inner one clips, so the outer cannot
 * see an inner overflow by measuring itself. An inner cascade that has run
 * out of compositions (or a list that cannot hold its minimum rows) marks
 * itself `data-fit-exhausted` and asks the enclosing cascade to look again;
 * the enclosing cascade treats an exhausted descendant as its own overflow
 * and steps down. So the outermost choice (one layout or another) is made
 * with the innermost facts.
 */
const FitParent = createContext<(() => void) | null>(null);

/** Marks `el` exhausted or not; tells the enclosing cascade when that changes. */
function mark(el: HTMLElement, exhausted: boolean, parent: (() => void) | null) {
  const v = String(exhausted);
  if (el.dataset.fitExhausted === v) return;
  el.dataset.fitExhausted = v;
  parent?.();
}

const exhaustedInside = (el: HTMLElement) => el.querySelector('[data-fit-exhausted="true"]') !== null;

/** The box's size as a string, updated when it resizes (null before the first observation). */
function useBoxSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSize(`${el.clientWidth}x${el.clientHeight}`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* ── compositions ───────────────────────────────────────────────────────── */

export function FitCascade({ levels, watch, className, testId, children }: {
  /** How many compositions `children` can draw (0 = most spacious). */
  levels: number;
  /** Re-run the cascade from the top when this changes (content, not size). */
  watch?: string | number | null;
  className?: string;
  testId?: string;
  children: (level: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const parent = useContext(FitParent);
  const [level, setLevel] = useState(0);
  const [, setTick] = useState(0);
  const recheck = useCallback(() => setTick((t) => t + 1), []);
  const size = useBoxSize(ref);
  const sig = `${size}|${watch ?? ""}`;
  const seen = useRef(sig);
  // Runs after every commit: a new box or new content starts again from the
  // top; otherwise step down while the content (or a nested fit) overflows.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs after every commit by design (guarded, converges)
  useLayoutEffect(() => {
    if (seen.current !== sig) {
      seen.current = sig;
      if (level !== 0) {
        setLevel(0);
        return;
      }
    }
    const el = ref.current;
    if (!el) return;
    const over = overflows(el) || exhaustedInside(el);
    if (over && level < levels - 1) {
      setLevel(level + 1);
      return;
    }
    mark(el, over, parent);
  });
  const at = Math.min(level, levels - 1);
  return (
    <FitParent.Provider value={recheck}>
      <div ref={ref} className={cn("min-h-0 min-w-0 overflow-clip", className)} data-fit-level={at} data-fit-levels={levels} data-testid={testId}>
        {children(at)}
      </div>
    </FitParent.Provider>
  );
}

/* ── pages ──────────────────────────────────────────────────────────────── */

export interface FitPagesProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  /** "Matches", "Teams": the pager reads "Matches 1–4 of 8". */
  noun: string;
  /** The selected item: its page is the one shown. */
  focusKey?: string | null;
  /** The reader moved to another page: the items now shown. A selection that
   *  is not among them should be closed by the caller. */
  onPage?: (shown: readonly T[]) => void;
  /** Start again at the first page when this changes (a new day, a new filter). */
  resetKey?: string | number | null;
  /** The list element's classes (a grid's columns go here). */
  listClassName?: string;
  /** The region's classes. */
  className?: string;
  /** Fewer rows than this is not a useful list: the enclosing cascade is told
   *  to find a roomier composition (default 1). */
  minRows?: number;
  testId?: string;
  /** Rendered when there are no items. */
  empty?: ReactNode;
  /** A pinned page size (tests); otherwise measured. */
  pageSize?: number;
}

/** Whole rows that fit `height`, for rows of `row` px separated by `gap` px (null: not measurable). */
export function rowsThatFit(height: number, row: number, gap: number) {
  if (!(height >= 0) || !(row > 0)) return null;
  return Math.max(0, Math.floor((height + gap + 0.5) / (row + gap)));
}

export function FitPages<T>({ items, keyOf, render, noun, focusKey, onPage, resetKey, listClassName, className, testId, empty, pageSize, minRows = 1 }: FitPagesProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const parent = useContext(FitParent);
  const [measured, setMeasured] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const boxSize = useBoxSize(region);

  // A new day / filter starts on the first page.
  const lastReset = useRef(resetKey);
  if (lastReset.current !== resetKey) {
    lastReset.current = resetKey;
    if (page !== 0) setPage(0);
  }

  // How many items the region holds: rows by the tallest rendered row, times
  // the grid's columns (read from the rendered first row).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs after every commit by design (guarded, converges)
  useLayoutEffect(() => {
    const r = region.current;
    const l = list.current;
    if (!r || !l) return;
    const kids = [...l.children] as HTMLElement[];
    if (!kids.length) return;
    const rowH = Math.max(...kids.map((k) => k.offsetHeight));
    const style = window.getComputedStyle(l);
    const gap = parseFloat(style.rowGap) || 0;
    const top = kids[0].offsetTop;
    const cols = Math.max(1, kids.filter((k) => k.offsetTop === top).length);
    const rows = rowsThatFit(r.clientHeight, rowH, gap);
    const next = rows === null || (rowH === 0 && r.clientHeight === 0) ? null : Math.max(1, rows) * cols;
    if (next !== measured) {
      setMeasured(next);
      return;
    }
    // Settled: say whether this is a useful list in this box.
    const needed = Math.min(minRows, Math.ceil(items.length / cols));
    const short = rows !== null && rowH > 0 && rows < needed;
    if (root.current) mark(root.current, short || overflows(r) || overflows(root.current), parent);
  });
  void boxSize;

  const size = Math.max(1, pageSize ?? measured ?? items.length);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const focusIndex = focusKey ? items.findIndex((it) => keyOf(it) === focusKey) : -1;
  const current = Math.min(focusIndex >= 0 ? Math.floor(focusIndex / size) : page, pages - 1);
  const shown = useMemo(() => items.slice(current * size, current * size + size), [items, current, size]);

  const go = (to: number) => {
    const p = Math.max(0, Math.min(pages - 1, to));
    setPage(p);
    onPage?.(items.slice(p * size, p * size + size));
  };

  if (!items.length) return <>{empty ?? null}</>;
  const from = current * size + 1;
  const to = Math.min(items.length, from + size - 1);
  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col gap-2" data-testid={testId} data-page={current} data-pages={pages} data-page-size={size}>
      <div ref={region} className={cn("min-h-0 flex-1 overflow-clip", className)} data-fit-region>
        <ol ref={list} className={listClassName} data-fit-list>
          {shown.map((it) => (
            <li key={keyOf(it)} className="min-w-0">
              {render(it)}
            </li>
          ))}
        </ol>
      </div>
      {pages > 1 && <Pager noun={noun} from={from} to={to} total={items.length} onPrev={current > 0 ? () => go(current - 1) : undefined} onNext={current < pages - 1 ? () => go(current + 1) : undefined} />}
    </div>
  );
}

/** "Matches 5–8 of 8" between Previous and Next. */
export function Pager({ noun, from, to, total, onPrev, onNext, className }: {
  noun: string;
  from: number;
  to: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}) {
  const range = from === to ? `${from}` : `${from}–${to}`;
  return (
    <nav aria-label={`${noun} pages`} className={cn("flex h-9 shrink-0 items-center justify-end gap-1.5", className)} data-testid="pager">
      <p className="mr-auto text-[11px] font-semibold tabular-nums text-muted-foreground" aria-live="polite" data-testid="pager-range">
        {noun} {range} of {total}
      </p>
      <PagerButton dir="prev" label={`Previous ${noun.toLowerCase()}`} onClick={onPrev} />
      <PagerButton dir="next" label={`Next ${noun.toLowerCase()}`} onClick={onNext} />
    </nav>
  );
}

export function PagerButton({ dir, label, onClick, testId }: { dir: "prev" | "next"; label: string; onClick?: () => void; testId?: string }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      data-testid={testId ?? `pager-${dir}`}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-foreground/85 outline-none transition-colors hover:border-white/25 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c] disabled:opacity-30"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * A row of exclusive views ("Fixtures · Records · Format"): the explicit
 * control that divides content too large for one box. Arrow keys move along
 * it; every view is one tap away.
 */
export function ViewTabs<K extends string>({ views, value, onChange, label, testId, tabTestId = "view-tab", className }: {
  /** `name` is the tab's accessible name when its visible label is abbreviated. */
  views: readonly { key: NoInfer<K>; label: ReactNode; name?: string; count?: number }[];
  value: K;
  onChange: (key: NoInfer<K>) => void;
  label: string;
  testId?: string;
  tabTestId?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid={testId}
      className={cn("grid shrink-0 gap-1 rounded-xl border border-white/[0.07] bg-white/[0.015] p-1", className)}
      style={{ gridTemplateColumns: `repeat(${views.length}, minmax(0, 1fr))` }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = views.findIndex((v) => v.key === value);
        const next = views[(i + (e.key === "ArrowRight" ? 1 : -1) + views.length) % views.length];
        e.preventDefault();
        onChange(next.key);
        (e.currentTarget.querySelector(`[data-view="${next.key}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {views.map((v) => {
        const on = v.key === value;
        return (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-view={v.key}
            data-testid={tabTestId}
            aria-label={v.name}
            onClick={() => onChange(v.key)}
            className={cn(
              "inline-flex min-h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]",
              on ? "bg-[#c9a84c]/[0.14] text-[#f1dc9c] shadow-[inset_0_0_0_1px_hsl(42_60%_55%/0.5)]" : "text-foreground/70 hover:text-foreground",
            )}
          >
            <span className="truncate">{v.label}</span>
            {typeof v.count === "number" && <span className="tabular-nums text-muted-foreground">{v.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
