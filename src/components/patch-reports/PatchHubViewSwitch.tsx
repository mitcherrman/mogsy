import { Link, type To } from "react-router-dom";
import type { MouseEvent } from "react";
import { cn } from "@/lib/utils";

export type PatchHubView = "report" | "catchup";

type Props = {
  current: PatchHubView;
  reportTo: To;
  catchUpTo: To;
  /** Router state carried by each link (e.g. the patch to return to). */
  reportState?: unknown;
  catchUpState?: unknown;
  /** Called on a plain click that switches views (focus management). */
  onSwitch?: (view: PatchHubView) => void;
};

const ITEM =
  "inline-flex min-h-11 items-center sm:min-h-9 justify-center px-3 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]/70";

/**
 * Patch Hub views: "Patch Report | Catch Up" (owner decision 4). Two real
 * links, not tabs: each changes the URL and creates a history entry, so Back
 * returns to the previous view. The active one carries aria-current="page".
 */
export const PatchHubViewSwitch = ({ current, reportTo, catchUpTo, reportState, catchUpState, onSwitch }: Props) => {
  const item = (view: PatchHubView, label: string, to: To, state: unknown) => {
    const active = current === view;
    const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (active) {
        // Already here: no duplicate history entry.
        e.preventDefault();
        return;
      }
      if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) onSwitch?.(view);
    };
    return (
      <Link
        to={to}
        state={state}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        data-testid={`patch-hub-view-${view}`}
        className={cn(
          ITEM,
          active
            ? "bg-[#c9a84c]/15 text-[#c9a84c]"
            : "text-muted-foreground hover:bg-[#c9a84c]/5 hover:text-foreground",
        )}
      >
        {label}
      </Link>
    );
  };
  return (
    <nav aria-label="Patch Hub views" data-testid="patch-hub-view-switch" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <div className="inline-flex overflow-hidden rounded-full border border-[#c9a84c]/50">
        {item("report", "Patch Report", reportTo, reportState)}
        <span aria-hidden className="w-px self-stretch bg-[#c9a84c]/40" />
        {item("catchup", "Catch Up", catchUpTo, catchUpState)}
      </div>
      {current === "report" && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Missed a few patches? Pick the last one you know.
        </span>
      )}
    </nav>
  );
};
