// ---------------------------------------------------------------------------
// The Pro Play stats filter combobox — one control, two suppliers.
//
// WHY THIS EXISTS. The League filter was a native <select>. A native select
// renders its own menu at whatever height the option list wants, and the
// corpus is 323 leagues, so opening it covered most of the viewport with no
// way to search. Player and Team were bare <Input>s: they LOOKED like search
// boxes and produced no suggestions at all, so a reader had to already know
// the exact canonical spelling ("Doran (Choi Hyeon-joon)") to filter by it.
//
// NOT A NEW DROPDOWN. This composes the Popover and Command (cmdk) primitives
// the design system already ships; neither had a consumer in this app yet.
// Bounded height, internal scroll and type-to-filter all come from those.
//
// TWO SUPPLIERS, ONE SHELL — because the three filters differ in where their
// options come from, not in how they behave:
//
//   League   a static list already returned by /stats/filters. Filtered
//            locally, ranked prefix-first.
//   Player   a remote lookup against the PUBLIC canonical entity search.
//   Team     the same.
//
// THE VALUE IS ALWAYS THE CANONICAL KEY, NEVER THE LABEL. `player_lp_page`
// and `team_key` are what the stats API filters on and what the profile
// routes take, and a display name is not unique: the corpus holds TWO
// players whose handle is "Doran". Selecting a suggestion stores the key and
// shows the label; the URL contract is unchanged.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** One selectable row. `value` is the canonical key; `label` is for reading. */
export type ComboOption = {
  value: string;
  label: string;
  /** Secondary line — role, team, game count. Never used for matching. */
  hint?: string;
};

/**
 * Rank a static list against a query.
 *
 * PREFIX BEATS SUBSTRING, which is the whole point of the owner's example:
 * "wo" must surface "World Championship" rather than burying it under every
 * league with "wo" somewhere inside it ("Ligue Wolf", "Arabian Worlds
 * Qualifier"...). Within each tier the corpus order is preserved — the
 * filters endpoint already returns leagues most-played first, and that is a
 * better default than alphabetical.
 */
export function rankOptions(options: ComboOption[], query: string): ComboOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const prefix: ComboOption[] = [];
  const contains: ComboOption[] = [];
  for (const option of options) {
    const label = option.label.toLowerCase();
    if (label.startsWith(q)) prefix.push(option);
    else if (label.includes(q)) contains.push(option);
    // A word-start match reads as a prefix to a human ("champ" -> "World
    // Championship"), so it is promoted above a mid-word substring.
    else if (label.split(/[\s.\-/]+/).some((w) => w.startsWith(q))) prefix.push(option);
  }
  return [...prefix, ...contains];
}

/** Nominal panel width; matches the `w-[min(20rem,...)]` class below. */
const PANEL_WIDTH = 320;
const EDGE_GAP = 8;

/**
 * Which end of the trigger the panel hangs from.
 *
 * `align="start"` puts the panel's LEFT edge on the trigger's, which overflows
 * when the trigger sits within a panel-width of the right edge — the Team
 * filter at 375px. `align="end"` hangs it from the right edge instead, so it
 * extends leftward. Choosing between them from the trigger's measured
 * position is the whole horizontal fix.
 */
export function alignFor(trigger: HTMLElement | null): "start" | "end" {
  if (!trigger || typeof window === "undefined") return "start";
  const rect = trigger.getBoundingClientRect();
  const overflowsRight = rect.left + PANEL_WIDTH > window.innerWidth - EDGE_GAP;
  // Only worth flipping if the other end actually has room.
  return overflowsRight && rect.right >= PANEL_WIDTH + EDGE_GAP ? "end" : "start";
}

/**
 * The popover panel.
 *
 * DOWNWARD ONLY — `avoidCollisions={false}` is deliberate and is the ONLY way
 * Radix guarantees it. With collisions on, `side="bottom"` is a preference:
 * floating-ui flips the panel above the trigger as soon as the space below is
 * short, which is exactly what the owner asked never to happen.
 *
 * THE COST OF THAT FLAG IS THAT IT GOVERNS BOTH AXES, and an earlier pass hit
 * it: with collisions off, the 375px Team menu ran to x=512. So horizontal
 * containment is handled here instead of by floating-ui — `alignFor` picks the
 * end of the trigger to hang from — and the vertical case is handled by
 * SHRINKING rather than flipping: `--stats-combo-max` below is the real space
 * beneath the trigger, so a cramped viewport gets a shorter, still-scrollable
 * menu.
 */
function Panel({
  children,
  align,
  maxListPx,
}: {
  children: React.ReactNode;
  align: "start" | "end";
  maxListPx: number;
}) {
  return (
    <PopoverContent
      align={align}
      side="bottom"
      avoidCollisions={false}
      // Published so the guarantee is observable. jsdom has no layout, so a
      // test cannot catch a flip by measuring one; it can catch the prop that
      // forbids flipping going missing.
      data-downward-only="true"
      sideOffset={4}
      style={{ ["--stats-combo-max" as string]: `${maxListPx}px` }}
      className="w-[min(20rem,calc(100vw-2rem))] border-[#c9a84c]/30 bg-[#0b1622] p-0"
    >
      {children}
    </PopoverContent>
  );
}

/**
 * Space actually available beneath the trigger, clamped.
 *
 * This is what replaces the flip. Radix will not shrink the panel for us once
 * `avoidCollisions` is off, so the height is computed from the trigger's own
 * rect: never more than 20rem (the cap that fixed the original "covers the
 * viewport" complaint), never less than 8rem (below which a menu is not worth
 * opening and the page can scroll to it).
 */
export function availableBelow(trigger: HTMLElement | null): number {
  if (!trigger || typeof window === "undefined") return 320;
  const rect = trigger.getBoundingClientRect();
  // 56px covers the search input and the panel's own border/padding.
  const room = window.innerHeight - rect.bottom - EDGE_GAP - 56;
  return Math.max(128, Math.min(320, Math.round(room)));
}

/**
 * Bounds the LIST, not the popover, so the search field stays pinned and only
 * the options scroll.
 *
 * `--radix-popover-content-available-height` is the space Radix measured
 * between the trigger and the viewport edge, so the menu shrinks to fit a
 * short window instead of being clipped by it. The 20rem cap keeps it inside
 * the 300-400px the owner asked for on a tall desktop, where the available
 * height would otherwise be most of the screen — the original complaint.
 */
const LIST_MAX = "max-h-[var(--stats-combo-max,20rem)] overflow-y-auto";

function TriggerButton({
  field,
  label,
  selected,
  onClear,
  open,
  anchorRef,
}: {
  /** The trigger's own node, measured to place the panel. */
  anchorRef?: React.RefObject<HTMLSpanElement>;
  /** The FIELD name ("League"), which is what names the control. */
  field: string;
  /** The current VALUE, which is what the control reads out. */
  label: string;
  selected: boolean;
  onClear?: () => void;
  open: boolean;
}) {
  return (
    <span className="relative flex" ref={anchorRef}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          // The field label is a sibling <span>, so without this the control
          // has no accessible name at all -- a screen reader would announce
          // "All, combobox" with no clue which filter it belongs to.
          aria-label={field}
          aria-expanded={open}
          className={cn(
            "h-9 w-full justify-between border-input bg-background px-2 text-sm font-normal",
            !selected && "text-muted-foreground",
            selected && "pr-8",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      {selected && onClear ? (
        // Clearing must not require opening the menu and hunting for "All".
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${field}`}
          className="absolute right-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Placement measured at open time.
 *
 * Both comboboxes need the same two numbers, and both need them recomputed on
 * every open rather than once: the filter bar moves as the page scrolls, so a
 * value captured at mount would place the menu against a stale rect.
 */
function usePlacement(open: boolean) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [placement, setPlacement] = useState<{
    align: "start" | "end";
    maxListPx: number;
  }>({ align: "start", maxListPx: 320 });

  useEffect(() => {
    if (!open) return;
    const node = anchorRef.current;
    setPlacement({ align: alignFor(node), maxListPx: availableBelow(node) });
  }, [open]);

  return { anchorRef, ...placement };
}

// ---------------------------------------------------------------------------
// Static list — League
// ---------------------------------------------------------------------------

export function FilterCombobox({
  label,
  value,
  onChange,
  options,
  anyLabel = "All",
  loading = false,
  searchPlaceholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  anyLabel?: string;
  /** The option list is still on its way. Said out loud, not left blank. */
  loading?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { anchorRef, align, maxListPx } = usePlacement(open);

  // The query is per-opening. Reopening the menu with the last search still
  // applied hides most of the corpus for no reason the reader can see.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const ranked = useMemo(() => rankOptions(options, query), [options, query]);
  const selected = options.find((o) => o.value === value);

  return (
    <FieldShell label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <TriggerButton
          anchorRef={anchorRef}
          field={label}
          open={open}
          label={selected?.label ?? (value || anyLabel)}
          selected={Boolean(value)}
          onClear={() => onChange("")}
        />
        <Panel align={align} maxListPx={maxListPx}>
          {/* cmdk's own filter is off: `rankOptions` decides order AND
              membership, so two filters would fight and the prefix ranking
              would be discarded. */}
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
            />
            <CommandList className={LIST_MAX}>
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Loading {label.toLowerCase()}…
                </div>
              ) : (
                <>
                  <CommandEmpty className="px-3 py-4 text-xs text-muted-foreground">
                    No {label.toLowerCase()} match “{query}”.
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__any__"
                      onSelect={() => {
                        onChange("");
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("mr-2 h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")}
                        aria-hidden
                      />
                      {anyLabel}
                    </CommandItem>
                    {ranked.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3.5 w-3.5 shrink-0",
                            value === option.value ? "opacity-100" : "opacity-0",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </Panel>
      </Popover>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------
// Remote entity lookup — Player and Team
// ---------------------------------------------------------------------------

export type EntitySearcher = (
  query: string,
  signal: AbortSignal,
) => Promise<ComboOption[]>;

export function EntityFilterCombobox({
  label,
  value,
  displayLabel,
  onChange,
  search,
  minChars,
  anyLabel = "Any",
  debounceMs = 200,
  plural,
}: {
  label: string;
  /** The canonical key currently filtering the table. */
  value: string;
  /** What to show for that key. Falls back to the key itself on a cold URL. */
  displayLabel?: string;
  onChange: (value: string, label?: string) => void;
  search: EntitySearcher;
  /** The backend's own floor. Below it a query is not asked, and the menu
   *  says so rather than claiming there are no matches. */
  minChars: number;
  anyLabel?: string;
  debounceMs?: number;
  /** Plural noun for the empty state. "No players found", not "No player". */
  plural?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { anchorRef, align, maxListPx } = usePlacement(open);
  const [results, setResults] = useState<ComboOption[]>([]);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  // Monotonic request id. A slow early keystroke must never overwrite the
  // results of a later one -- the classic autocomplete race, and the reason
  // aborting alone is not enough (an abort can land after the newer resolve).
  const seq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setFailed(false);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minChars) {
      setResults([]);
      setPending(false);
      setFailed(false);
      return;
    }
    const mine = ++seq.current;
    const controller = new AbortController();
    setPending(true);
    setFailed(false);
    const timer = setTimeout(() => {
      search(trimmed, controller.signal)
        .then((found) => {
          if (mine !== seq.current) return; // a newer keystroke already won
          setResults(found);
          setPending(false);
        })
        .catch((err) => {
          if ((err as Error)?.name === "AbortError" || mine !== seq.current) return;
          setResults([]);
          setFailed(true);
          setPending(false);
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minChars, search, debounceMs]);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < minChars;

  return (
    <FieldShell label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <TriggerButton
          anchorRef={anchorRef}
          field={label}
          open={open}
          label={value ? displayLabel || value : anyLabel}
          selected={Boolean(value)}
          onClear={() => onChange("")}
        />
        <Panel align={align} maxListPx={maxListPx}>
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label}`}
            />
            <CommandList className={LIST_MAX}>
              {trimmed.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  Type to search {plural ?? `${label.toLowerCase()}s`}.
                </p>
              ) : tooShort ? (
                // NOT "no results". The corpus holds 12,000 players; a
                // one-character query is refused by the search contract, not
                // answered with an empty set, and saying "none found" would
                // be a false statement about the data.
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  Keep typing — {minChars} characters minimum.
                </p>
              ) : pending ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  Searching…
                </div>
              ) : failed ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  Search is unavailable right now.
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground">
                  No {plural ?? `${label.toLowerCase()}s`} found.
                </p>
              ) : (
                <CommandGroup>
                  {results.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        onChange(option.value, option.label);
                        setOpen(false);
                      }}
                      className="flex items-start gap-2"
                    >
                      <Check
                        className={cn(
                          "mt-0.5 h-3.5 w-3.5 shrink-0",
                          value === option.value ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate">{option.label}</span>
                        {option.hint ? (
                          // The disambiguator. Two players share the handle
                          // "Doran"; the hint is how a reader tells them
                          // apart before committing to a canonical key.
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {option.hint}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </Panel>
      </Popover>
    </FieldShell>
  );
}
