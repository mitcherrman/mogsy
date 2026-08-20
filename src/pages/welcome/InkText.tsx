import type { CSSProperties, ElementType, ReactNode } from "react";

import { BODY_WORD_PACE } from "./phrases";

/**
 * Words written onto the page, one after another.
 *
 * The whole string is ALWAYS in the DOM. Only its appearance is staged: each
 * word carries an index which CSS turns into an animation delay, so the line
 * darkens into place left to right the way a quill lays it down. Nothing is
 * mounted late and nothing is `aria-hidden`, which is the load-bearing part —
 * a screen reader, a text search, a translation extension and a test all see a
 * finished paragraph the moment its slot opens, and only sighted visitors
 * experience the writing as a passage of time.
 *
 * Splitting on whitespace rather than on characters is deliberate. Per-character
 * reveals read as a typewriter — the exact aesthetic HI1-C rules out — and they
 * also break a word across two visual states mid-render, which is much harder to
 * read than a word simply arriving.
 */
export default function InkText({
  text,
  as: Tag = "p",
  className = "",
  /** Milliseconds between consecutive words. */
  pace = 42,
  /** Delay before the first word, for staging a heading under its eyebrow. */
  offset = 0,
  style,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  pace?: number;
  offset?: number;
  style?: CSSProperties;
}) {
  const words = text.split(" ");
  return (
    <Tag className={`tome-ink ${className}`} style={style}>
      {words.map((word, i) => (
        <span
          key={`${i}-${word}`}
          className="tome-word"
          style={{ ["--w" as string]: String(offset + i * pace) } as CSSProperties}
        >
          {word}
          {/* A real space, outside the animated span, so the line still wraps
              and still copies as prose. */}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

/**
 * One SENTENCE of body copy, written when its own beat arrives.
 *
 * The paragraph stays one `<p>` — sentences are inline spans inside it, so the
 * text wraps, selects and reads exactly as prose — but each carries its own
 * `revealed` gate. That is what gives HI1-C3 its cadence: the controller
 * releases a whole sentence, which then writes itself straight through
 * regardless of how many display lines it takes, breathes once, and releases
 * the next. (HI1-C2 gated a clause at a time here, which is why the page
 * stopped mid-thought.) Same contract as everywhere else: the words are ALWAYS
 * in the DOM, and only their appearance is staged.
 *
 * `pace` defaults to the one authority for it, so the controller's model of
 * this animation and the animation itself cannot drift apart.
 */
export function InkPhrase({
  text,
  revealed,
  trailingSpace = true,
  pace = BODY_WORD_PACE,
}: {
  text: string;
  revealed: boolean;
  /** A real space after the sentence so the paragraph still reads as prose. */
  trailingSpace?: boolean;
  pace?: number;
}) {
  const words = text.split(" ");
  return (
    <span className="tome-phrase" data-revealed={revealed ? "true" : "false"}>
      {words.map((word, i) => (
        <span
          key={`${i}-${word}`}
          className="tome-word"
          style={{ ["--w" as string]: String(i * pace) } as CSSProperties}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
      {trailingSpace ? " " : ""}
    </span>
  );
}

/**
 * One reveal slot.
 *
 * `revealed` is the only thing the sequence controller hands the view. Closed,
 * the slot is transparent; open, the CSS rules inside it begin to apply and the
 * ink and illustration animations start. Marking it with a data attribute
 * rather than conditionally mounting is what lets the words exist for assistive
 * technology before they exist for the eye.
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
    <div className={`tome-slot ${className}`} data-revealed={revealed ? "true" : "false"} style={style}>
      {children}
    </div>
  );
}
