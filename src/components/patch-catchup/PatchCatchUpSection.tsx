import type { ReactNode, SyntheticEvent } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PatchCatchUpEntry } from "./PatchCatchUpEntry";
import type { CatchUpSectionModel } from "./presentation";

const GOLD = "#c9a84c";
const WRAP = "[overflow-wrap:anywhere]";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60";

const patchSpan = (patches: string[]) =>
  patches.length === 0 ? "" : patches.length === 1 ? patches[0] : `${patches[0]}–${patches[patches.length - 1]}`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Props = {
  section: CatchUpSectionModel;
  /** Entries to show (search-narrowed); the counts in the heading stay the section's own. */
  entries: CatchUpSectionModel["entries"];
  /** Collapsible sections only: current disclosure state. */
  open: boolean;
  /** Collapsible sections only: body has been opened at least once (keep it mounted). */
  rendered: boolean;
  onToggle: (key: string, open: boolean) => void;
  /** Rendered under the heading (the Champions cross-reference). */
  aside?: ReactNode;
};

/**
 * One official Riot section across the range (h3), its entries alphabetically.
 * A non-chainable section with more than 40 lines is a native disclosure that
 * starts collapsed (owner decision 3): the heading keeps Riot's name and the
 * change count, and the summary says "Show" — it is one tap away, never
 * labelled as unimportant. Search force-opens it (the parent passes `open`).
 */
export const PatchCatchUpSection = ({ section, entries, open, rendered, onToggle, aside }: Props) => {
  const counts = `${plural(section.lineCount, "change", "changes")} in ${plural(section.entryCount, "entry", "entries")}`;
  const heading = (
    <h3
      id={`${section.id}-heading`}
      className={cn("min-w-0 text-xl font-bold", WRAP)}
    >
      {section.title}
      <span className="ml-2 text-sm font-normal text-muted-foreground">
        <span aria-hidden>· </span>
        {counts}
        {section.patches.length > 0 && <span className="whitespace-nowrap"> · {patchSpan(section.patches)}</span>}
      </span>
    </h3>
  );

  const body = (
    <div className="mt-3 space-y-4">
      {aside}
      {section.intros.length > 0 && (
        <details className="group text-sm text-muted-foreground" data-testid="catchup-section-intro">
          <summary
            className={cn(
              "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1 hover:text-foreground",
              FOCUS,
              "[&::-webkit-details-marker]:hidden",
            )}
          >
            <ChevronRight
              aria-hidden
              className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
            />
            Riot&apos;s section notes
          </summary>
          <ul className="ml-4 space-y-2 border-l border-border pl-3">
            {section.intros.map((intro) => (
              <li key={intro.patch} className={cn("leading-relaxed text-foreground/85", WRAP)}>
                <span className="mr-1 font-mono text-xs text-[#d8bd70]">Riot · {intro.patch}:</span>
                {intro.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      {entries.map((entry) => (
        <PatchCatchUpEntry key={entry.key} entry={entry} />
      ))}
    </div>
  );

  if (!section.defaultCollapsed) {
    return (
      <section
        id={section.id}
        aria-labelledby={`${section.id}-heading`}
        data-testid="catchup-section"
        data-section-key={section.key}
        data-collapsible="false"
        className="mb-10 scroll-mt-24"
      >
        <div className="border-b pb-2" style={{ borderColor: `${GOLD}40` }}>
          {heading}
        </div>
        {body}
      </section>
    );
  }

  const handleToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    if (next !== open) onToggle(section.key, next);
  };

  return (
    <section
      id={section.id}
      aria-labelledby={`${section.id}-heading`}
      data-testid="catchup-section"
      data-section-key={section.key}
      data-collapsible="true"
      className="mb-6 scroll-mt-24"
    >
      <details open={open} onToggle={handleToggle} data-testid="catchup-section-disclosure">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-3 py-2",
            "hover:border-[#c9a84c]/60",
            FOCUS,
            "[&::-webkit-details-marker]:hidden",
          )}
          style={{ borderColor: `${GOLD}40` }}
        >
          {heading}
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#d8bd70]">
            {open ? "Hide" : "Show"}
            <span className="sr-only">
              {" "}
              {section.title}, {plural(section.lineCount, "change", "changes")}
            </span>
            <ChevronRight
              aria-hidden
              className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", open && "rotate-90")}
            />
          </span>
        </summary>
        {(open || rendered) && body}
      </details>
    </section>
  );
};
