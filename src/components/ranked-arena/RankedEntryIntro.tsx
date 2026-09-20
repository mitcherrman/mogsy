/**
 * RFX1 Phase 2B2 — THE VISIBLE ENTRY INTRO.
 *
 * What the player sees between "opponent found" and their first question:
 * the duel, named. It replaces the one-line "Entering the arena…" placeholder
 * that Phase 2B1 held up while Round 1's media prepared — same slot, same
 * geometry, same shell — so nothing about the arena's layout, its scroll or
 * its chrome moves when it appears or when it goes.
 *
 * IT BUYS NO TIME OF ITS OWN.
 * ──────────────────────────
 * Round 1's `started_at` is the SERVER's, written once inside the match
 * creation transaction (`ranked_public/pacing.entry_lead_ms`: 4200 ms on the
 * queue path, 2200 ms on the bot path). This component occupies part of a
 * period that already existed and that the player previously spent looking at
 * a locked question. It cannot extend the start, cannot delay input, and is
 * off screen by `started_at − ENTRY_MIN_LEAD_MS` — see `entryIntroExitAt`,
 * which is where the decision actually lives. Nothing here holds anything.
 *
 * IT IS A VIEW OF REAL PREPARATION, NOT A LOADING ANIMATION.
 * ─────────────────────────────────────────────────────────
 * `phase` is the arena's own `view.entryPhase` (`projectEntryPhase`), which is
 * derived from whether a snapshot exists and whether the round's critical
 * media is still in flight. There is no second clock, no fake progress and no
 * percentage: a percentage would have to be invented, because `prepareImage`
 * settles per URL and a byte count is not available to it.
 *
 * IDENTITY IS WHATEVER THE MATCH ACTUALLY PUBLISHES.
 * ─────────────────────────────────────────────────
 * The viewer's own display name comes from the page; the opponent's is
 * `opponentLabelFor` — "Opponent", or "Bot" on a bot match — because the live
 * Ranked projection redacts participant names by design
 * (`ranked_public/identity_redaction.py`). Nothing is invented here and
 * nothing is waited for: a seat whose role the match has not frozen draws the
 * same neutral crest the arena rails draw.
 */
import { NeutralSigil, roleIdentityFor } from "./roleIdentity";
import { RoleMascot } from "@/components/mascot/RoleMascot";
import type { RankedEntryPhase } from "@/lib/ranked-core/media/useRankedMediaPreparation";

/** One seat of the card. `name` is already the label the arena would print. */
export interface EntryIntroDuelist {
  name: string;
  /** The role the MATCH froze, or null (a bot, a staff seat, a legacy match). */
  roleId?: string | null;
}

export interface RankedEntryIntroProps {
  phase: RankedEntryPhase;
  /** The viewer. Null until the first snapshot names the seats. */
  player?: EntryIntroDuelist | null;
  opponent?: EntryIntroDuelist | null;
  /** A bot match calls itself an Academy Duel; a queue match a Ranked Duel. */
  isBotMatch?: boolean;
  /** OS `prefers-reduced-motion` or Settings → Reduce Motion. */
  reducedMotion?: boolean;
}

/**
 * The status line. Plain language about the MATCH, never about the client:
 * the player is told what is happening to their duel, not which request is
 * outstanding. `live` cannot normally be seen (the intro is gone by then) and
 * reads as the last beat rather than as an error.
 */
function statusFor(phase: RankedEntryPhase): string {
  switch (phase) {
    case "match-unresolved": return "Seating the duelists…";
    case "preparing": return "Preparing the first question…";
    default: return "Take your mark.";
  }
}

function Seat({ duelist, side }: {
  duelist: EntryIntroDuelist | null | undefined;
  side: "player" | "opponent";
}) {
  const identity = roleIdentityFor(duelist?.roleId);
  const mirrored = side === "opponent";
  return (
    <div className="ranked-entry-intro__seat" data-side={side}
      data-role={identity.role ?? "none"}
      data-testid={`entry-intro-seat-${side}`}>
      {/* Seating glow in the seat's own accent, exactly as the arena rails and
          the result duel draw it — a background only, so it never moves. */}
      <span aria-hidden className="ranked-entry-intro__glow"
        style={{ backgroundImage:
          `radial-gradient(60% 55% at 50% 64%, ${identity.accentSoft}, transparent 74%)` }} />
      <span className="ranked-entry-intro__figure">
        {identity.role !== null ? (
          <RoleMascot
            role={identity.role}
            // Both seats look at the centre of the card, the same statement
            // the arena's two columns make.
            facing={mirrored ? "left" : "right"}
            // RFX1 2B2 — 64-136 CSS px here; the 384px encode covers 3x.
            art="compact"
            fit="cover"
            // Above the fold and inside the entry window by construction.
            loading="eager"
            className="h-full w-full"
            data-testid={`entry-intro-mascot-${side}`} />
        ) : (
          <span data-testid={`entry-intro-neutral-${side}`}
            className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed"
            style={{ color: identity.accent, borderColor: `${identity.accent}55` }}>
            <span className="h-1/2 w-1/2 opacity-80"><NeutralSigil /></span>
          </span>
        )}
      </span>
      {/* THE NAME AND THE ROLE ARE BOTH WRITTEN. The LC1 art contract: a role
          is never communicated by mascot alone, so the label ships with it. */}
      <p className="ranked-entry-intro__name" data-testid={`entry-intro-name-${side}`}>
        {duelist?.name ?? (side === "player" ? "You" : "Opponent")}
      </p>
      <p className="ranked-entry-intro__role" style={{ color: identity.accent }}
        data-testid={`entry-intro-role-${side}`}>
        {identity.label}
      </p>
    </div>
  );
}

export function RankedEntryIntro({
  phase, player = null, opponent = null, isBotMatch = false, reducedMotion = false,
}: RankedEntryIntroProps) {
  return (
    <section
      data-testid="ranked-entry-intro"
      // The same two attributes the live arena publishes, so a test and a
      // browser can read the entry state off the DOM without reading copy.
      data-entry-phase={phase}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      data-bot-match={isBotMatch ? "true" : undefined}
      className="ranked-panel ranked-entry-intro">
      <div className="ranked-eyebrow ranked-eyebrow--cyan ranked-entry-intro__eyebrow">
        {/* A bot match says so here rather than pretending to be a ladder
            match; it is the same honesty `opponentLabelFor` applies below. */}
        {isBotMatch ? "Academy Duel" : "Ranked Duel"}
      </div>
      <div className="ranked-entry-intro__board">
        <Seat duelist={player} side="player" />
        <span aria-hidden className="ranked-entry-intro__versus">VS</span>
        <Seat duelist={opponent} side="opponent" />
      </div>
      {/* One polite line, announced: the only thing on the card that changes
          while it is up, and the only thing a screen reader needs from it. */}
      <p className="ranked-entry-intro__status" role="status"
        data-testid="entry-intro-status">
        {statusFor(phase)}
      </p>
    </section>
  );
}
