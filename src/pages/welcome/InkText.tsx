import type { CSSProperties, ReactNode } from "react";

/**
 * One reveal slot.
 *
 * `revealed` is the only thing the sequence controller hands the view. Closed,
 * the slot is transparent; open, the CSS animation inside it runs and the slot
 * settles onto the page as ONE PIECE. Marking it with a data attribute rather
 * than conditionally mounting is load-bearing: the words exist for assistive
 * technology, find-in-page, translation extensions and tests from the moment
 * the chapter mounts, and only sighted visitors experience the reveal as a
 * passage of time.
 */
export function RevealSlot({
  revealed,
  className = "",
  children,
  style,
}: {
  revealed: boolean;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`tome-slot ${className}`}
      data-revealed={revealed ? "true" : "false"}
      style={style}
    >
      {children}
    </div>
  );
}

/**
 * One BLOCK of body copy — a whole short paragraph, arriving in one piece.
 *
 * This replaces the per-word writing effect the introduction used to have. That
 * effect animated every word of every line on its own delay, which at any pace
 * slow enough to read as handwriting made a two-line chapter take the better
 * part of ten seconds; the sequence's stops were then added on top of it. A
 * block now simply fades and rises into place over BLOCK_FADE_MS, the
 * controller breathes once, and the next block does the same. See cadence.ts
 * for why, and for every number involved.
 *
 * Same contract as RevealSlot, and for the same reasons: the text is ALWAYS in
 * the document, and only its appearance is staged. It is a real `<p>` so the
 * copy wraps, selects and reads as prose.
 */
export function InkBlock({ text, revealed }: { text: string; revealed: boolean }) {
  return (
    <p className="tome-body tome-block" data-revealed={revealed ? "true" : "false"}>
      {text}
    </p>
  );
}
