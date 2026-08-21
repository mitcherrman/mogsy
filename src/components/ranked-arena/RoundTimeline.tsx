/**
 * THE ROUND TIMELINE — the bottom region of the Ranked arena.
 *
 * The arena reads top-to-bottom as: match state · the question · the duelists
 * · PROGRESSION. This is the last of those, and it is progression ONLY. It is
 * not a result surface, and the bottom of the arena is not allowed to become
 * one again (see `QuizRankedMatch.bottomInvariant.test.tsx`): damage lives in
 * the top result beat and in each duelist's recent-round ledger, and a block's
 * 5-card scoreline lives in the top beat's transcript. Nothing here repeats
 * any of it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE IDEA: A STATIONARY MARKER OVER A MOVING TRACK
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A Ranked match ends on HP, not on a round count, so the strip is a moving
 * viewport over an indefinite sequence (see `roundTimeline.ts`). Expressing
 * that visually means the CURRENT POSITION must hold still while the ROUNDS
 * travel — so the two are separate objects here:
 *
 *   * the RAIL is fixed. It is the ground the rounds move over, and it never
 *     moves, which is what makes their movement perceptible at all.
 *   * the TRACK is a clipped strip of absolutely-placed nodes, each parked at
 *     `translateX(index * 100%)` of its own slot width. When the window
 *     advances, every index drops by one, so every node travels exactly one
 *     slot, together, in one transition. A node leaving on the left and one
 *     arriving on the right are already mounted in the off-edge buffer, so
 *     they slide rather than pop.
 *   * the MARKER is a separate layer at the anchor slot. It is a SIBLING of
 *     the clip, not a child, so its ring and glow paint outside the clipping
 *     box and cannot be shaved by it. After the opening rounds it never moves
 *     again; during them it walks out to the anchor, which is itself a true
 *     statement about how far into the match the player is.
 *
 * Every node is mounted at a fixed height in a fixed-width slot at all times,
 * so advancing a round changes transforms and data attributes and NOTHING
 * that lays out. The strip's height is identical in every state.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A NODE IS ALLOWED TO SAY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Past nodes say the round resolved and — where the bounded ledger still holds
 * it — what the viewer scored. The current node is the strongest thing on the
 * strip. Future nodes say only that a round exists: they are NEUTRAL, because
 * no public field describes an ungenerated question, and a strip that guessed
 * would be inventing the one thing the player cannot check.
 *
 * There are exactly three node glyphs, and two of them require the server to
 * have said so: the Meta Reflex mark, the ordinary-round mark, and a neutral
 * token for every round this client has not been told about.
 */
import type {
  RoundTimelineView, TimelineNode, TimelineSegmentKind,
} from "@/pages/quiz-ranked/roundTimeline";
import type { ResultKind } from "./RoundResultBeat";

/**
 * Per-identity presentation. Literal hex, like the rest of the Ranked skin, so
 * the strip renders identically on the themed /quiz route and in the dev arena
 * inspector (which carries no theme).
 *
 * `null` is not a fallback for "ordinary" — it is its own state, "this client
 * was never told", and it gets the neutral token. Reading it as ordinary would
 * turn silence into a claim.
 */
const IDENTITY: Record<"meta-reflex" | "standard" | "unknown", {
  ink: string; label: string | null;
}> = {
  "meta-reflex": { ink: "#7fd6ef", label: "Meta Reflex" },
  standard: { ink: "#c6b48f", label: null },
  unknown: { ink: "#8f9bab", label: null },
};

const identityOf = (kind: TimelineSegmentKind | null) => kind ?? "unknown";

/** The settled-outcome vocabulary, in the arena's existing four tones. */
const OUTCOME: Record<ResultKind, { ink: string; label: string }> = {
  correct: { ink: "#6ee7b7", label: "you answered correctly" },
  "both-correct": { ink: "#e8c97a", label: "both correct" },
  incorrect: { ink: "#e2757b", label: "you answered incorrectly" },
  "timed-out": { ink: "#a9b3c1", label: "you ran out of time" },
};

const STATE_LABEL: Record<TimelineNode["state"], string> = {
  resolved: "resolved",
  current: "current round",
  upcoming: "upcoming",
};

/**
 * The whole node in one sentence.
 *
 * It names only what the node knows. A round whose segment this client was
 * never told about says nothing about its kind, rather than describing it as
 * ordinary — and a future round says nothing beyond existing.
 */
export function nodeLabel(node: TimelineNode): string {
  const identity = IDENTITY[identityOf(node.segmentKind)].label;
  const kind = identity ? `, ${identity}` : "";
  const outcome = node.outcome ? `, ${OUTCOME[node.outcome].label}` : "";
  const tag = node.tag ? `, ${node.tag.role} question` : "";
  return `Round ${node.roundNumber}, ${STATE_LABEL[node.state]}${kind}${outcome}${tag}`;
}

/** The Meta Reflex mark — the SAME four-point star the block's sting uses. */
function MetaReflexGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
      <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
    </svg>
  );
}

/** An ordinary round the server has named: a solid engraved diamond. */
function StandardGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
      <path d="M12 3l6 9-6 9-6-9z" fill="currentColor" />
    </svg>
  );
}

/**
 * A round this client has not been told about — a future round, or one played
 * before it connected. Hollow on purpose: an outline reads as a placeholder,
 * and a placeholder is exactly what it is.
 */
function UnknownGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden>
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

/**
 * The settled verdict, as a SHAPE as well as a colour: filled dot, ringed dot,
 * cross, hollow ring. Absolutely placed against the node's plate wrapper so it
 * costs no height and its arrival moves nothing.
 */
function OutcomeMark({ outcome }: { outcome: ResultKind }) {
  const { ink } = OUTCOME[outcome];
  return (
    <svg viewBox="0 0 12 12" className="absolute -bottom-1 -right-1 h-[9px] w-[9px]"
      style={{ color: ink }} aria-hidden>
      {outcome === "correct" && <circle cx="6" cy="6" r="3.4" fill="currentColor" />}
      {outcome === "both-correct" && (
        <>
          <circle cx="6" cy="6" r="2.1" fill="currentColor" />
          <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </>
      )}
      {outcome === "incorrect" && (
        <path d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" />
      )}
      {outcome === "timed-out" && (
        <circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      )}
    </svg>
  );
}

function TimelineNodeMark({ node, slotWidth }: { node: TimelineNode; slotWidth: string }) {
  const identity = IDENTITY[identityOf(node.segmentKind)];
  return (
    <li
      data-testid={`timeline-node-${node.roundNumber}`}
      data-round={String(node.roundNumber)}
      data-index={String(node.index)}
      data-state={node.state}
      data-segment={node.segmentKind ?? ""}
      data-outcome={node.outcome ?? ""}
      data-visible={node.visible ? "true" : "false"}
      // `aria-current="step"` rides the ROUND, not the marker: the marker is
      // decoration that happens to sit still, and the round is the step.
      aria-current={node.state === "current" ? "step" : undefined}
      // ONE transform per node, parking it at its slot. Advancing the window
      // drops every index by one, so every node travels together — that single
      // shared movement IS "the track slides".
      style={{ width: slotWidth, transform: `translateX(${node.index * 100}%)` }}
      className="ranked-timeline-node absolute inset-y-0 left-0 flex flex-col
        items-center justify-end gap-[3px]"
    >
      <span className="sr-only">{nodeLabel(node)}</span>
      {/* The plate and its verdict mark are SIBLINGS inside this wrapper, not
          parent and child. A past node's plate recedes with `opacity`, and
          opacity composites the whole subtree — nested, the verdict would fade
          with the plate, and the verdict is the one thing on a settled node
          worth reading at a glance. */}
      <span aria-hidden className="relative block h-8 w-full max-w-[2.25rem]">
        <span
          style={{ color: identity.ink }}
          className="ranked-timeline-plate flex h-8 w-full items-center justify-center
            rounded-[0.3rem] border"
        >
          {node.segmentKind === "meta-reflex" ? <MetaReflexGlyph />
            : node.segmentKind === "standard" ? <StandardGlyph />
              : <UnknownGlyph />}
        </span>
        {node.outcome && <OutcomeMark outcome={node.outcome} />}
      </span>
      <span aria-hidden
        className="ranked-timeline-ordinal block text-[9px] font-semibold leading-none tabular-nums">
        {node.roundNumber}
      </span>
    </li>
  );
}

/**
 * THE STRIP.
 *
 * Narrow by design: it takes a projected view and nothing else. It reads no
 * match state, holds no state of its own, starts no timer, and cannot decide
 * anything — every judgement it renders was made in `projectRoundTimeline`.
 */
export function RoundTimeline({
  timeline, className = "",
}: {
  timeline: RoundTimelineView;
  className?: string;
}) {
  // Slots divide the strip exactly, with no CSS gap: a gap would break the
  // arithmetic that keeps the marker and the node it rings in the same place.
  // The gutter comes from each plate's own `max-w` inside its slot instead.
  const slotWidth = `${100 / timeline.visibleNodes}%`;
  const markerIndex = timeline.currentIndex;
  return (
    <section
      data-testid="ranked-round-timeline"
      data-window-start={String(timeline.windowStart)}
      data-current-round={timeline.currentRoundNumber === null
        ? "" : String(timeline.currentRoundNumber)}
      data-current-index={markerIndex === null ? "" : String(markerIndex)}
      data-anchor-index={String(timeline.anchorIndex)}
      data-visible-nodes={String(timeline.visibleNodes)}
      data-anchored={timeline.anchored ? "true" : "false"}
      aria-label="Round timeline"
      className={`ranked-timeline px-1 ${className}`}
    >
      {/* The viewport. `relative` and a FIXED height: the track inside is
          absolutely placed, so this box is what gives the strip its constant
          size, in every state and at every width. */}
      <div className="ranked-timeline-viewport relative h-[3.4rem] w-full">
        {/* The fixed rail. It does not move — that is its whole job. Without a
            stationary reference the nodes' travel is invisible. */}
        <span aria-hidden className="ranked-timeline-rail" />
        {/* The clip. Only the track is inside it, so the two buffer nodes are
            hidden at the edges. The MARKER is deliberately outside (below), so
            nothing of its ring or glow can be shaved off. */}
        <div className="ranked-timeline-clip absolute inset-0 overflow-hidden">
          <ol className="absolute inset-0 m-0 list-none p-0">
            {timeline.nodes.map((node) => (
              <TimelineNodeMark key={node.roundNumber} node={node} slotWidth={slotWidth} />
            ))}
          </ol>
        </div>
        {/* THE STATIONARY CURRENT-POSITION MARKER.
            A sibling of the clip, in the same coordinate space and using the
            same slot arithmetic, so it rings the node at its slot exactly. It
            holds still from the anchor onward while the rounds travel beneath
            it; a terminal match has no round in play, so it is absent. */}
        {markerIndex !== null && (
          <div
            aria-hidden
            data-testid="ranked-timeline-marker"
            style={{ width: slotWidth, transform: `translateX(${markerIndex * 100}%)` }}
            className="ranked-timeline-marker pointer-events-none absolute inset-y-0 left-0
              flex flex-col items-center justify-end gap-[3px]"
          >
            <svg viewBox="0 0 12 6" className="ranked-timeline-caret h-[5px] w-3" aria-hidden>
              <path d="M6 6L0.8 0h10.4z" fill="#f0d78c" />
            </svg>
            <span className="ranked-timeline-marker-ring block h-8 w-full max-w-[2.25rem]
              rounded-[0.3rem]" />
            {/* Reserves the ordinal row so the ring lands on the plate, not on
                the number under it. */}
            <span className="block h-[9px] w-full" />
          </div>
        )}
      </div>
    </section>
  );
}
