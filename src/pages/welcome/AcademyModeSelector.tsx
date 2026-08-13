import { useRef } from "react";

import type { AcademyMode } from "./academyModes";

/**
 * The four mode names, as selectable plaques beneath the featured exhibit.
 *
 * Real tab semantics (tablist / tab / tabpanel wiring lives in the parent), not
 * clickable divs: the control genuinely is "pick one of four, the panel above
 * updates", and a screen reader should hear exactly that — which one of four,
 * and which is current.
 *
 * The plaques are deliberately UNIFORM. The previous four-card row inherited the
 * asset situation directly: two modes had finished Academy plates and two had
 * icons, so half the row looked unfinished. Here the artwork lives in the
 * exhibit, one mode at a time, and the selectors carry only a name and a small
 * icon — so no mode can look poorer than its neighbour, whatever art exists.
 */
export default function AcademyModeSelector({
  modes,
  selectedId,
  onSelect,
  compact = false,
}: {
  modes: AcademyMode[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Landscape phones — keep every label on one line to save vertical room. */
  compact?: boolean;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Arrow-key roving focus, per the tabs pattern: a keyboard user moves through
  // the set with arrows rather than tabbing past four separate stops.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = modes.findIndex((m) => m.id === selectedId);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (i + 1) % modes.length;
    if (e.key === "ArrowLeft") next = (i - 1 + modes.length) % modes.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = modes.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = modes[next].id;
    onSelect(id);
    refs.current[id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Academy modes"
      onKeyDown={onKeyDown}
      className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
    >
      {modes.map((mode) => {
        const selected = mode.id === selectedId;
        const { Icon } = mode;
        return (
          <button
            key={mode.id}
            ref={(el) => {
              refs.current[mode.id] = el;
            }}
            type="button"
            role="tab"
            id={`academy-mode-tab-${mode.id}`}
            aria-selected={selected}
            aria-controls="academy-mode-panel"
            // Only the selected tab is a tab stop; arrows move within the set.
            tabIndex={selected ? 0 : -1}
            data-testid={`academy-mode-tab-${mode.id}`}
            onClick={() => onSelect(mode.id)}
            className={[
              "group flex items-center justify-center gap-2 rounded-xl px-2.5 py-2.5 sm:px-3",
              "border transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c]/80",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-[#04070f]",
              selected
                ? "border-[#c9a84c]/70 bg-[#c9a84c]/14 shadow-[0_0_20px_rgba(201,168,76,0.16)]"
                : "border-[#c9a84c]/18 bg-white/[0.02] hover:border-[#c9a84c]/40 hover:bg-[#c9a84c]/[0.07]",
            ].join(" ")}
          >
            <Icon
              className={[
                "h-4 w-4 shrink-0 transition-colors",
                selected ? "text-[#f0d78c]" : "text-[#cfc4a5]/50 group-hover:text-[#f0d78c]/80",
              ].join(" ")}
              aria-hidden="true"
            />
            <span
              className={[
                "ranked-title text-center leading-tight",
                // "Mogzy Archives" is the long one: left to wrap it makes every
                // plaque in the row two lines tall, which a 360px-tall landscape
                // phone cannot spare.
                compact
                  ? "whitespace-nowrap text-[11px]"
                  : "text-balance text-[12px] sm:text-sm",
                selected ? "text-[#f0d78c]" : "text-[#cfc4a5]/75",
              ].join(" ")}
            >
              {mode.title}
            </span>
          </button>
        );
      })}
    </div>
  );
}
