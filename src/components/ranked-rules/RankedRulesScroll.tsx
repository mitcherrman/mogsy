/**
 * RANKED'S RULES SCROLL — the wiring between the seen-version, the shell and
 * the copy.
 *
 * WHEN IT OPENS BY ITSELF, AND WHY THERE
 * ──────────────────────────────────────
 * On mount, once, if this browser has not acknowledged the current rules
 * version. That is the moment the Ranked arena appears, and it is the earliest
 * honest one available: `/quiz/ranked` hosts a LIVE match with a server-owned
 * round clock, so there is no pre-play beat on this route to wait for, and
 * manufacturing one would mean either a client-side pause (which cannot be
 * authoritative and must not be attempted) or a change to backend round
 * timing, which is out of scope and would be the wrong trade for an
 * explanation.
 *
 * Opening into a running round is safe here because of WHERE the scroll is,
 * not because of when: it is a `position: fixed` control in the bottom-right
 * corner, outside `ArenaShell` and outside the arena's layout entirely. It
 * covers no question, no answer tablet, no timer and neither score on a
 * desktop width, and the round it appears over keeps running exactly as it
 * would have. The tradeoff that remains is a phone one — at 375px the sheet
 * does sit over the lower part of the surface while it is open — and it is
 * dismissed with one press of a full-width control, or Escape.
 *
 * The auto-open decision is taken ONCE, in a lazy initializer. Re-reading
 * storage on every render would re-open the scroll the moment the player
 * dismissed it, and re-deciding after an acknowledgement would fight the
 * player for the corner.
 */
import { useCallback, useState } from "react";
import { MogzyExplainsPanel } from "./MogzyExplainsPanel";
import { RankedRulesContent } from "./RankedRulesContent";
import {
  RANKED_RULES_VERSION,
  markRankedRulesSeen,
  shouldAutoOpenRankedRules,
} from "@/lib/ranked/ranked-rules-seen";

export function RankedRulesScroll() {
  const [open, setOpen] = useState(() => shouldAutoOpenRankedRules());

  /* Dismissal IS the acknowledgement, and it is recorded on every close —
     including a close of a scroll the player reopened themselves. Writing it
     unconditionally keeps one meaning for the key ("these rules have been put
     in front of this browser and put away again") and costs one idempotent
     localStorage write. */
  const close = useCallback(() => {
    setOpen(false);
    markRankedRulesSeen(RANKED_RULES_VERSION);
  }, []);

  const openScroll = useCallback(() => setOpen(true), []);

  return (
    <MogzyExplainsPanel
      open={open}
      onOpen={openScroll}
      onClose={close}
      title="Ranked Rules"
      tabLabel="Rules"
      openLabel="View Ranked scoring rules"
      testId="ranked-rules"
    >
      <RankedRulesContent />
    </MogzyExplainsPanel>
  );
}
