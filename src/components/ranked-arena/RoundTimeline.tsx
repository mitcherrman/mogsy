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
 * RG2 — WHAT THE NODE ITSELF IS
 * ─────────────────────────────
 * The plate is no longer drawn here. It is `QuizTimelineNode`, the one node
 * every quiz surface uses, and it draws three independent channels: a result
 * stripe on its top edge, the question's SUBJECT in the middle, and difficulty
 * metal on its bottom edge. What this file kept is everything that is about
 * the STRIP rather than the node — the moving window, the fixed rail, the
 * stationary marker, and the arithmetic that keeps the marker over the node it
 * rings.
 *
 * That split is the point of the phase. A Ranked round and a Daily card are
 * different objects with different lifecycles; a node showing "an easy
 * Itemization question you got right" is the same picture in both, and it was
 * previously only expressible here.
 *
 * The three-glyph rule the old node was built on survives inside the shared
 * node as its neutral token: a round this client has not been told about has
 * no topic, and no topic draws the hollow ring. Nothing is inferred.
 */
import type {
  RoundTimelineView, TimelineNode, TimelineSegmentKind,
} from "@/pages/quiz-ranked/roundTimeline";
import { QuizTimelineNode } from "@/components/quiz/timeline/QuizTimelineNode";
import {
  resolveNodeArt,
  type QuizTimelineNodeModel,
} from "@/components/quiz/timeline/timelineNodeModel";
import { categoryLabel } from "@/lib/quiz/publicCategory";
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
 *
 * RG2 adds the SUBJECT and the DIFFICULTY, and this is the only place they
 * become words. The visible design is a picture and three metal strips, which
 * is right for nine plates at 36px and useless to a reader who cannot see
 * them, so the accessible name carries what the drawing carries: "Round 6,
 * resolved, Aatrox, Abilities & Cooldowns, hard, you answered incorrectly".
 * Both are added only when the server actually published a topic.
 */
export function nodeLabel(node: TimelineNode): string {
  const identity = IDENTITY[identityOf(node.segmentKind)].label;
  const kind = identity ? `, ${identity}` : "";
  const outcome = node.outcome ? `, ${OUTCOME[node.outcome].label}` : "";
  const tag = node.tag ? `, ${node.tag.role} question` : "";
  return `Round ${node.roundNumber}, ${STATE_LABEL[node.state]}${kind}`
    + `${subjectPhrase(node)}${outcome}${tag}`;
}

/**
 * The topic half of the label, or an empty string.
 *
 * Empty whenever the server published no topic — the timeline's standing rule,
 * applied to the words as well as to the picture. A Meta Reflex block is
 * skipped because `kind` above already named it and saying it twice reads as a
 * stutter, which is the one case the two channels genuinely overlap.
 */
function subjectPhrase(node: TimelineNode): string {
  const topic = node.topic;
  if (!topic || topic.category === "meta-reflex") return "";
  const art = resolveNodeArt(topic);
  const category = categoryLabel(topic.category);
  // "Aatrox, Abilities & Cooldowns" — the entity alone does not say which kind
  // of Aatrox question this is, and neither should the sentence.
  const subject = art.specific && art.label !== category
    ? `, ${art.label}, ${category}` : `, ${category}`;
  return topic.tier ? `${subject}, ${topic.tier}` : subject;
}

/**
 * One Ranked round -> the mode-neutral node the shared renderer takes.
 *
 * Deliberately a projection and not a cast. `TimelineNode` carries things that
 * are Ranked's own — the window index, whether the node is inside the clip,
 * the segment kind, the reserved per-question tag — and none of them are the
 * NODE's business. What crosses is the four facts every mode has: where it is,
 * what state it is in, what it is about, and how it went.
 */
function nodeModel(node: TimelineNode): QuizTimelineNodeModel {
  return {
    ordinal: node.roundNumber,
    state: node.state,
    topic: node.topic,
    outcome: node.outcome,
  };
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
      {/* The plate is the SHARED node (`QuizTimelineNode`): result stripe on
          its top edge, subject in the middle, difficulty metal on its bottom
          edge. This wrapper supplies only what is Ranked's to supply — the
          slot geometry the marker's arithmetic depends on, and the segment
          identity's ink, which `currentColor` carries down into the plate's
          border. */}
      <span aria-hidden style={{ color: identity.ink }}
        className="relative block h-8 w-full max-w-[2.25rem]">
        <QuizTimelineNode node={nodeModel(node)} />
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
