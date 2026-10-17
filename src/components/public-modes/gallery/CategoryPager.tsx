/**
 * MC-UX2 — page through the collections, one at a time.
 *
 * Arrows are the core control: previous / next step through the collections
 * in order (wrapping), and the tabs between them name every collection and
 * jump straight to one. Keyboard: the tabs are a roving tablist (Left / Right,
 * Home / End). No drag or swipe is required for anything.
 */
import { useRef, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryGroup } from "@/lib/public-modes/gallery";
import { cn } from "@/lib/utils";

type GroupId = GalleryGroup["id"];

export function CategoryPager({ groups, active, onChange, panelId }: {
  groups: readonly GalleryGroup[];
  active: GroupId;
  onChange: (id: GroupId, direction: 1 | -1) => void;
  panelId: string;
}) {
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const index = Math.max(0, groups.findIndex((g) => g.id === active));
  const prev = groups[(index - 1 + groups.length) % groups.length];
  const next = groups[(index + 1) % groups.length];

  const go = (id: GroupId, direction: 1 | -1, focus = false) => {
    onChange(id, direction);
    if (focus) tabs.current[id]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, () => void> = {
      ArrowRight: () => go(next.id, 1, true),
      ArrowLeft: () => go(prev.id, -1, true),
      Home: () => go(groups[0].id, -1, true),
      End: () => go(groups[groups.length - 1].id, 1, true),
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  return (
    <nav className="mc-pager" aria-label="Game collections" data-testid="more-challenges-pager">
      <button type="button" className="mc-pager-arrow" onClick={() => go(prev.id, -1)}
        aria-label={`Previous collection: ${prev.title}`} data-testid="more-challenges-prev">
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div role="tablist" aria-label="Game collections" className="mc-pager-tabs" onKeyDown={onKey}>
        {groups.map((g) => {
          const selected = g.id === active;
          return (
            <button
              key={g.id}
              ref={(el) => { tabs.current[g.id] = el; }}
              type="button"
              role="tab"
              id={`mc-tab-${g.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={cn("mc-pager-tab", selected && "is-active")}
              onClick={() => go(g.id, groups.indexOf(g) >= index ? 1 : -1)}
              data-testid={`more-challenges-tab-${g.id}`}
            >
              <span className="mc-pager-tab-title">{g.title}</span>
              <span className="mc-jump-count">{g.modes.length}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="mc-pager-arrow" onClick={() => go(next.id, 1)}
        aria-label={`Next collection: ${next.title}`} data-testid="more-challenges-next">
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </nav>
  );
}
