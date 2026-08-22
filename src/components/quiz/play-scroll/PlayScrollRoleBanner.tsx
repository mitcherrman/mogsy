/**
 * PLAY1 — the role, carried forward.
 *
 * The player already chose a role on the lobby's LEFT parchment. Opening the
 * match-entry record must not ask again, and must not look like a fresh
 * screen that happens to know the answer: this band is the left scroll's own
 * subject, transcribed onto the record as the line that says who is entering.
 *
 * TWO ANCHORS AND A NAME
 * ──────────────────────
 * The band is now three things and nothing else:
 *
 *     [ the role's mascot ]   Entering as / ROLE   [ the Ranked emblem ]
 *
 * Both anchors are large on purpose. This is the one band on the record that
 * says WHO is entering and WHERE, and it used to say it five times over — the
 * role name, the words "Ranked Silver" beside it, a tier caption under the
 * emblem, the emblem itself, and an unlabelled champion portrait at the edge.
 * Four of those were the same two facts. What is gone:
 *
 *   the "· Ranked Silver" line   the emblem is the standing, and the tier is
 *                                a picture the player already recognises.
 *   the SILVER caption           same fact, third printing.
 *   the champion coin            a bare portrait with no adjacent word. A
 *                                player cannot tell whether that is their
 *                                opponent, their avatar or a decoration, and
 *                                an image nobody can name is not identity.
 *
 * What is left got the room: the mascot is roughly TWICE the height it was
 * and the emblem about three times its old box, so the band reads as an
 * icon-and-name plate rather than as a row of small furniture.
 *
 * THE MASCOT IS THE PROJECT'S MASCOT, NOT A NEW ONE
 * ─────────────────────────────────────────────────
 * It was a bare `<img>`. It is now `RoleMascot`, the AI1 component that
 * already owns every mascot's motion language across Mogzy — the idle float,
 * the plate-direction correction (four of the five plates lead right, `mid`
 * leads left), and the `interactive` click reaction. Nothing about that
 * behaviour is re-implemented here, and nothing about it is configured here
 * beyond naming the intent.
 *
 * `interactive` is a TOY and is built to stay one: the component exposes no
 * `onClick` to a host at all, so a mascot reaction can never become a
 * navigation, a selection, a queue write or a request. It drops the reaction
 * outright under `prefers-reduced-motion`, and its playback token makes
 * repeated poking safe — a second click restarts the keyframes cleanly
 * instead of being swallowed by the first one's late `animationcancel`.
 *
 * It also stays a plain `<span>` with no `role`, no `tabIndex` and no
 * accessible name, which is the AI1 contract and is the right answer here:
 * the reaction carries no information, changes nothing, and leads nowhere, so
 * a keyboard user loses nothing by it not being a stop in the tab order, and
 * an announced control that does nothing would be worse than none.
 *
 * PRESENTATION ONLY. Nothing here writes a role, and there is no control to
 * change one — changing a role is the lobby's job and stays on the lobby.
 * When the account has no role yet, the band says so plainly and the Ranked
 * clause is the thing that refuses, not this.
 */

import { RoleMascot } from "@/components/mascot/RoleMascot";
import RankEmblem from "@/components/ranked/RankEmblem";
import { RANKED_ROLE_LABELS, type RankedRole } from "@/lib/ranked-public/roles";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";
import { PLAY_INK as INK } from "./ink";

export default function PlayScrollRoleBanner({
  role,
  progression = null,
}: {
  role: RankedRole | null;
  progression?: RankedProgressionView | null;
}) {
  const tier = progression?.tier ?? null;

  return (
    <div
      data-testid="play-scroll-role-banner"
      data-role={role ?? "none"}
      className="play-scroll-banner flex items-center gap-3"
    >
      {/* The figure. Decorative — the role's name is written beside it — and
          pokeable, which is the whole of what the click does. */}
      {role !== null && (
        <RoleMascot
          role={role}
          /* Turned toward the name and the entries it is about to choose
             between. The component reconciles the artwork's own direction, so
             `mid` (drawn leading left) does not end up mirrored here. */
          facing="right"
          interactive
          loading="eager"
          className="play-scroll-banner__figure"
          data-testid="play-scroll-mascot"
        />
      )}

      {/* The name, between the two anchors. Centred rather than hugging the
          mascot: the band is a title plate — figure, name, crest — and a
          left-set name left a hole between it and the emblem. */}
      <div className="play-scroll-banner__name min-w-0 flex-1">
        <p
          className="text-[9.5px] font-bold uppercase tracking-[0.24em]"
          style={{ color: INK.faint }}
        >
          Entering as
        </p>
        <p
          data-testid="play-scroll-role-name"
          className="play-scroll-banner__role"
          style={{ color: INK.strong, textShadow: INK.press }}
        >
          {role === null ? "No role chosen" : RANKED_ROLE_LABELS[role]}
        </p>
        {/* The one remaining line, and it is an INSTRUCTION rather than a
            restatement: it exists only when there is no role to draw, which
            is the case where the band has nothing else to say. */}
        {role === null && (
          <p
            className="mt-0.5 text-[11px] font-semibold leading-tight"
            style={{ color: INK.body }}
          >
            Choose a role on the lobby's role scroll to enter Ranked.
          </p>
        )}
      </div>

      {/* The standing. Named nowhere on this band on purpose — the tier's
          WORD is written on the Ranked clause below, in that tier's own
          metal, which is where a player is deciding whether to queue. */}
      {tier !== null && (
        <RankEmblem
          tier={tier}
          earned={progression?.rated ?? false}
          /* `hero` is the ART SIZE. `standard` emphasis holds the light back:
             this is a band on a record, not the lobby's ceremonial centre,
             and a fully ceremonial crest here would outrank the three clauses
             it sits above. Two axes, exactly as RankEmblem documents. */
          variant="hero"
          emphasis="standard"
          decorative
          /* `hero` also selects the LARGE art — the small emblem set is the
             incomplete one — so the variant is chosen for the artwork and the
             band then sizes it down from hero's own 8rem box. The override
             needs `.lc-emblem.play-scroll-banner__standing` to outrank
             `[data-variant]`; see the banner block in index.css.

             No `data-testid`: RankEmblem takes none, and wrapping it in a
             span purely to carry one would add a box to fight over the size
             with. `data-tier` / `data-baseline` is the contract every other
             Ranked test already reads. */
          className="play-scroll-banner__standing"
        />
      )}
    </div>
  );
}
