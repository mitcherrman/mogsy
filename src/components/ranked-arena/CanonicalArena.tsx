/**
 * THE CANONICAL ARENA — the production Ranked renderer, extracted.
 *
 * Every comment and every element below arrived here from `QuizRankedMatch`.
 * Nothing was rewritten "to be generic": this IS the arena Ranked has been
 * shipping, reading a projected view model instead of reaching into the Ranked
 * match controller. That is the whole of the change, and it is why the DOM,
 * the classes and the geometry are unchanged.
 *
 * WHAT IT OWNS
 * ────────────
 * The shell and its styling context, the header strip and its result plate,
 * the transcript disclosure, the three-column geometry, both flanks, the
 * centre question stage, the ability hotbar, the status line, the round
 * timeline, and the terminal frame.
 *
 * WHAT IT MUST NEVER OWN
 * ──────────────────────
 * How any of that was obtained. There is no fetch here, no poll, no deadline
 * arithmetic, no correctness, no matchmaking, no rating, no settlement. A mode
 * projects `ArenaViewModel` and the arena draws it; the arena cannot tell
 * which mode produced one, and adding a branch that could would be the
 * beginning of the fork this file exists to prevent.
 */
import { useMemo, useState } from "react";
import { AbilityTray } from "./AbilityTray";
import { ArenaShell } from "./ArenaShell";
import { CombatantPanel } from "./CombatantPanel";
import { MobileBottomBar } from "./MobileBottomBar";
import { MobileMatchBar } from "./MobileMatchBar";
import { MatchOverFrame } from "./MatchOverFrame";
import { RevealPanel } from "./RevealPanel";
import { RoundTimeline } from "./RoundTimeline";
import { SegmentResultBeat } from "./SegmentResultBeat";
import { SegmentTranscript } from "./SegmentTranscript";
import { CardResultBeat } from "./CardResultBeat";
import { CentralStage } from "./CentralStage";
import { RoundResultBeat } from "./RoundResultBeat";
import { QuestionResultOverlay } from "./QuestionResultOverlay";
import { arenaReportSnapshot } from "@/lib/ranked-core/reportSnapshot";
import { usePublishReportableQuestion } from "@/lib/feedback/reportable-question";
import type {
  ArenaRail, ArenaTerminalView, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type { ReactNode } from "react";

export interface CanonicalArenaProps {
  /** The live arena, or null while the mode has nothing to draw yet. */
  view: ArenaViewModel | null;
  /** The terminal frame. Takes precedence over `view` when present. */
  terminal?: ArenaTerminalView | null;
  /** Chrome above the arena — a title row, a way back. */
  chrome?: ReactNode;
  /**
   * A SCRIPTED MODE'S GUIDANCE — the overlay seam (ARENA1 Step 4 §6).
   *
   * A scripted mode is the caller this exists for, and it is deliberately a
   * slot rather than an API: the arena must never learn what an instruction
   * panel, a scripted callout or a step of a script IS, or the fork this file
   * exists to prevent starts here instead of in a second renderer.
   *
   * It is rendered in the arena's FOCAL region on both exit paths — the foot
   * of the centre column while a match is live, and under the terminal frame
   * once it is over — so the node sits with the thing it is about, and the
   * mode never has to reproduce the arena around it to place it. Ranked
   * supplies none, and renders exactly the DOM it always has.
   */
  guidance?: ReactNode;
  /**
   * RFX1 2B3 — THE OUTRO SEAM. A node the mode lays OVER the arena while the
   * match is authoritatively over but still being PRESENTED, before its end
   * screen mounts.
   *
   * 2B3 visual implementation: this was a focus-COLUMN slot, and at every
   * viewport that put the closing beat in the lowest, darkest strip of the
   * layout (measured `top: 708` of 900 on desktop, `top: 728` of 853 on a
   * phone), rendered quieter than the question above it. It shares the
   * `warning` overlay layer now — same `pointer-events-none` rule, so it can
   * never be the thing that stops a click; input is already closed.
   *
   * Still a slot: the arena never learns what a duel's ending IS, only that a
   * mode had something to say in that window. Optional, so every existing
   * caller — the Daily, the staff duel, every dev harness — is byte-identical.
   */
  outro?: ReactNode;
  /**
   * RFX1 2B3 — THE WARNING SEAM. A node the mode lays OVER the arena while a
   * medium presentation beat is playing (Ranked: Final Round). An overlay
   * layer rather than a column slot, because the beat is conceptually a
   * popup and the eventual design must not be boxed into the question
   * column — but it is `pointer-events-none`, so it can never be the thing
   * that stops a click. Input is already closed by `started_at`.
   *
   * Optional, so every existing caller is byte-identical.
   */
  warning?: ReactNode;
  /** Copy for the null-view placeholder, which is a mode's own sentence. */
  recovering?: {
    eyebrow: string;
    message: string;
    /** RFX1 2B1 — which entry stage this placeholder stands in for (2B2 reads it). */
    phase?: "match-unresolved" | "preparing";
    /**
     * RFX1 2B2 — a mode's own ENTRY PRESENTATION, drawn in the placeholder's
     * slot instead of the sentence.
     *
     * A slot, deliberately, and for the same reason `guidance` is one: the
     * arena must not learn what a duel card, a VS treatment or an entry
     * animation IS. Ranked supplies `RankedEntryIntro`; the Daily and every
     * dev harness supply nothing and get the sentence they always got. The
     * `message` stays REQUIRED so a mode always has a fallback and so this
     * can never become the only way to fill the slot.
     */
    intro?: ReactNode;
  };
}

/** One flank. Ranked fills both with a duelist; a mode may supply a panel. */
function Rail({ rail, progressionEnabled }:
{ rail: ArenaRail; progressionEnabled: boolean }) {
  if (rail.kind === "panel") return <>{rail.node}</>;
  return (
    <CombatantPanel combatant={rail.combatant}
      progressionEnabled={progressionEnabled}
      // Relayed, never chosen: absent leaves the arena drawing the card it
      // always drew, which is what the Daily and every dev harness still get.
      presentation={rail.presentation}
      // RM1 Pass 2B — relayed, like the presentation above. A mode that
      // supplies no award draws no payout at all.
      award={rail.award}
      damage={rail.damage}
      outcome={rail.outcome}
      damageDealt={rail.damageDealt}
      feedback={rail.feedback ?? null}
      reaction={rail.reaction}
      // RD1 — relayed like everything above; absent draws the gold tally.
      standing={rail.standing ?? null}
      leadPulseId={rail.leadPulseId ?? null} />
  );
}

export function CanonicalArena({
  view, terminal = null, chrome, recovering, guidance, outro, warning,
}: CanonicalArenaProps) {
  /**
   * The Meta Reflex transcript's disclosure, owned HERE rather than by the
   * beat that offers the control.
   *
   * The transcript is a per-challenge table and cannot live inside the result
   * plate: the header strip is a `.ranked-panel`, which is `overflow: hidden`,
   * so anything hung off the plate is clipped by its own strip. It is rendered
   * against the SHELL instead, absolutely positioned under the header, which
   * is why the state lives at this level.
   */
  const [detailsOpen, setDetailsOpen] = useState(false);
  // A NEW block always starts with its transcript collapsed. Render-time
  // reset, no effect tick. Keyed on the SEGMENT settlement alone: an ordinary
  // round has no transcript, and keying on it too would close the disclosure
  // every time a quiz round settled underneath an open one.
  const segmentSettlement = view?.segmentBeat ?? null;
  const [seenSegment, setSeenSegment] = useState(segmentSettlement?.settlement ?? null);
  if (seenSegment !== (segmentSettlement?.settlement ?? null)) {
    setSeenSegment(segmentSettlement?.settlement ?? null);
    setDetailsOpen(false);
  }

  /**
   * FB1-4 — publish the round for the question reporter.
   *
   * Above the early returns because hooks must be, and gated on `!terminal`
   * because a match-over frame has no live question to report — the reporter
   * disappears with the arena rather than lingering over a results screen.
   *
   * This is where both Ranked and Daily Challenge get the feature: they are
   * the two callers of this component, and neither had to be touched beyond
   * naming itself in `view.report`. Publishing costs the arena no re-render —
   * the store the snapshot lands in is subscribed to only by the report
   * control (see reportable-question.tsx).
   */
  const reportSnapshot = useMemo(() => {
    if (terminal || !view?.report) return null;
    return arenaReportSnapshot({
      identity: view.report,
      publicRound: view.surface.publicRound,
      selection: view.surface.selection,
      reveal: view.surface.reveal,
    });
  }, [terminal, view?.report, view?.surface.publicRound, view?.surface.selection,
      view?.surface.reveal]);
  usePublishReportableQuestion(reportSnapshot);

  if (terminal) {
    // Ordinary flow, like the live arena: the terminal frame and the final
    // reveal are free to be taller than the viewport and the DOCUMENT scrolls
    // them. This used to carry its own `lg:overflow-y-auto` game-viewport
    // containment, which is exactly the nested scrollbar 1.5 removed.
    return (
      <ArenaShell size="wide" header={chrome}>
        <div className="ranked-shell flex flex-col gap-4" data-testid="ranked-match-over">
          <MatchOverFrame result={terminal.result} player={terminal.player}
            opponent={terminal.opponent}
            eyebrow={terminal.eyebrow}
            heading={terminal.heading}
            subheading={terminal.subheading}
            scoreline={terminal.scoreline}
            identity={terminal.identity}
            density={terminal.density}
            summary={terminal.summary}
            progressionEnabled={terminal.progressionEnabled}
            primaryAction={terminal.primaryAction}
            secondaryAction={terminal.secondaryAction} />
          {terminal.reveal && (
            <RevealPanel settlement={terminal.reveal.settlement}
              viewerSlot={terminal.reveal.viewerSlot}
              namesByPlayerId={terminal.reveal.namesByPlayerId}
              showAbilities={terminal.reveal.showAbilities} />
          )}
          {guidance}
        </div>
      </ArenaShell>
    );
  }

  if (!view) {
    return (
      <ArenaShell size="wide" header={chrome}>
        <section data-testid="ranked-recovering" className="ranked-shell"
          data-entry-phase={recovering?.phase}>
          {recovering?.intro ?? (
            <div className="ranked-panel p-6 text-center space-y-1">
              <div className="ranked-eyebrow ranked-eyebrow--cyan">
                {recovering?.eyebrow ?? "Ranked Duel"}
              </div>
              <p className="text-sm text-muted-foreground">
                {recovering?.message ?? "Recovering match…"}
              </p>
            </div>
          )}
        </section>
      </ArenaShell>
    );
  }

  const { header, surface, abilityHud, status, hudAction, timeline } = view;
  // Capitalised local: a JSX tag cannot carry a non-null assertion, and the
  // module's viewport is the one element here whose TYPE comes from the mode.
  const Viewport = surface.renderer?.Viewport ?? null;
  const hasSurface = Viewport !== null && surface.hasContent;
  // RMOB1 — the phone strip replaces the flanks only when BOTH are Ranked duel
  // banners; a card flank (Daily, staff duel) or a mode panel is left alone.
  const mobileDuel = [view.left, view.right].every((r) =>
    r.kind === "combatant" && r.presentation === "banner");

  /**
   * THE BOTTOM OF THE ARENA IS NOT A RESULT SURFACE — for ANY active state.
   *
   * There is no result panel down there any more, and there is no longer an
   * exception. `RevealBanner` went first (it flashed for the ~1.5s settlement
   * beat of every ordinary round); `SegmentResultBanner` followed, for the
   * same reason applied honestly: a Meta Reflex block settling once every five
   * rounds still put a full-width bar in the region the round timeline needs
   * to hold continuously. "Rarely" is not "never", and the invariant is never.
   *
   * Both results resolve in the TOP strip, in one shared plate:
   *   * an ordinary round → `RoundResultBeat`
   *   * a card of a block in flight → `CardResultBeat`
   *   * a settled block → `SegmentResultBeat`, whose vocabulary is extended
   *     exactly far enough to carry the one thing a round cannot say — each
   *     player's N/5 — and no further.
   *
   * RM1 Pass 2B DEMOTED that plate rather than replacing it, and the
   * distinction is worth stating because it looks like duplication and is not.
   * The plate PERSISTS after its beat, deliberately (POINT1): it is the
   * previous-module summary, and a player who looked away still reads what the
   * last module was worth. The header's new focal display is the other half of
   * the pair — the loud, MOMENTARY headline, which hands the centre back to
   * the clock so the next module can start. Two lifetimes, two weights, one
   * fact; and only one of them is still on screen a second later.
   *
   * Settlement feedback for an ordinary round is otherwise carried, in full, by
   * the answer tablets' reveal, each duelist column's verdict row and module
   * history, and the transient award that rises through the column that won
   * it. `RevealBanner` survives as the arena inspector's fixture; the segment
   * banner had no other caller and is deleted outright.
   */
  return (
    <ArenaShell size="wide" header={chrome} phoneArena={mobileDuel}>
    {/* RG1 — THE STABLE SHELL.
       The shell hands this element one region (see `ArenaShell`'s stage floor)
       and the four bands below divide it: the top strip, the arena grid, the
       HUD row and the timeline. Three of those are fixed chrome and sit at
       `shrink-0`; only the arena grid flexes, so every pixel the stage gains
       goes to the question and the flanks and nothing else moves. The strip's
       top, the rails' top, the HUD row and the timeline sit at fixed offsets
       for the life of the match, whatever the round is showing.

       `flex-1` and NOT `min-h-full`: a percentage minimum resolves against the
       region only while the region's height is definite, and measured live it
       simply did not — the shell stopped at its content height and left 220px
       of the reclaimed viewport empty under the timeline. Growing into the
       region is unconditional. And because `flex-basis: 0` leaves the
       automatic minimum size in force, content the viewport genuinely cannot
       seat still grows this column and scrolls the page, rather than being
       clipped or handed a scrollbar of its own.

       The gap is a step tighter from `lg` (12px -> 8px). Four bands means
       three gaps, and 12px of air between a strip and a grid is chrome — at
       three viewports it was 12px the question could have had.

       Below `lg` this is the ordinary flow column it has always been: the
       arena stacks there and its natural height exceeds any narrow viewport. */}
    <div className={`relative ranked-shell flex flex-col gap-3 lg:flex-1 lg:gap-1.5 lg:min-h-0 ${
      // RMOB2 — the phone arena hosts the dock tabs in its own bottom bar, so
      // it needs no clearance for them; other arenas keep RMOB1's.
      mobileDuel ? "" : "pb-[var(--mogzy-dock-clearance)] lg:pb-0"}`}
      data-testid="ranked-match"
      // RMOB2 — the phone one-screen composition keys off this (index.css).
      data-phone-arena={mobileDuel ? "true" : undefined} data-reveal-hold={view.revealHold ? "true" : "false"}
      // RFX1 2B1 — the presentation the arena is in, observable without
      // reading text: `module-intro` may never be up once input is open.
      data-presentation-phase={view.presentationPhase}
      data-entry-phase={view.entryPhase}
      // RFX1 2B3 — which MEDIUM beat is playing, if any. Observable without
      // reading copy, so the "no stacked intros" invariant is testable.
      data-special-transition={view.specialTransition ?? undefined}
      // THE ONE BAND THAT IS NOT ALWAYS THERE, stated rather than assumed.
      // `--ranked-chrome-h` has to know whether the ability dock is mounted,
      // and CSS cannot see a sibling. This is not a new fact and not a new
      // decision — it is the same `abilityHud` the HUD row below branches on,
      // published so the budget can read it. A budget that charged for a dock
      // a points match never mounts is most of why the shell still did not
      // fit at 1024.
      data-ability-dock={abilityHud ? "true" : "false"}>
      {/* The strip, plus the one thing that hangs BENEATH it.
          `.ranked-panel` is `overflow: hidden`, so the transcript cannot live
          inside the strip — it would be clipped by it. This wrapper is the
          anchor instead, and it is styleless apart from that, so the strip's
          own geometry is untouched. The inline z-index is deliberate:
          `.ranked-shell > *` pins every child to `z-index: 1`, and a class
          cannot outrank it, so an open transcript would paint under the arena.
          It is applied ONLY while open, so nothing about the resting page
          changes. */}
      <div className="relative lg:shrink-0" style={detailsOpen ? { zIndex: 30 } : undefined}>
      {/* RM1 Pass 2B — THE SIMPLIFIED HEADER: three zones, one focus.
          left · WHO AND WHAT  |  centre · THE DISPLAY  |  right · WHERE

          The strip used to run five things at one weight — eyebrow, round
          title, a result plate, two note lines and a clock — and the clock was
          the smallest of them. It is now the only large thing in the strip;
          everything else is a label around it.

          THE RESULT PLATE IS GONE from here for an ordinary round and for a
          card of a block. Its content — the verdict and the award — is what
          the centre now shows, and a plate beside a display saying the same
          thing is two answers to one question. That is POINT1's own rule about
          the strip's single result slot, applied to the slot that replaced it.

          `SegmentResultBeat` stays, demoted to the right, because it says one
          thing the centre cannot — a block's 5-card scoreline — and because it
          carries the transcript disclosure, which has no other home.

          `min-h` still reserves the tallest state, so nothing in the arena
          below moves when a face turns. */}
      <section data-testid="ranked-header"
        // REGISTERED TO THE ARENA, NOT MERELY DISTRIBUTED ACROSS IT.
        // The strip used to be `justify-between` over three flex children,
        // which spreads them to the strip's ends and puts nothing in
        // particular above anything in particular. The arena below is not
        // thirds — it is 23 / 54 / 23 — so "spread evenly" and "lines up with
        // the columns" were never going to be the same arrangement, and the
        // header read as floating over the board rather than belonging to it.
        //
        // From `lg` the strip is THE SAME GRID as the arena: the identical
        // track expression and the identical gap, so each zone sits in the
        // track its object occupies. The one thing that has to go with it is
        // the strip's own `px-4` — horizontal padding here would inset the
        // tracks relative to the arena's and put every zone a few pixels off
        // the thing it is supposed to be over. The zones are centred inside
        // their tracks instead, which is what keeps content off the edges.
        //
        // Below `lg` the arena stacks and there is nothing to register to, so
        // the wrapping flex row it has always been stays exactly as it was.
        // RMOB2 — on a phone Ranked arena the match bar carries the timer, so
        // this strip is desktop-only there.
        className={`ranked-panel ranked-header-plate flex min-h-[4.25rem] flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1 sm:gap-x-4 sm:px-4
          lg:grid lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)] lg:gap-3 lg:px-0
          min-[1500px]:gap-4${mobileDuel ? " max-lg:hidden" : ""}`}>
        {/* LEFT — who this is and what kind of match it is. Both quiet. */}
        {/* LEFT — the match's own hierarchy, three quiet lines.
            WHAT this is, WHO it is against, HOW FAR through it is. Each was
            already in the strip; what they lacked was an order. The mode's
            name used to carry the opponent on its back ("Ranked Duel · vs
            Bot"), the progress figure lived across the strip on the right with
            the word "Module" labelling a number whose position already says
            what it is, and between them sat "Opponent connected" — the one
            line in the header that was permanently true and therefore never
            news.

            Three lines at 10-11px cost less height than the two-line block
            they replace plus the plate they freed on the right, so the strip's
            reserved height is unchanged. */}
        {/* `justify-self-center` centres the BLOCK over the left Player
            Column; the lines inside it stay left-aligned to each other. */}
        <div className="flex min-w-0 flex-col justify-center gap-px lg:justify-self-center">
          {header.eyebrow && <div className="ranked-eyebrow">{header.eyebrow}</div>}
          {header.presenceNote && (
            <p data-testid="ranked-presence"
              className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              {header.presenceNote}
            </p>
          )}
          {header.title && (
            <p data-testid="ranked-header-title"
              className="truncate text-[11px] font-bold uppercase tracking-[0.16em]
                tabular-nums text-muted-foreground/90">
              {header.title}
              {/* RD1 — `· FINAL 3` / `· FINAL`, on the SAME line: the suffix
                  is a few characters of the line the block already reserves,
                  never a fourth row. */}
              {header.titleSuffix && (
                <span data-testid="ranked-header-final" className="ranked-duel-final">
                  {" · "}{header.titleSuffix}
                </span>
              )}
            </p>
          )}
        </div>

        {/* CENTRE — the display. `order` and not a grid: the strip wraps at
            narrow widths, and on a wrapped strip the display belongs on its
            own line between the two labels rather than squeezed beside one. */}
        {/* The centre track is the Question Stage's, so the display is over
            the board it times. `lg:flex-none` retires the flex-basis the old
            distributed row needed — a grid track owns the width now. */}
        <div className="flex w-auto flex-1 justify-center
          lg:order-none lg:w-full lg:flex-none lg:justify-self-center">
          {header.timer || header.centralResult ? (
            <CentralStage timer={header.timer} label={header.timerLabel}
              // Absent on every Ranked and Tutorial clock, which is why both
              // still read "of M:SS shared round".
              durationNote={header.timerNotes?.duration}
              expiredNote={header.timerNotes?.expired}
              result={header.centralResult ?? null}
              moduleTitle={header.moduleTitle ?? null}
              moduleEventId={header.moduleEventId ?? null}
              moduleTitleWindowMs={header.moduleTitleWindowMs}
              standing={header.standing ?? null}
              event={header.duelEvent ?? null} />
          ) : (
            // No clock and no result: a phased segment's ability window, or the
            // gap before the first round. The transition note is the honest
            // thing to show, and it keeps the reserved height filled.
            <p data-testid="ranked-round-transition"
              className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              {header.transitionNote ?? ""}
            </p>
          )}
        </div>

        {/* RIGHT — where in the match this is, plus the one result surface the
            centre cannot carry. */}
        {/* RIGHT — the previous module's record, and nothing else now.
            The progress figure moved to the left block, where it belongs with
            the rest of the match's identity; duplicating it here would have
            been the same fact in two places at two weights.

            A FIXED WINDOW, not a box that fits its string. "TIMED OUT +0 | R1"
            and "CORRECT +2 | R2" are different lengths, and while the box was
            sized to whichever was current, every settlement nudged the strip's
            right end. Fixed width and height, contents centred inside, so the
            record changes and the window does not. */}
        <div className="flex min-w-0 shrink-0 flex-col items-center justify-center gap-0.5
          lg:justify-self-center">
        <div data-testid="ranked-record-window"
          className="ranked-record-window flex h-10 w-[11.5rem] shrink-0 items-center
            justify-center overflow-hidden max-md:hidden min-[1500px]:w-[13rem]">
          {/* THE PERSISTENT SUMMARY — demoted, not deleted.
              This is the plate the strip has always carried, in the same
              precedence POINT1 wrote for it (a settled block, else a card of a
              block in flight, else an ordinary round). It is deliberately the
              thing that STAYS: it survives its beat as the previous-module
              summary, so a player who looked away still sees what the last
              module was worth.
              The display in the centre is the other half of that pair — the
              loud, momentary headline that hands the centre back to the clock.
              Two surfaces with two lifetimes; this is the record. */}
          {segmentSettlement && (view.cardBeat === null
            || segmentSettlement.roundNumber === view.cardBeat.roundNumber) ? (
            <SegmentResultBeat key={`segment-${segmentSettlement.roundNumber ?? "?"}`}
              settlement={segmentSettlement.settlement}
              viewerUserId={segmentSettlement.viewerUserId}
              opponentUserId={segmentSettlement.opponentUserId}
              roundNumber={segmentSettlement.roundNumber}
              feedback={segmentSettlement.feedback ?? null}
              pointsMatch={segmentSettlement.pointsMatch === true}
              detailsOpen={detailsOpen} onToggleDetails={setDetailsOpen}
              className="hidden md:flex" />
          ) : view.cardBeat ? (
            <CardResultBeat key={`card-${view.cardBeat.challengeIndex}`}
              beat={view.cardBeat} className="hidden md:flex" />
          ) : view.roundBeat ? (
            <RoundResultBeat key={view.roundBeat.settlement.roundNumber}
              settlement={view.roundBeat.settlement} viewerSlot={view.roundBeat.viewerSlot}
              feedback={view.roundBeat.feedback ?? null}
              pointsMatch={view.roundBeat.pointsMatch === true}
              className="hidden md:flex" />
          ) : null}
        </div>
          {/* OUTSIDE the fixed window, deliberately: these are not the record,
              and letting them into it would be letting a variable-length line
              back into the box that exists to have a fixed one. */}
          {/* DEMOTED. A placeholder-bank notice is a build-state fact, not
              match news, so it is the quietest text in the strip — present
              because it must be, at a weight that does not compete. */}
          {header.playtestNote && (
            <p data-testid="ranked-playtest-label"
              className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground/50">
              {header.playtestNote}
            </p>
          )}
          {/* The transition note keeps a home beside the title while a clock is
              still running — it says the NEXT round is being opened, which is
              not what the display in the centre is about. */}
          {header.transitionNote && (header.timer || header.centralResult) && (
            <span data-testid="ranked-round-transition"
              className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              {header.transitionNote}
            </span>
          )}
        </div>
      </section>
      {/* RMOB2 — below `lg` the header strip AND both duel banners give way to
          ONE match bar (players, timer, module position), inside the header's
          wrapper so the arena keeps its known bands (see `MobileMatchBar`).
          Ranked banners only; any other flank keeps its own presentation. */}
      {mobileDuel && view.left.kind === "combatant" && view.right.kind === "combatant" && (
        <MobileMatchBar left={view.left} right={view.right} header={header}
          progressionEnabled={view.progressionEnabled} className="lg:hidden" />
      )}
      {/* THE CARD-BY-CARD TRANSCRIPT — the one thing the retired segment
          banner owned that a 2.5rem plate cannot hold.
          Closed by default, opened only from the beat's own control, and
          ABSOLUTELY POSITIONED so it costs the header no height and moves
          nothing in the arena, and gone the moment the player dismisses it or
          the next block settles.
          It sizes to its CONTENT and owns no scroll container: a block has a
          fixed, small challenge count, so there is nothing here to scroll — and
          the arena's standing rule is that no surface inside it scrolls
          internally (see the source guard in `QuizRankedMatch.geometry`). */}
      {detailsOpen && segmentSettlement && (
        <div data-testid="segment-details-popover"
          className="absolute right-0 top-full z-30 mt-1 w-[min(40rem,100%)]
            whitespace-normal rounded-lg border border-[#b9934c]/40
            bg-[#070f1c] p-3 text-left shadow-2xl">
          <SegmentTranscript
            reveal={segmentSettlement.settlement.reveal}
            viewerUserId={segmentSettlement.viewerUserId}
            opponentUserId={segmentSettlement.opponentUserId}
            viewerLabel={view.left.kind === "combatant" ? view.left.combatant.name : undefined}
            damageDealt={
              segmentSettlement.settlement.damageByPlayerId[segmentSettlement.viewerUserId] ?? null}
            // R1: no ability layer means no ability reveal. An empty map
            // renders no ability row at all, rather than a "—" placeholder.
            abilitiesByPlayerId={view.progressionEnabled
              ? segmentSettlement.settlement.abilitiesByPlayerId : {}}
          />
        </div>
      )}
      </div>

      {/* Arena body: You ⚔ focus ⚔ Opponent. Ordinary flow — the centre column
          is NOT a scroll container; the page scrolls. `items-start` keeps the
          duelist panels at their natural height so a taller centre column can
          never stretch them.

          RA10: the question board is the centre of gravity — the duelist rails
          give up a step at lg (14rem) where width is scarce and return to
          15rem at xl, where the wider match frame (see ArenaShell) has already
          grown the centre track instead.

          RA11: from 1500px the frame runs stage-wide (90rem), so the rails
          step OUT to 17rem and the gutters widen — the duelists move toward
          the flanks while the centre track still absorbs most of the gain.

          Phase 11 — TRUE THREE COLUMNS. The rails stopped being fixed rem
          tracks and became PROPORTIONS of the arena: 23% / 54% / 23%. Two
          things follow, and both were the point:

           * the side columns grow with the stage instead of pinning at 14rem,
             which is what made them read as "two small cards flanking a giant
             centre" rather than as two of three columns;
           * `items-stretch` replaces `items-start`, so the three tracks share
             one vertical extent instead of the rails floating at their own
             natural height against a much taller centre (the §14 constraint).
             The panels themselves still size their own CONTENT — stretching
             the track is not stretching the content.

          RS1 — `lg:grid-rows-[minmax(0,1fr)]`: the ROW is the grid's height.
          An implicit `auto` row is sized from its items' content, and the
          stage's `min(reserve, 100%)` cannot resolve `100%` while the track is
          being sized — so the row floored at 480.5px. Wherever the grid got
          less (any viewport under ~754px tall, measured 447px at 1280x720) the
          stage and both Player Columns overflowed it by the difference onto
          the status strip, and the media never yielded. A definite track is
          what lets the existing shrink chain reach the art. */}
      <div className="grid grid-cols-2 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch min-[1500px]:gap-4 ranked-arena-grid">
        {/* `h-full` on BOTH the track cell and the panel: `items-stretch`
            stretches the grid cell, and without this the panel would still sit
            at its own content height inside a taller cell — which is the
            "tiny floating side cards beside a giant centre" reading §14 rules
            out. The panel's own sections keep their sizes; only the shared
            column extent changes. */}
        <div className={`${mobileDuel ? "hidden lg:block " : ""}lg:col-start-1 lg:row-start-1 lg:h-full`}>
          <Rail rail={view.left} progressionEnabled={view.progressionEnabled} />
        </div>
        <div className={`${mobileDuel ? "hidden lg:block " : ""}lg:col-start-3 lg:row-start-1 lg:h-full`}>
          <Rail rail={view.right} progressionEnabled={view.progressionEnabled} />
        </div>

        <div data-testid="ranked-focus-column"
          className="relative col-span-2 flex flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-0">
          {hasSurface && (
            <section data-testid="ranked-question"
              // Always mounted AND always in flow. During the reveal beat the
              // surface is dimmed, never collapsed: `opacity` costs no layout,
              // `display:none` cost several hundred pixels of jump.
              data-input-open={surface.inputOpen ? "true" : "false"}
              // `ranked-folio` is the RA4 academy skin for this exact box —
              // colour only. The reserved scenario-band box and the answer
              // grid inside are untouched. RA11 widens the HORIZONTAL padding
              // on the big stage only — vertical rhythm (and with it the
              // no-scroll desktop budget) is unchanged.
              //
              // `ranked-question-stage` is the arena's CANONICAL QUESTION
              // FOOTPRINT (ARENA1 Phase 1) and it is declared here, once,
              // because this section is the physical card: every mode's
              // viewport renders inside it, so this is the narrowest layer that
              // owns the box the player sees. It reserves the height of the
              // three regions a question is made of, so a media round and a
              // one-line round occupy the same space and the timeline below
              // does not move between them. See index.css for the arithmetic;
              // no mode adds or overrides a height, and none may.
              //
              // The `lg:flex` column is RG1's and is compatible by
              // construction: the stage is a MIN-height floor and `flex-1`
              // grows the card into whatever the arena band leaves above that
              // floor. Neither is a cap, so an oversized round still grows the
              // page rather than being clipped.
              className={`ranked-panel ranked-folio ranked-question-stage p-3 sm:p-5 min-[1500px]:px-7 transition-opacity duration-200 motion-reduce:transition-none lg:flex lg:flex-1 lg:flex-col lg:min-h-0 ${
                // RFX1: a reveal that carries a result overlay is NOT dimmed —
                // the overlay is the treatment, and dimming the stage would dim
                // the overlay (its child) and the tablets it is explaining.
                view.revealHold && !view.resultFeedback?.viewer
                  ? "opacity-60" : "opacity-100"}`}>
              {/* THE QUESTION'S BOX. It takes the card's height and there is
                  NOTHING to scroll inside it — no `overflow`, no clipping, no
                  bar in the parchment. The stage is sized so real content fits
                  whole (audited: 108-character prompts, 63-character options),
                  and content that genuinely cannot be seated grows the page
                  instead, which is the browser's job and not the folio's. */}
              <div className="lg:flex lg:flex-1 lg:flex-col lg:min-h-0"
                data-testid="ranked-question-body">
              {/* `my-auto`, deliberately NOT `justify-center`. Both centre the
                  question in a card that is taller than its content; only this
                  one degrades correctly when the content is TALLER than the
                  card, because auto margins resolve to zero the moment there
                  is no free space left, while `justify-content: center` would
                  push the first lines of a long prompt off the top.

                  AND IT MUST PARTICIPATE IN THE LOCK. The viewport lock gives
                  the stage a definite height and asks the media region — the
                  art — to absorb whatever the screen cannot pay for. That only
                  works if the constraint REACHES the art, and this wrapper was
                  where it stopped, in two separate ways:

                    * as a plain block it was not a flex CONTAINER, so the
                      surface inside it was not a flex item and the
                      `flex: 1 1 auto; min-height: 0` the stylesheet gives
                      `.question-surface-stack` was inert;
                    * as a flex ITEM it kept `min-height: auto`, whose automatic
                      minimum is the content's min-content height — and the
                      prompt and answers are deliberately `flex: 0 0 auto`, so
                      that minimum was the whole un-shrunk card.

                  So the wrapper held its intrinsic height inside a stage that
                  had already been locked shorter, and `.ranked-panel`'s
                  `overflow: hidden` cut the difference off the bottom. Measured
                  on a 1280x720 desktop: the stage was 433px, this wrapper was
                  540px, and all four answer tablets were outside the card.

                  `lg:flex lg:flex-col` makes the surface a flex item again;
                  `lg:min-h-0` lets this box shrink below its content so the
                  shrink can reach the one region that is allowed to yield.
                  `my-auto` is untouched and still does exactly what it did —
                  it centres while there is free space and resolves to zero when
                  there is not — which is now the ONLY thing deciding placement,
                  because the flex basis stays `auto` and nothing here grows. */}
              <div className="lg:my-auto lg:w-full lg:flex lg:min-h-0 lg:flex-col">
              <Viewport
                // The FROZEN snapshot: the surface keeps rendering the round the
                // player was looking at until the next one is genuinely ready.
                publicRound={surface.publicRound}
                selection={surface.selection}
                permissions={surface.permissions}
                // RFX1 2B3 — the mode-entry beat, relayed verbatim. The arena
                // never decides one; it only passes on what the mode said.
                entryPresentationMs={surface.entryPresentationMs}
                // R3: selecting an option IS answering. The mode's adapter maps
                // the selection to a submission; the arena never guesses one.
                onSelect={surface.onSelect}
                // The state from the SAME snapshot the renderer was resolved
                // from. Reading the live state here instead coupled a frozen
                // renderer to a moving state: across a segment boundary the
                // surface still shows module A while the live state already
                // describes module B, so a Meta Reflex viewport was handed a
                // null state and rendered "Loading the block…" for the whole
                // reveal beat — and, worse, a v1 renderer could be handed a v4
                // block whose cards it cannot read. During play the two are the
                // same object; they differ only while the surface is
                // deliberately lagging, which is exactly when they must not be
                // mixed.
                segmentState={surface.segmentState}
                actions={surface.actions}
                skewMs={surface.skewMs}
                reveal={surface.reveal}
                // ARENA1 Step 5 — the two mode-supplied surface seams. Both
                // are `undefined` for Ranked and the Tutorial, so the viewport
                // receives exactly the props it always did.
                feedback={surface.feedback}
                surfaceVerdict={surface.surfaceVerdict}
                surfaceSettings={surface.surfaceSettings}
              />
              </div>
              </div>
              {/* RFX1 — the result, on the card. Absolute, pointer-events
                  none, inside this overflow-hidden panel: it adds no height
                  and moves nothing (see QuestionResultOverlay). */}
              <QuestionResultOverlay feedback={view.resultFeedback ?? null} />
            </section>
          )}
          {!surface.renderer && (
            // Fail closed: never render a quiz input for an unrecognised
            // module — a mismatched input shape could submit a meaningless
            // answer into a rated match.
            <section data-testid="ranked-unsupported-module"
              className="ranked-panel p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">
                This round uses a game mode your client does not support yet.
                Please refresh to update.
              </p>
            </section>
          )}
          {/* The guidance seam. Last in the focus column, so a mode's own node
              sits directly under the question it speaks about, inside the same
              54% track, and above the timeline the arena keeps as its floor.
              Ranked passes nothing; React renders nothing; the column's DOM is
              byte-for-byte what it was. */}
          {guidance}
        </div>
      </div>

      {/* Lower HUD: the OPTIONAL ability hotbar plus ONE inline status line.
          There is no Lock In button — clicking an answer submits it.
          The row is rendered for the whole match: unmounting it between
          rounds tore ~230px out of the middle of the page.

          Phase 2 compact layout: the old side-by-side status CARD duplicated
          state already visible in the answer grid (selected answer) and the
          tray (armed ability) and cost a 20rem track plus ~94px of height.
          What survives is the one thing nothing else shows — the transient
          submission status / error — as a reserved-height line under the
          tray. */}
      {!surface.ownsSubmission && (
          <div className="flex flex-col gap-1.5 lg:shrink-0">
            {abilityHud && (
              // RA11: no panel chrome around the tray any more — the tray IS
              // the object (one connected spellbook-spine dock, see
              // .ability-spine in index.css). A wrapper panel around it is
              // exactly the "box containing cards" reading being retired.
              <section data-testid="ranked-abilities">
                <AbilityTray abilities={abilityHud.abilities}
                  selectedAbilityId={abilityHud.selectedAbilityId}
                  permissions={abilityHud.permissions}
                  onSelectAbility={abilityHud.onSelectAbility}
                  noAbilityLabel={abilityHud.noAbilityLabel} />
              </section>
            )}
            {/* One reserved line box: the three status strings (and an error)
                differ in length, and swapping them used to change the HUD's
                height whenever one of them wrapped.

                RG1 puts the mode's quiet control (Ranked: Forfeit Match) at
                the far end of this SAME row rather than in a band of its own.
                The row is already mounted for the whole match with a reserved
                height, so the control costs the stage no pixels and cannot
                move an anchor — and it sits as far from the answer grid as the
                arena allows. */}
            {/* THE STATUS LINE COSTS NO IDLE HEIGHT.
                It used to reserve a two-line box for the whole match so that a
                transient string could never move the arena when it appeared.
                That was the right instinct and the wrong price: the reserve was
                empty for most of every round, and on a shell locked to the
                viewport an always-empty box is height taken from the question.

                So the line is taken OUT OF FLOW instead. Absolutely positioned
                inside this row — which is mounted for the whole match anyway,
                because it carries the quiet control — it cannot move anything
                when it appears or clears, which is exactly the property the
                reserve was bought for, at no height at all. The row is now as
                tall as the control alone.

                `right-28` keeps the text clear of that control rather than
                printing under it, and `line-clamp-2` still bounds a long error
                to two lines — it simply bounds an overlay now. */}
            <div className="relative flex items-start justify-end gap-3 px-1">
              <p role={status?.isError ? "alert" : "status"} data-testid="submission-status"
                className={`pointer-events-none absolute left-0 right-28 top-0 line-clamp-2 text-xs ${
                  status?.isError ? "text-destructive" : "text-muted-foreground"}`}>
                {status?.text ?? ""}
              </p>
              {hudAction}
            </div>
          </div>
      )}

      {/* THE QUIET CONTROL, on a round the module owns.
          A Meta Reflex block hides the HUD row (the module renders its own
          submission chrome), and with it the control would go — leaving a
          Ranked player mid-block with no way to say they are done and only the
          45-second absence path to reach it by. So it gets its own slim row
          for exactly those rounds: same node, and it appears only where the
          row that normally carries it does not. */}
      {surface.ownsSubmission && hudAction && (
        <div className="flex justify-end px-1 lg:shrink-0">{hudAction}</div>
      )}

      {/* THE BOTTOM REGION — progression, and only progression.
          Nothing else follows the HUD row in any active state: not an ordinary
          round's result, not a settled Meta Reflex block's, not during a
          transition. The strip is mounted continuously — through the reveal
          beat and through a block settlement — which
          is what makes it the arena's floor rather than another thing that
          appears and disappears down here. */}
      {/* RMOB2 — the phone's bottom row: Report · a 5-node window of THIS
          timeline · Rules. Mounted only on a phone viewport (see the bar). The
          strip below stays the arena's last child and the desktop floor; on a
          phone Ranked arena CSS hides it in favour of the bar. */}
      {mobileDuel && timeline && <MobileBottomBar timeline={timeline} className="lg:hidden" />}
      {timeline && <RoundTimeline timeline={timeline} className="lg:shrink-0" />}

      {/* RFX1 2B3 — the PRESENTATION OVERLAY. LAST, so it lays over everything
          in the shell, and `pointer-events-none` so it can never be what stops
          a click: input is closed by `started_at`, not by this.

          The warning and the outro share the layer because they are the same
          kind of thing — a beat over the arena — and because they are mutually
          exclusive by construction: a medium warning announces a round that is
          about to open, and the outro only exists once the match is over. The
          outro is rendered second, so were they ever to coincide the ending
          would win, which is the correct precedence. */}
      {(warning || outro) && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center
                        justify-center" data-testid="ranked-warning-layer">
          {warning}
          {outro}
        </div>
      )}
    </div>
    </ArenaShell>
  );
}
