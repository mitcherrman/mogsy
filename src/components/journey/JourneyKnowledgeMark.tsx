/**
 * K2 — THE KNOWLEDGE MARK: a tiny `!` at the top-right of a board object the
 * Journey has established facts about, and a small popover listing them.
 *
 *   E · Rank 1
 *   ⏱ 5s                 Step 1
 *   ⚡ 11s · 10 AH       Step 3
 *
 *   E · Shadow Slash · Rank 1   ("Rank", never "R1": JP4)
 *   ƒ Formula 70 / 92.5 / 115 / 137.5 / 160 (+70% bonus AD)   Step 1
 *   ⚔ Raw damage 85      Step 2
 *
 * The `!` means "the Journey established something about this", never "you
 * answered it correctly" (a wrong answer + reveal marks it the same way).
 *
 * JP3 — ONE GRAMMAR. The gold `!` is the only learned-knowledge sign on the
 * board: on an ability's icon for its facts. JP5: a champion's stats live in its
 * portrait's notebook (`JourneyChampionNotebook`), which wears the same `!`; the
 * board carries no stat chips. Lines read "learned Step N".
 *
 * Interaction: a mouse hover opens it and leaving closes it; a click or tap
 * pins it open, a second click/tap or an outside tap closes it; Enter/Space
 * toggle and Escape closes (Radix Popover). The popover is portalled, so the
 * board's `overflow: hidden` cannot clip it, and Radix keeps it inside the
 * viewport. The badge is absolutely positioned: it lays out nothing.
 */
import { useRef, useState } from "react";
import { SquareFunction, Sword, Timer, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { knowledgeCard, stepLabel, type KnowledgeObjectMark } from "@/lib/journey/knowledge";

export function JourneyKnowledgeMark({ mark, name, abilityName = null, championName = null, placement, fresh = false, testId }: {
  mark: KnowledgeObjectMark;
  /** The object's accessible name, e.g. "Zed E". */
  name: string;
  /** The board's own name for the ability ("Shadow Slash"), titling its card. */
  abilityName?: string | null;
  /** The champion's name, titling a champion / stat card ("Ahri · Lv2"). */
  championName?: string | null;
  /**
   * `ability`: pinned to the icon's corner (the only placement since JP5).
   */
  placement: "ability";
  /** JP3 — established just now: the badge settles in with one short glow. */
  fresh?: boolean;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const card = knowledgeCard(mark, abilityName, championName);
  const set = (next: boolean, pin = false) => {
    pinned.current = next && pin;
    setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={(next) => set(next)}>
      <PopoverTrigger asChild>
        <button type="button" data-testid={testId} data-facts={mark.facts.length}
          data-just-learned={fresh ? "true" : undefined}
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
        className="journey-know-pop w-auto max-w-[min(17rem,calc(100vw-16px))] p-0">
        {card.title && <div className="journey-know-pop__title">{card.title}</div>}
        <ul className="journey-know-pop__lines">
          {card.lines.map((l) => (
            <li key={`${l.step}:${l.value}:${l.tail ?? ""}`} aria-label={l.spoken}
              className={`journey-know-pop__line${l.wrap ? " journey-know-pop__line--wrap" : ""}`}>
              {l.icon === "cooldown" && <Timer aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              {l.icon === "haste" && <Zap aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              {l.icon === "formula" && <SquareFunction aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              {l.icon === "damage" && <Sword aria-hidden className="journey-know-pop__icon" strokeWidth={2.5} />}
              <span aria-hidden className="journey-know-pop__fact">
                {l.lead && <span className="text-white/60">{l.lead} </span>}
                {l.label && <span className="text-white/70">{l.label} </span>}
                <span className="font-black text-white">{l.value}</span>
                {l.tail && <span className="text-white/60"> · {l.tail}</span>}
              </span>
              <span aria-hidden className="journey-know-pop__step">{stepLabel(l.step)}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
