import { forwardRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

const GOLD = "#c9a84c";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60";

type Props = {
  /** Listed patches, newest first. */
  listedVersions: string[];
  /** Current baseline from the URL (may be unlisted / invalid). */
  since: string | null;
  /** Show the URL baseline as selected (false while it is an invalid name). */
  sinceSelectable: boolean;
  rangeLine: string | null;
  totals: string | null;
  fromMemory: boolean;
  onChange: (version: string) => void;
  onForget: () => void;
  selectRef: RefObject<HTMLSelectElement>;
  /** Extra text linked to the select (e.g. an invalid-baseline message). */
  problem?: ReactNode;
};

/**
 * Catch Up header: h2, the native "I last knew patch" select, the range line
 * ("26.14 itself is not included."), totals and the remembered-baseline hint.
 * Options are every listed patch except the newest (picking the newest could
 * only say "no later patches"), newest first, like the Patch Report chips.
 */
export const PatchCatchUpControls = forwardRef<HTMLHeadingElement, Props>(function PatchCatchUpControls(
  { listedVersions, since, sinceSelectable, rangeLine, totals, fromMemory, onChange, onForget, selectRef, problem },
  headingRef,
) {
  const options = listedVersions.slice(1);
  const extra = since && sinceSelectable && !options.includes(since) ? since : null;
  const value = since && sinceSelectable ? since : "";
  return (
    <div className="mb-5 border-l-2 pl-3" style={{ borderColor: GOLD }} data-testid="catchup-controls">
      <h2 ref={headingRef} tabIndex={-1} id="patch-catchup-heading" className={cn("text-xl font-semibold", FOCUS)}>
        Catch Up
      </h2>
      <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
        <label htmlFor="patch-catchup-baseline" className="text-sm font-medium">
          I last knew patch
        </label>
        <select
          id="patch-catchup-baseline"
          ref={selectRef}
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-describedby="patch-catchup-range"
          className={cn(
            "min-h-11 w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm sm:min-h-0 sm:w-auto",
            "focus:border-[#c9a84c]",
            FOCUS,
          )}
        >
          <option value="" disabled>
            Choose a patch…
          </option>
          {options.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          {extra && <option value={extra}>{extra}</option>}
        </select>
      </div>
      <div id="patch-catchup-range" className="mt-1.5 text-sm text-muted-foreground">
        {since && sinceSelectable ? (
          <p>
            {rangeLine && <span>{rangeLine} · </span>}
            <span>{since} itself is not included.</span>
          </p>
        ) : (
          <p>Pick the last patch you know. Mogzy will show every change after it, grouped by champion, item and mode.</p>
        )}
        {problem}
      </div>
      {totals && <p className="mt-1 text-sm text-muted-foreground" data-testid="catchup-totals">{totals}</p>}
      {fromMemory && since && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="catchup-remembered">
          Remembered from your last catch-up ·{" "}
          <button type="button" onClick={onForget} className={cn("rounded underline hover:text-[#c9a84c]", FOCUS)}>
            Forget
          </button>
        </p>
      )}
    </div>
  );
});
