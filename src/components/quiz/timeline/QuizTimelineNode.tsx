/**
 * RG2 — THE quiz timeline node. One box, three independent channels.
 *
 *     ┌──────────────┐
 *     │ ▔▔▔▔▔▔▔▔▔▔▔▔ │  <- RESULT: a glowing stripe on the TOP edge
 *     │              │
 *     │  MAIN ICON   │  <- SUBJECT: the category, or the champion it is about
 *     │        (b)   │  <- BADGE: which KIND of question, over the portrait
 *     │              │
 *     │ ▁▁ ▁▁ ▁▁     │  <- DIFFICULTY: metal strips on the BOTTOM edge
 *     └──────────────┘
 *
 * WHY THE RESULT IS A STRIPE AND NOT A TICK
 * ─────────────────────────────────────────
 * Replacing the icon with a ✓ or an ✗ would cost the node its subject, which
 * is the thing a study record is for: "you got question 6 wrong" is a score,
 * and "you got the Aatrox cooldown question wrong" is a lesson. So the icon
 * always survives and the verdict is an OVERLAY — a channel of its own, on an
 * edge of its own, readable at a glance across a whole strip without ever
 * being confusable with the subject.
 *
 * WHY DIFFICULTY IS METAL AND NOT A WORD
 * ──────────────────────────────────────
 * Nine of these sit side by side at roughly 36px. "EASY" does not fit, dots do
 * not carry an order, and stars mean quality rather than difficulty. Slices of
 * metal do carry an order — bronze, silver, gold is a ladder every player of
 * this game already reads — and one, two or three of them is countable at a
 * glance without being read. The word still exists for assistive tech, in
 * `nodeLabel`; it is simply not the visible design.
 *
 * EVERY NODE IS THE SAME SIZE IN EVERY STATE
 * ──────────────────────────────────────────
 * The stripe and the strips are absolutely placed against the plate, and the
 * plate's height is fixed. A node gaining a verdict, a difficulty or a subject
 * changes colours and opacities and NOTHING that lays out — which is what lets
 * the Ranked strip advance a round without moving a pixel of the arena, and
 * what stops a Daily's timeline growing as it is played.
 */
import type { CSSProperties } from "react";
import {
  resolveNodeArt,
  tierStripCount,
  type QuizTimelineNodeModel,
  type TimelineBadge,
  type TimelineOutcome,
} from "./timelineNodeModel";
import type { CategoryGlyph, DifficultyTier } from "@/lib/quiz/publicCategory";

/**
 * The verdict channel, in TWO cues: an ink and a shape.
 *
 * The ink is the arena's existing four tones, unchanged — the timeline is not
 * the place a new result vocabulary appears.
 *
 * The shape is not decoration. The node's headline verdicts are green for
 * right and red for wrong, which is the single most common colour-vision
 * failure there is, so the stripe is also SEGMENTED differently per outcome
 * and the segmentation carries a meaning rather than a code:
 *
 *   correct       ▔▔▔▔▔▔▔▔▔▔   one unbroken bar
 *   both correct  ▔▔▔▔  ▔▔▔▔   two bars: both players got there
 *   incorrect     ▔▔ ▔▔ ▔▔ ▔▔  a broken bar
 *   timed out     ▁▁▁▁▁▁▁▁▁▁   one faint bar: nothing landed
 *
 * This replaces the four distinct verdict GLYPHS the pre-RG2 node drew in its
 * corner. The information is the same and it now lives on the result channel
 * instead of floating over the subject, which is what let the subject become
 * the plate's main content.
 */
const OUTCOME_INK: Record<TimelineOutcome, string> = {
  correct: "#6ee7b7",
  "both-correct": "#e8c97a",
  incorrect: "#e2757b",
  "timed-out": "#a9b3c1",
};

/** How many segments the stripe breaks into. See `OUTCOME_INK`. */
const OUTCOME_SEGMENTS: Record<TimelineOutcome, number> = {
  correct: 1,
  "both-correct": 2,
  incorrect: 4,
  "timed-out": 1,
};

/**
 * The metals, darkest edge to brightest face, so a strip reads as a physical
 * slice with a lit top rather than as a coloured line.
 *
 * THREE METALS FOR THREE LEVELS. `scenario` is byte-identical to `hard`, not
 * merely similar: the difficulty channel has exactly three appearances, and a
 * scenario node must be indistinguishable from a hard one here. See
 * `TIER_STRIPS` for why the backend still tells them apart.
 */
const TIER_METAL: Record<DifficultyTier, { dark: string; lit: string }> = {
  easy: { dark: "#7a4a24", lit: "#c98a4b" },       // bronze
  medium: { dark: "#7c8794", lit: "#d6dee6" },     // silver
  hard: { dark: "#9a7a1e", lit: "#f0d78c" },       // gold
  scenario: { dark: "#9a7a1e", lit: "#f0d78c" },   // gold — drawn AS hard
};

// ────────────────────────────────────────────────────────────────── glyphs

function Glyph({ kind }: { kind: CategoryGlyph }) {
  const common = { viewBox: "0 0 24 24", className: "h-4 w-4",
    "aria-hidden": true } as const;
  switch (kind) {
    case "meta-reflex":
      // The SAME four-point star the block's own sting uses.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinejoin="round">
          <path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
        </svg>
      );
    case "scenario":
      // Crossed swords: a situation being fought through, not an object.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.9"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 3l10 12M20 3L10 15" />
          <path d="M3.5 20.5l3-3M20.5 20.5l-3-3" />
          <path d="M5.5 15.5L3 18l3 3 2.5-2.5M18.5 15.5L21 18l-3 3-2.5-2.5" />
        </svg>
      );
    case "champion-stat":
      // A ledger of numbers: three rising bars behind a rule. Reads as "the
      // champion's own figures" rather than as any one stat.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round">
          <path d="M4 20V12M10 20V6M16 20v-5M22 20H2" />
        </svg>
      );
    case "fundamental":
      // An open book: the rules of the game.
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinejoin="round">
          <path d="M12 6.5S9.5 4.5 3 5v13c6.5-.5 9 1.5 9 1.5s2.5-2 9-1.5V5c-6.5-.5-9 1.5-9 1.5z" />
          <path d="M12 6.5v13" />
        </svg>
      );
    default:
      // A hollow ring: a position that exists and nothing more.
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor"
            strokeWidth="2.4" />
        </svg>
      );
  }
}

/**
 * The small mark over a subject portrait saying which KIND of question it is.
 *
 * Drawn on a filled disc rather than bare: it sits on top of champion art,
 * which is busy, and an unbacked line mark disappears into a splash.
 */
function Badge({ kind }: { kind: TimelineBadge }) {
  if (kind === "none") return null;
  return (
    <span aria-hidden className="quiz-timeline-badge">
      <svg viewBox="0 0 24 24" className="h-[9px] w-[9px]" fill="none"
        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
        strokeLinejoin="round">
        {kind === "stat" && <path d="M5 20V12M12 20V4M19 20v-6" />}
        {kind === "combat" && (
          <>
            <path d="M4 3l16 18M20 3L4 21" />
          </>
        )}
        {kind === "ability" && <path d="M13 2L4 14h7l-1 8 9-12h-7z" />}
        {kind === "cooldown" && (
          <>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l3 2" />
          </>
        )}
        {kind === "cost" && (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v8M9.5 10h5M9.5 14h5" />
          </>
        )}
      </svg>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────── the node

/**
 * The plate and everything painted on it.
 *
 * Deliberately takes only a model and presentation flags: it reads no match
 * state, holds no state, starts no timer and makes no judgement — every
 * decision it draws was made in `quizTimelineNode.ts`.
 */
export function QuizTimelineNode({
  node,
  className = "",
}: {
  node: QuizTimelineNodeModel;
  className?: string;
}) {
  const art = resolveNodeArt(node.topic);
  const strips = tierStripCount(node.topic?.tier ?? null);
  const tier = node.topic?.tier ?? null;
  const metal = tier ? TIER_METAL[tier] : null;
  return (
    <span
      data-testid="quiz-timeline-plate"
      data-category={node.topic?.category ?? ""}
      data-tier={tier ?? ""}
      data-strips={String(strips)}
      data-outcome={node.outcome ?? ""}
      data-badge={art.badge}
      data-specific={art.specific ? "true" : "false"}
      // The plate's OWN box is fixed by the caller's layout, not by this
      // component: the Ranked strip rings it with a marker at an exact slot
      // width, so a node that sized itself would break that alignment. Every
      // channel below is absolutely placed inside it and costs no height.
      className={`quiz-timeline-plate ${className}`}
    >
      {/* THE RESULT CHANNEL. Absolutely placed on the top edge, so it costs no
          height and its arrival moves nothing. Absent — not grey — on an
          unresolved node: an empty channel is how "not yet" is drawn. */}
      {node.outcome && (
        <span
          aria-hidden
          data-testid="quiz-timeline-result-stripe"
          data-segments={String(OUTCOME_SEGMENTS[node.outcome])}
          className="quiz-timeline-result"
          style={{
            // One colour drives every segment and its glow, so a verdict
            // cannot end up lit in a different hue than it is painted.
            "--result-ink": OUTCOME_INK[node.outcome],
          } as CSSProperties}
        >
          {Array.from({ length: OUTCOME_SEGMENTS[node.outcome] }, (_, i) => (
            <span key={i} className="quiz-timeline-result-segment" />
          ))}
        </span>
      )}

      {/* THE SUBJECT CHANNEL. */}
      <span aria-hidden className="quiz-timeline-face">
        {art.src
          ? (
            <img
              src={art.src}
              alt=""
              loading="lazy"
              draggable={false}
              data-specific={art.specific ? "true" : "false"}
              className="quiz-timeline-art"
            />
          )
          : <Glyph kind={art.glyph ?? "unknown"} />}
        <Badge kind={art.badge} />
      </span>

      {/* THE DIFFICULTY CHANNEL. Rendered only when a tier was STATED — see
          `tierStripCount`.
          The slices run ALONG the bottom edge rather than stacking up from it,
          for two reasons. Nine of these plates sit side by side at 32px tall,
          so a stack of four hairlines would eat a quarter of the plate's
          height and squeeze the icon that is meant to be the main event;
          laid along the edge they cost 2.5px whatever the count. And a row of
          slices is countable at a glance in a way stacked hairlines at 1.5px
          apart are not. They are centred and fixed-width, never stretched to
          fill, so three slices can never be misread as a progress bar. */}
      {metal && strips > 0 && (
        <span aria-hidden data-testid="quiz-timeline-difficulty"
          className="quiz-timeline-metal">
          {Array.from({ length: strips }, (_, i) => (
            <span
              key={i}
              className="quiz-timeline-metal-strip"
              style={{
                "--metal-dark": metal.dark,
                "--metal-lit": metal.lit,
              } as CSSProperties}
            />
          ))}
        </span>
      )}

    </span>
  );
}
