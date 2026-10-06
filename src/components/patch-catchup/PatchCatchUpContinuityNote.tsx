import { ChevronRight } from "lucide-react";
import type { CatchUpParameterChain } from "@/lib/patch-catchup";
import { cn } from "@/lib/utils";
import { continuityWording } from "./presentation";

const WRAP = "[overflow-wrap:anywhere]";

type WordingContext = { sincePatch: string; clampedToCoverageFloor: boolean };

/**
 * The one-line Mogzy note under the FINAL Riot line of a proven PH3-B chain.
 * Quiet by design: a value fact, never intent ("reverted", "undone") and never
 * buff/nerf. Exact vs approved-alias provenance lives only in "How?".
 */
export const PatchCatchUpContinuityNote = ({
  id,
  chain,
  context,
}: {
  id: string;
  chain: CatchUpParameterChain;
  context: WordingContext;
}) => {
  const wording = continuityWording(chain, context);
  return (
    <div
      id={id}
      data-testid="catchup-continuity-note"
      data-chain-id={chain.id}
      className="mt-1.5 scroll-mt-24 border-l-2 border-dotted border-[#c9a84c]/60 pl-3 text-sm"
    >
      <p className={cn("text-[#d8bd70]", WRAP)}>
        <span className="sr-only">Mogzy note: </span>
        <span aria-hidden className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">
          Mogzy
        </span>
        {wording.note}
      </p>
      <details className="group mt-0.5 text-xs text-muted-foreground" data-testid="catchup-continuity-how">
        <summary
          className={cn(
            "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
            "[&::-webkit-details-marker]:hidden",
          )}
        >
          <ChevronRight
            aria-hidden
            className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
          />
          How?
          <span className="sr-only"> (how Mogzy knows this)</span>
        </summary>
        <div className={cn("mb-1 ml-4 space-y-1 border-l border-border pl-3", WRAP)}>
          <p>{wording.identity}</p>
          <ul className="space-y-0.5 font-mono">
            {wording.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          {wording.mechanical && <p>{wording.mechanical}</p>}
        </div>
      </details>
    </div>
  );
};

/** Entry-header chip that jumps to the note. */
export const PatchCatchUpContinuityChip = ({
  chains,
  noteIdOf,
  context,
}: {
  chains: CatchUpParameterChain[];
  noteIdOf: (chain: CatchUpParameterChain) => string | null;
  context: WordingContext;
}) => {
  if (chains.length === 0) return null;
  const first = chains[0];
  const target = noteIdOf(first);
  const text = chains.length === 1 ? continuityWording(first, context).chip : `${chains.length} Mogzy notes`;
  return (
    <a
      href={target ? `#${target}` : undefined}
      data-testid="catchup-continuity-chip"
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10 px-2 py-0.5 text-xs text-[#d8bd70]",
        "hover:border-[#c9a84c]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60",
        WRAP,
      )}
    >
      <span aria-hidden>◆</span>
      <span>
        <span className="font-semibold">Mogzy:</span> {text}
      </span>
    </a>
  );
};
