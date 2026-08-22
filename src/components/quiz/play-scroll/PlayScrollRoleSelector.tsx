/**
 * PLAY1 — the role, chosen ON the record.
 *
 * This band used to be a read-out: it showed whichever role the lobby had
 * already settled on, and a player who changed their mind had to close the
 * record and go back to the lobby's carousel to do anything about it. It is
 * now the choice itself — one mascot, an arrow either side, and the name
 * between them.
 *
 * DELIBERATELY NOT THE LOBBY'S CAROUSEL. The lobby stage shows three mascots
 * on a rotating ring with flanks, plinths and a mastery ledger; that is a
 * browsing surface and it is the right thing for a page. This is a compact
 * single-role stepper on a dialog the player opened to start a match, so it
 * shows exactly one figure and gets out of the way. Sharing the component
 * would mean fitting a ring into a 250px sheet.
 *
 * BROWSING IS LOCAL, AND THAT RULE IS OLDER THAN THIS FILE
 * ───────────────────────────────────────────────────────
 * Stepping the arrows writes NOTHING. `PUT /api/ranked/role` is rate limited
 * to ten writes per account per minute (`role_set`), and a five-role ring is
 * two laps away from exhausting it — which is exactly the bug the lobby's own
 * carousel was changed to avoid. A player turning through five mascots is
 * browsing, not choosing, and it must cost nothing and be possible forever.
 *
 * So the arrows move `previewRole`, which is local to the open record, and the
 * account is written once — when the player commits by choosing Ranked Match.
 * See `PlayScrollRecord`'s `selectMode`. Daily Challenge, Invite and Practice
 * commit nothing at all: none of them queues, so none of them needs the
 * account's stored role to be anything in particular.
 *
 * THERE IS NO "NO ROLE CHOSEN" STATE. An account that has never picked opens
 * on the first canonical role rather than on an empty header with an
 * instruction to go elsewhere. Nothing is persisted by that — it is a preview
 * like any other — and the player can act immediately instead of being sent
 * back to the lobby to satisfy the record.
 *
 * THE MASCOT IS THE PROJECT'S MASCOT. `RoleMascot` owns the idle float, the
 * plate-direction correction and the `interactive` click reaction, including
 * its playback token for repeated poking and its reduced-motion drop. Nothing
 * about that behaviour is re-implemented or configured here.
 */

import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RoleMascot } from "@/components/mascot/RoleMascot";
import RankEmblem from "@/components/ranked/RankEmblem";
import {
  RANKED_ROLES,
  RANKED_ROLE_LABELS,
  type RankedRole,
} from "@/lib/ranked-public/roles";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";
import { PLAY_INK as INK } from "./ink";

/**
 * The role a record with no stored preference opens on.
 *
 * The head of the canonical order, which is the same order the lobby's ring
 * turns in — so "one step right" means the same thing on both surfaces.
 */
export const DEFAULT_PREVIEW_ROLE: RankedRole = RANKED_ROLES[0];

/** Step through the canonical order, wrapping — as the lobby's ring does. */
export function stepRole(current: RankedRole, delta: number): RankedRole {
  const at = RANKED_ROLES.indexOf(current);
  const from = at === -1 ? 0 : at;
  const length = RANKED_ROLES.length;
  return RANKED_ROLES[(from + delta + length) % length];
}

export default function PlayScrollRoleSelector({
  role,
  onStep,
  progression = null,
  disabled = false,
}: {
  /** The role being previewed. Never null — see the header. */
  role: RankedRole;
  /** Move the preview. LOCAL ONLY; the host writes nothing here. */
  onStep: (next: RankedRole) => void;
  progression?: RankedProgressionView | null;
  /** Held still while the record is committing or a queue entry is live. */
  disabled?: boolean;
}) {
  const tier = progression?.tier ?? null;
  const back = useCallback(() => onStep(stepRole(role, -1)), [role, onStep]);
  const forward = useCallback(() => onStep(stepRole(role, 1)), [role, onStep]);

  return (
    <div
      data-testid="play-scroll-role-banner"
      data-role={role}
      className="play-scroll-banner"
    >
      {/* The stepper. One figure, an arrow either side, the name under it —
          a compact centrepiece rather than two anchors pushed to the margins. */}
      <div className="play-scroll-stepper">
        <button
          type="button"
          data-testid="play-scroll-role-prev"
          onClick={back}
          disabled={disabled}
          className="play-scroll-arrow"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          {/* The name is the useful half: "Previous role" alone makes a screen
              reader user step blind to hear where they landed. */}
          <span className="sr-only">
            Previous role — {RANKED_ROLE_LABELS[stepRole(role, -1)]}
          </span>
        </button>

        <div className="play-scroll-stepper__figure">
          {/* Decorative and pokeable: the role's name is written directly
              beneath it, so the art carries no identity of its own. */}
          <RoleMascot
            role={role}
            /* Faces the reader rather than one arrow or the other — this is a
               stepper, and a mascot turned toward "next" would read as a
               nudge in that direction. The component reconciles the artwork's
               own direction, so `mid` (drawn leading left) is not mirrored. */
            facing="right"
            /*
             * `cover`, so the CHARACTER is what gets big rather than the box.
             *
             * The five plates are 2:3 with a lot of transparent head and foot
             * room, so a square `contain` box spends most of its height on
             * nothing — a 148px box drew a figure the size of a 90px one and
             * cost the sheet 148px of a head that also has to hold a title, a
             * name, a crest, three clauses and a footer. `cover` crops that
             * empty room (vertically only — the source is taller than every
             * box a host gives it, so nothing is cut off the side), which is
             * what the fit exists for. Same trick the arena panels use.
             */
            fit="cover"
            interactive
            loading="eager"
            className="play-scroll-banner__figure"
            data-testid="play-scroll-mascot"
          />
        </div>

        <button
          type="button"
          data-testid="play-scroll-role-next"
          onClick={forward}
          disabled={disabled}
          className="play-scroll-arrow"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">
            Next role — {RANKED_ROLE_LABELS[stepRole(role, 1)]}
          </span>
        </button>
      </div>

      {/* The name, and the standing beside it. `aria-live` so stepping the
          arrows is announced: the mascot changing is invisible to a screen
          reader, and the label under it is the only thing that moved. */}
      <div className="play-scroll-banner__name">
        <p
          data-testid="play-scroll-role-name"
          className="play-scroll-banner__role"
          style={{ color: INK.strong, textShadow: INK.press }}
          aria-live="polite"
        >
          {RANKED_ROLE_LABELS[role]}
        </p>
        {tier !== null && (
          <RankEmblem
            tier={tier}
            earned={progression?.rated ?? false}
            /* `hero` is the ART size — the small emblem set is the incomplete
               one — and the band sizes that box down in CSS. `standard`
               emphasis holds the light back: a fully ceremonial crest here
               would outrank the three clauses it sits above.

               It carries NO caption. The crest is the standing; the tier's
               WORD is written on the Ranked clause below, in that tier's own
               metal, which is where a player is deciding whether to queue. */
            variant="hero"
            emphasis="standard"
            decorative
            className="play-scroll-banner__standing"
          />
        )}
      </div>
    </div>
  );
}
