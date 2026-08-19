/**
 * Ranked League role picker (R1).
 *
 * The five canonical roles, rendered from the ONE frontend definition in
 * `@/lib/ranked-public/roles`. This never lists the roles itself and never
 * mentions the legacy Tank/Mage/Marksman class — a role is not a class and is
 * never mapped to one.
 *
 * Accessibility contract:
 *  - a real `radiogroup` with roving tabindex: one tab stop, arrows/Home/End
 *    move and select, Space/Enter selects (native button activation);
 *  - every option carries its role NAME as text, so identity survives with no
 *    colour, icon, mascot or silhouette;
 *  - selection state is exposed as `aria-checked`, not by styling alone;
 *  - focus is visibly ringed, and every transition is reduced-motion safe.
 */

import { useEffect, useRef, useState } from "react";
import {
  RANKED_ROLES, RANKED_ROLE_BLURBS, RANKED_ROLE_LABELS, type RankedRole,
} from "@/lib/ranked-public/roles";

export function RankedRolePicker({
  value, onSelect, busy = false, busyRole = null, disabled = false,
  legend = "Choose your role", hint,
}: {
  value: RankedRole | null;
  onSelect: (role: RankedRole) => void;
  /** A write is in flight; every option is inert until it settles. */
  busy?: boolean;
  /** The option whose write is in flight, marked `aria-busy`. */
  busyRole?: RankedRole | null;
  disabled?: boolean;
  legend?: string;
  hint?: string;
}) {
  const inert = busy || disabled;
  // Roving tabindex: the checked option is the group's single tab stop, and
  // an unselected group starts on the first option (WAI-ARIA radiogroup).
  const [focusIndex, setFocusIndex] = useState(() => {
    const i = value ? RANKED_ROLES.indexOf(value) : -1;
    return i >= 0 ? i : 0;
  });
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shouldFocus = useRef(false);

  useEffect(() => {
    if (value) {
      const i = RANKED_ROLES.indexOf(value);
      if (i >= 0) setFocusIndex(i);
    }
  }, [value]);

  // Move focus only in response to a KEY press — never on mount, and never
  // when the parent re-renders for an unrelated reason.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    refs.current[focusIndex]?.focus();
  }, [focusIndex]);

  function moveTo(index: number) {
    const next = (index + RANKED_ROLES.length) % RANKED_ROLES.length;
    shouldFocus.current = true;
    setFocusIndex(next);
    if (!inert) onSelect(RANKED_ROLES[next]);
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    switch (event.key) {
      case "ArrowRight": case "ArrowDown": event.preventDefault(); moveTo(index + 1); break;
      case "ArrowLeft": case "ArrowUp": event.preventDefault(); moveTo(index - 1); break;
      case "Home": event.preventDefault(); moveTo(0); break;
      case "End": event.preventDefault(); moveTo(RANKED_ROLES.length - 1); break;
      default: break;
    }
  }

  return (
    <div className="space-y-3" data-testid="ranked-role-picker">
      <div className="space-y-1">
        <div className="ranked-eyebrow" id="ranked-role-legend">{legend}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div role="radiogroup" aria-labelledby="ranked-role-legend"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {RANKED_ROLES.map((roleId, index) => {
          const selected = value === roleId;
          return (
            <button key={roleId} type="button" role="radio"
              ref={(el) => { refs.current[index] = el; }}
              data-testid={`ranked-role-${roleId}`}
              aria-checked={selected}
              aria-busy={busyRole === roleId}
              tabIndex={index === focusIndex ? 0 : -1}
              disabled={inert}
              onKeyDown={(e) => onKeyDown(e, index)}
              onClick={() => { setFocusIndex(index); onSelect(roleId); }}
              className={`min-h-[44px] rounded-lg border-2 p-3 text-center transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-60 ${
                selected
                  ? "border-[#c9a84c] bg-[#c9a84c]/10 shadow-[0_0_18px_-6px_rgba(201,168,76,0.6)]"
                  : "border-white/10 bg-white/[0.03] enabled:hover:border-[#c9a84c]/40"}`}>
              {/* The NAME is the identity. Nothing above it may replace it. */}
              <div className="font-semibold">{RANKED_ROLE_LABELS[roleId]}</div>
              <div className="text-xs text-muted-foreground">
                {busyRole === roleId ? "Saving…" : RANKED_ROLE_BLURBS[roleId]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
