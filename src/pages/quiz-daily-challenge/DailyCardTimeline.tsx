/**
 * The run's progress strip (DC1 Phase 5).
 *
 * Ranked's `RoundTimeline` describes an open-ended duel that ends when somebody
 * reaches zero HP, and its nodes carry per-round damage for two players. A
 * Daily is FINITE and solo, so the strip is a different object: one node per
 * card of a plan that is 11 to 15 long, with no total to invent and no second
 * column to mirror.
 *
 * NOTHING HERE IS HARDCODED. The length is the run's own `card_count` and the
 * kinds come from the server's plan; a day with 11 cards draws 11 nodes and a
 * day with 15 draws 15. A future node shows its POSITION and, at most, whether
 * it is part of the Meta Reflex block — never a prompt, a category, or a
 * difficulty. The run projection does not ship unreached cards at all, and this
 * strip must not become the place they leak.
 *
 * FOUR OUTCOMES, NOT TWO. Under retry-until-correct every card ends solved, so
 * "done" would say nothing. First-try, learned and timed-out are drawn
 * differently because they are what the day was actually made of.
 */

import type { DcNodeState, DcTimelineNode } from "./dailyChallengeViews";

const STATE_CLASS: Record<DcNodeState, string> = {
  correct: "bg-emerald-500/80 ring-emerald-300/50",
  learned: "bg-sky-500/60 ring-sky-300/40",
  timeout: "bg-amber-500/60 ring-amber-300/40",
  active: "bg-amber-200 ring-amber-100 shadow-[0_0_10px_rgba(251,191,36,0.55)]",
  future: "bg-white/10 ring-white/15",
};

const STATE_LABEL: Record<DcNodeState, string> = {
  correct: "solved first try",
  learned: "solved after the scored attempt",
  timeout: "window closed, then solved",
  active: "current card",
  future: "not reached",
};

export function DailyCardTimeline({ nodes }: { nodes: DcTimelineNode[] }) {
  return (
    <nav
      aria-label="Run progress"
      data-testid="dc-timeline"
      data-node-count={nodes.length}
      className="ranked-panel px-3 py-2.5"
    >
      <ol className="flex items-end justify-center gap-1 sm:gap-1.5">
        {nodes.map((node) => (
          <li
            key={node.sequence}
            data-testid={`dc-timeline-node-${node.sequence}`}
            data-state={node.state}
            data-kind={node.kind ?? "unknown"}
            data-block-start={node.blockStart ? "true" : undefined}
            data-block-end={node.blockEnd ? "true" : undefined}
            className={`flex flex-col items-center gap-1 ${
              // The bracket: a contiguous Meta Reflex run reads as ONE object
              // rather than five adjacent nodes that share a colour.
              node.kind === "meta_reflex"
                ? `border-y border-amber-400/30 py-0.5 ${
                  node.blockStart ? "rounded-l-sm border-l pl-1" : ""} ${
                  node.blockEnd ? "rounded-r-sm border-r pr-1" : ""}`
                : ""}`}
          >
            <span
              aria-hidden="true"
              className={`block rounded-sm ring-1 transition-colors duration-300
                          motion-reduce:transition-none ${STATE_CLASS[node.state]} ${
                node.state === "active" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`}
            />
            <span className="sr-only">
              {`Card ${node.sequence}${
                node.kind === "meta_reflex" ? ", Meta Reflex" : ""}: ${
                STATE_LABEL[node.state]}`}
            </span>
          </li>
        ))}
      </ol>
      {nodes.some((n) => n.kind === "meta_reflex") && (
        <p className="mt-1.5 text-center text-[10px] uppercase tracking-[0.16em] text-amber-300/60">
          Meta Reflex block
        </p>
      )}
    </nav>
  );
}
