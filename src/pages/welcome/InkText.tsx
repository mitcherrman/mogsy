import type { CSSProperties, ElementType, ReactNode } from "react";

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
 * One phrase of body copy, written when its own beat arrives.
 *
 * The paragraph stays one `<p>` — phrases are inline spans inside it, so the
 * text wraps, selects and reads exactly as prose — but each phrase carries its
 * own `revealed` gate. That is what turns the paragraph-at-a-time reveal into
 * the conversational line-by-line cadence HI1-C2 asks for: the sequence
 * controller releases one phrase, breathes, releases the next. Same contract
 * as everywhere else on the page: the words are ALWAYS in the DOM, and only
 * their appearance is staged.
 *
 * `pace` here must stay in step with PHRASE_WORD_PACE in phrases.ts — the
 * controller times its breaths from that model of this animation.
 */
export function InkPhrase({
  text,
  revealed,
  trailingSpace = true,
  pace = 34,
}: {
  text: string;
  revealed: boolean;
  /** A real space after the phrase so the paragraph still reads as prose. */
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
