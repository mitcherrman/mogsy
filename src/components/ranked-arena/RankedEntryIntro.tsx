/**
 * RFX1 Phase 2B2 — THE VISIBLE ENTRY INTRO.
 * RFX1 Phase 2B3 visual implementation — THE MAJOR OPENING BEAT.
 *
 * What the player sees between "opponent found" and their first question:
 * the duel, named. It replaces the one-line "Entering the arena…" placeholder
 * that Phase 2B1 held up while Round 1's media prepared — same slot, same
 * shell — so nothing about the arena's chrome moves when it appears or goes.
 *
 * IT BUYS NO TIME OF ITS OWN.
 * ──────────────────────────
 * Round 1's `started_at` is the SERVER's, written once inside the match
 * creation transaction. This component occupies part of a period that already
 * existed and that the player previously spent looking at a locked question.
 * It cannot extend the start, cannot delay input, and is off screen by
 * `started_at − ENTRY_MIN_LEAD_MS` — see `entryIntroExitAt`, which is where
 * the decision actually lives. Nothing here holds anything.
 *
 * IT IS A DUEL CARD, NOT A LOADING SCREEN (2B3).
 * ─────────────────────────────────────────────
 * The 2B2 card led with a 10px eyebrow and closed with a status sentence
 * about the client ("Preparing the first question…"), inside the same
 * `.ranked-panel` chrome the question card uses — the minor beat's dressing
 * on the major beat. The approved 2B3 design inverts that: the TITLE is the
 * dominant element, the composition is `[mascot] identity VS identity
 * [mascot]` on a shared centre axis, and the secondary line is real match
 * data (`ROUND 1 OF {matchLength}`) rather than client state.
 *
 * Loading still happens underneath, unchanged: `useEntryPreparation` keeps
 * the card up while Round 1's critical media decodes. The only state sentence
 * that survives is the one for `match-unresolved`, where the card genuinely
 * has no names to show yet — and it is a quiet line under the board, never
 * the primary content.
 *
 * IDENTITY IS WHATEVER THE MATCH ACTUALLY PUBLISHES.
 * ─────────────────────────────────────────────────
 * The viewer's own display name comes from the page; the opponent's is
 * `opponentLabelFor` — "Opponent", or "Bot" on a bot match — because the live
 * Ranked projection redacts participant names by design
 * (`ranked_public/identity_redaction.py`). Nothing is invented here and
 * nothing is waited for: a seat whose role the match has not frozen draws the
 * same neutral crest the arena rails draw. No stats, no rank, no record — the
 * beat is orientation and anticipation, not a profile screen.
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
  /**
   * RFX1 2B3 — the match's own module count, for the secondary line. Null on
   * an hp match and on any deployment predating RP1, which cannot say how
   * long the match is; the line is then OMITTED rather than guessed.
   */
  matchLength?: number | null;
  /**
   * RFX1 2B3 — how long this card is on course to be VISIBLE for, from its
   * own first paint. MEASUREMENT ONLY: it is published as `data-intro-ms` and
   * changes nothing that is drawn.
   */
  visibleMs?: number | null;
}

/**
 * The only state sentence that survives the 2B3 redesign, and it is shown for
 * ONE phase: before the first snapshot, when the card has no names to print.
 * `preparing` and `ready` say nothing — the board is already complete and a
 * line about the client would be the loading language the beat exists to
 * remove. Returns null for every other phase.
 */
export function entryIntroStatus(phase: RankedEntryPhase): string | null {
  return phase === "match-unresolved" ? "Seating the duelists…" : null;
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
            // RFX1 2B2 — 80-160 CSS px here; the 384px encode covers 2x and
            // is the same derivative the arena rails already preloaded.
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
          is never communicated by mascot alone, so the label ships with it.
          The name truncates rather than wraps — a long display name must not
          be able to push the VS off the card's centre line (the board is a
          three-track grid with a fixed centre for the same reason). */}
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
  matchLength = null, visibleMs = null,
}: RankedEntryIntroProps) {
  const status = entryIntroStatus(phase);
  return (
    <section
      data-testid="ranked-entry-intro"
      // The same two attributes the live arena publishes, so a test and a
      // browser can read the entry state off the DOM without reading copy.
      data-entry-phase={phase}
      // RFX1 2B3 — the VISIBLE intro duration this entry is on course for,
      // measured from this card's real first paint. Published so a test and a
      // browser read the contract's own number off the DOM instead of
      // inferring it from two observations.
      data-intro-ms={visibleMs === null ? undefined : String(Math.round(visibleMs))}
      data-reduced-motion={reducedMotion ? "true" : undefined}
      data-bot-match={isBotMatch ? "true" : undefined}
      // RFX1 2B3 — the shared beat vocabulary. `--major` is the intensity
      // class the outro also carries; the scrim, the title scale and the gold
      // rules all come from it, so the two major beats cannot drift apart.
      className="ranked-beat ranked-beat--major ranked-entry-intro">
      {/* The scrim deepens the academy backdrop the page already paints, so
          the chamber reads as DEPTH behind the beat rather than as an empty
          room beside a small card. Background only; it never takes a click. */}
      <span aria-hidden className="ranked-beat__scrim" />
      <div className="ranked-beat__inner">
        {/* THE TITLE IS THE BEAT. A bot match says so here rather than
            pretending to be a ladder match; it is the same honesty
            `opponentLabelFor` applies to the opponent's name below. */}
        <h2 className="ranked-title ranked-beat__title"
          data-testid="entry-intro-title">
          {isBotMatch ? "Academy Duel" : "Ranked Duel"}
        </h2>
        <span aria-hidden className="ranked-beat__rule" />
        <div className="ranked-entry-intro__board">
          <Seat duelist={player} side="player" />
          <span aria-hidden className="ranked-entry-intro__versus">
            <span className="ranked-entry-intro__versus-word">VS</span>
          </span>
          <Seat duelist={opponent} side="opponent" />
        </div>
        {/* REAL MATCH DATA, or nothing. An hp match and any deployment
            predating RP1 carry a null `matchLength` and cannot say how long
            the match is; the line is omitted rather than guessed. */}
        {matchLength !== null && matchLength > 0 && (
          <p className="ranked-beat__meta" data-testid="entry-intro-round">
            Round 1 of {matchLength}
          </p>
        )}
        {/* The ONE surviving state sentence, and only before the first
            snapshot. Announced, because it is the only thing on the card that
            changes while it is up and the only thing a screen reader needs
            from it. */}
        {status !== null && (
          <p className="ranked-entry-intro__status" role="status"
            data-testid="entry-intro-status">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}
