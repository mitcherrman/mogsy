/**
 * RANKED'S RULES SCROLL — the wiring between the seen-version, the shell and
 * the copy.
 *
 * WHEN IT OPENS BY ITSELF, AND WHY THERE
 * ──────────────────────────────────────
 * On mount, once, if this browser has not acknowledged the current rules
 * version AND the layout can seat the scroll BESIDE the arena rather than over
 * it (`rulesCanOpenBesideArena`). That is the earliest honest moment available:
 * `/quiz/ranked` hosts a LIVE match with a server-owned round clock, so there
 * is no pre-play beat on this route to wait for, and manufacturing one would
 * mean either a client-side pause (which cannot be authoritative and must not
 * be attempted) or a change to backend round timing.
 *
 * Opening into a running round is safe on a wide layout because of WHERE the
 * scroll is, not because of when: it is a `position: fixed` control in the
 * bottom-right corner, outside `ArenaShell` and outside the arena's layout
 * entirely, so it covers no question, no answer tablet, no timer and neither
 * score, and the round keeps running exactly as it would have.
 *
 * A NARROW LAYOUT IS NEVER OPENED INTO. There the same panel is a full-width
 * sheet, and "safe because it sits beside the arena" stops being true — it
 * would lay itself over the lower part of a module already on the clock. So a
 * first-time player on a phone gets a PROMINENT collapsed tab and opens the
 * rules when they choose to. Module 1 stays fully playable until they do.
 *
 * WHAT PROMINENCE IS NOT
 * ──────────────────────
 * It is not a second way of showing the rules, and it is not an
 * acknowledgement. The tab being noticeable proves nothing about whether
 * anybody read anything, so `markRankedRulesSeen` is NOT called when it is
 * drawn: an unseen phone player stays unseen — prominent on the next visit
 * too — until they actually open the scroll and dismiss it. Anything else
 * would quietly spend the one showing this feature gets.
 *
 * The decisions are taken ONCE, in lazy initializers. Re-reading storage on
 * every render would re-open the scroll the moment the player dismissed it,
 * and re-deciding after an acknowledgement would fight the player for the
 * corner.
 */
import { useCallback, useState } from "react";
import { MogzyExplainsPanel } from "./MogzyExplainsPanel";
import { RankedRulesContent } from "./RankedRulesContent";
import {
  RANKED_RULES_VERSION,
  markRankedRulesSeen,
  readSeenRankedRulesVersion,
  rulesCanOpenBesideArena,
} from "@/lib/ranked/ranked-rules-seen";

export function RankedRulesScroll() {
  // What this browser had acknowledged when the arena mounted. Held in state
  // rather than re-read, so the tab's prominence drops the instant the player
  // acknowledges rather than on some later render.
  const [seenVersion, setSeenVersion] = useState(() => readSeenRankedRulesVersion());
  const unseen = seenVersion < RANKED_RULES_VERSION;

  const [open, setOpen] = useState(() =>
    readSeenRankedRulesVersion() < RANKED_RULES_VERSION && rulesCanOpenBesideArena());

  /* Dismissal IS the acknowledgement, and it is recorded on every close —
     including a close of a scroll the player reopened themselves. Writing it
     unconditionally keeps one meaning for the key ("these rules have been put
     in front of this browser and put away again") and costs one idempotent
     localStorage write. The player must have OPENED the scroll to reach this,
     which is what keeps a merely-drawn tab from marking anything seen. */
  const close = useCallback(() => {
    setOpen(false);
    markRankedRulesSeen(RANKED_RULES_VERSION);
    setSeenVersion(RANKED_RULES_VERSION);
  }, []);

  const openScroll = useCallback(() => setOpen(true), []);

  return (
    <MogzyExplainsPanel
      open={open}
      onOpen={openScroll}
      onClose={close}
      // Only while there is something unread to find. A player who has
      // acknowledged these rules gets the quiet tab, on every layout.
      prominent={unseen && !open}
      title="Ranked Rules"
      tabLabel="Rules"
      openLabel="View Ranked scoring rules"
      testId="ranked-rules"
    >
      <RankedRulesContent />
    </MogzyExplainsPanel>
  );
}
