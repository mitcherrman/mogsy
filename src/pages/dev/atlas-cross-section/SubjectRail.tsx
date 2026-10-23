/**
 * ATL-CS-UX-001 — the A and B rails.
 *
 * One component, two orientations. A rail is a roving-tabindex listbox of
 * 44px icon buttons: arrows move, Enter/Space select, Delete clears. Hover
 * and focus reveal the name (the `data-tip` label); on touch the name of the
 * active subject is always printed in the intersection header, and every
 * button has a full aria-label, so a tooltip is never the only description.
 *
 * The B rail carries the B.1 socket: an item slot visibly chained to the
 * active B. It is disabled, with the reason, unless B is a champion.
 */
import { Link2, X } from "lucide-react";
import { useCallback, useRef, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHAMPIONS, ITEMS, findSubject, type Subject } from "@/lib/atlas-cross-section/fixtures";
import type { SubjectRef } from "@/lib/atlas-cross-section/types";
import { sameSubject } from "@/lib/atlas-cross-section/query";
import { SubjectIcon } from "./icons";

export interface SubjectRailProps {
  axis: "A" | "B";
  orientation: "vertical" | "horizontal";
  value: SubjectRef | null;
  onChange: (subject: SubjectRef | null) => void;
  /** B only. */
  b1ItemId?: string | null;
  onB1Change?: (itemId: string | null) => void;
  compact?: boolean;
}

function refOf(s: Subject): SubjectRef {
  return { kind: s.kind, id: s.id };
}

export function SubjectRail({ axis, orientation, value, onChange, b1ItemId = null, onB1Change, compact = false }: SubjectRailProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const subjects: Subject[] = [...CHAMPIONS, ...ITEMS];
  const activeIndex = subjects.findIndex((s) => sameSubject(refOf(s), value));
  const focusIndex = activeIndex >= 0 ? activeIndex : 0;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-subject]") ?? []);
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (current < 0) return;
      const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      let target = -1;
      if (event.key === prev) target = Math.max(0, current - 1);
      else if (event.key === next) target = Math.min(buttons.length - 1, current + 1);
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = buttons.length - 1;
      else if (event.key === "Delete" || event.key === "Backspace") {
        if (value) {
          event.preventDefault();
          onChange(null);
        }
        return;
      } else return;
      event.preventDefault();
      buttons[target]?.focus();
    },
    [orientation, onChange, value],
  );

  const bIsChampion = value?.kind === "champion";
  const b1 = b1ItemId ? findSubject({ kind: "item", id: b1ItemId }) : null;

  return (
    <div className={`acs-rail acs-rail--${orientation} acs-rail--${axis.toLowerCase()}`} data-compact={compact}>
      <div className="acs-rail__axis" aria-hidden="true">
        <span className="acs-rail__axis-letter">{axis}</span>
        <span className="acs-rail__axis-name">{axis === "A" ? "Subject" : "Against"}</span>
      </div>
      <div ref={listRef} role="listbox" aria-label={`Axis ${axis}: ${axis === "A" ? "subject" : "second subject"}. Champions and items.`} aria-orientation={orientation} className="acs-rail__list" onKeyDown={onKeyDown}>
        {subjects.map((s, i) => {
          const ref = refOf(s);
          const selected = i === activeIndex;
          const isFirstItem = s.kind === "item" && subjects[i - 1]?.kind === "champion";
          return (
            <button
              key={`${s.kind}:${s.id}`}
              type="button"
              role="option"
              aria-selected={selected}
              aria-label={`${s.name}, ${s.kind}${selected ? ", selected" : ""}`}
              data-subject={`${s.kind}:${s.id}`}
              data-tip={s.name}
              data-divider={isFirstItem || undefined}
              tabIndex={i === focusIndex ? 0 : -1}
              className="acs-rail__option"
              onClick={() => onChange(selected ? null : ref)}
            >
              <SubjectIcon subject={ref} size={compact ? "sm" : "md"} decorative />
            </button>
          );
        })}
      </div>
      {value ? (
        <button type="button" className="acs-rail__clear" onClick={() => onChange(null)} aria-label={`Clear axis ${axis} (${findSubject(value)?.name ?? value.id})`} data-tip="Clear">
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      {axis === "B" && onB1Change ? (
        <div className="acs-socket" data-attached={Boolean(b1)} data-enabled={bIsChampion}>
          <span className="acs-socket__chain" aria-hidden="true">
            <Link2 size={12} />
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="acs-socket__slot"
                disabled={!bIsChampion}
                aria-label={
                  !bIsChampion
                    ? "B.1 item slot. Disabled: B.1 needs a champion in B to equip."
                    : b1
                      ? `B.1: ${findSubject(value)?.name} equips ${b1.name}. Change or remove the item.`
                      : `B.1: equip an item on ${findSubject(value)?.name}`
                }
                data-tip={!bIsChampion ? "Needs a champion in B" : b1 ? `B.1 · ${b1.name}` : "B.1 · equip an item"}
                title={!bIsChampion ? "B.1 needs a champion in B to equip." : undefined}
              >
                {b1 ? <SubjectIcon subject={{ kind: "item", id: b1.id }} size={compact ? "sm" : "md"} decorative /> : <span className="acs-socket__empty" aria-hidden="true">+</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent align={orientation === "horizontal" ? "end" : "start"} className="acs-pop" aria-label="Choose the B.1 item">
              <p className="acs-pop__title">
                B.1 · {findSubject(value)?.name} equips
              </p>
              <div className="acs-pop__grid" role="listbox" aria-label="Items">
                {ITEMS.map((item) => (
                  <button key={item.id} type="button" role="option" aria-selected={b1ItemId === item.id} className="acs-pop__item" onClick={() => onB1Change(item.id)}>
                    <SubjectIcon subject={{ kind: "item", id: item.id }} size="md" decorative />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              {b1 ? (
                <button type="button" className="acs-btn acs-btn--ghost" onClick={() => onB1Change(null)}>
                  <X size={13} aria-hidden="true" /> Remove {b1.name}
                </button>
              ) : null}
              <p className="acs-why">Intent: equipped for research. The item is attached to B only; no combat outcome is computed.</p>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </div>
  );
}
