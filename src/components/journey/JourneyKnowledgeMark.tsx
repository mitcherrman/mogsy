/**
 * K2 — THE KNOWLEDGE MARK: a tiny `!` at the top-right of a board object the
 * Journey has established facts about, and a small popover listing them.
 *
 *   E · R1
 *   ⏱ 5s ①
 *   ⚡ 11s · 10 AH ③
 *
 * The `!` means "the Journey established something about this", never "you
 * answered it correctly" (a wrong answer + reveal marks it the same way).
 *
 * Interaction: a mouse hover opens it and leaving closes it; a click or tap
 * pins it open, a second click/tap or an outside tap closes it; Enter/Space
 * toggle and Escape closes (Radix Popover). The popover is portalled, so the
 * board's `overflow: hidden` cannot clip it, and Radix keeps it inside the
 * viewport. The badge is absolutely positioned: it lays out nothing.
 */
import { useRef, useState } from "react";
import { Timer, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { knowledgeCard, stepMarker, type KnowledgeObjectMark } from "@/lib/journey/knowledge";

export function JourneyKnowledgeMark({ mark, name, placement, testId }: {
  mark: KnowledgeObjectMark;
  /** The object's accessible name, e.g. "Zed E". */
  name: string;
  placement: "ability" | "portrait";
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const card = knowledgeCard(mark);
  const set = (next: boolean, pin = false) => {
    pinned.current = next && pin;
    setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={(next) => set(next)}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} data-facts={mark.facts.length}
          aria-label={`Known facts: ${name}`}
          className={`journey-know journey-know--${placement}`}
          onPointerEnter={(e) => { if (e.pointerType === "mouse" && !open) set(true); }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pinned.current) set(false); }}
          onClick={(e) => {
            // Our own toggle (Radix skips its own when this is prevented): a
            // click on a hover-opened popover PINS it rather than closing it.
            e.preventDefault();
            if (open && pinned.current) set(false);
            else set(true, true);
          }}>
          <span aria-hidden>!</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={4} collisionPadding={8}
        data-testid={`${testId}-pop`} aria-label={`Known facts: ${name}`}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="journey-know-pop w-auto max-w-[min(14rem,calc(100vw-16px))] p-0">
        {card.title && <div className="journey-know-pop__title">{card.title}</div>}
        <ul className="journey-know-pop__lines">
          {card.lines.map((l) => (
            <li key={`${l.step}:${l.value}:${l.tail ?? ""}`} className="journey-know-pop__line" aria-label={l.spoken}>
              {l.icon === "cooldown" && <Timer aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              {l.icon === "haste" && <Zap aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              {l.lead && <span aria-hidden className="text-white/60">{l.lead}</span>}
              <span aria-hidden className="font-black text-white">{l.value}</span>
              {l.tail && <span aria-hidden className="text-white/60">· {l.tail}</span>}
              <span aria-hidden className="journey-know-pop__step">{stepMarker(l.step)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
