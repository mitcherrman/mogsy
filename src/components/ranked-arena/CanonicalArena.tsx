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
import { useState } from "react";
import { AbilityTray } from "./AbilityTray";
import { ArenaShell } from "./ArenaShell";
import { CombatantPanel } from "./CombatantPanel";
import { LevelUpPanel } from "./LevelUpPanel";
import { MatchOverFrame } from "./MatchOverFrame";
import { RevealPanel } from "./RevealPanel";
import { RoundResultBeat } from "./RoundResultBeat";
import { RoundTimeline } from "./RoundTimeline";
import { SegmentResultBeat } from "./SegmentResultBeat";
import { SegmentTranscript } from "./SegmentTranscript";
import { TimerDisplay } from "./TimerDisplay";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
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
  /** Copy for the null-view placeholder, which is a mode's own sentence. */
  recovering?: { eyebrow: string; message: string };
}

/** One flank. Ranked fills both with a duelist; a mode may supply a panel. */
function Rail({ rail, progressionEnabled }:
{ rail: ArenaRail; progressionEnabled: boolean }) {
  if (rail.kind === "panel") return <>{rail.node}</>;
  return (
    <CombatantPanel combatant={rail.combatant}
      progressionEnabled={progressionEnabled}
      damage={rail.damage}
      outcome={rail.outcome}
      damageDealt={rail.damageDealt}
      reaction={rail.reaction} />
  );
}

export function CanonicalArena({
  view, terminal = null, chrome, recovering, guidance,
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
            heading={terminal.heading}
            subheading={terminal.subheading}
            summary={terminal.summary}
            progressionEnabled={terminal.progressionEnabled}
            primaryAction={terminal.primaryAction} />
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
        <section data-testid="ranked-recovering" className="ranked-shell">
          <div className="ranked-panel p-6 text-center space-y-1">
            <div className="ranked-eyebrow ranked-eyebrow--cyan">
              {recovering?.eyebrow ?? "Ranked Duel"}
            </div>
            <p className="text-sm text-muted-foreground">
              {recovering?.message ?? "Recovering match…"}
            </p>
          </div>
        </section>
      </ArenaShell>
    );
  }

  const { header, surface, progression, abilityHud, status, hudAction, timeline } = view;
  // Capitalised local: a JSX tag cannot carry a non-null assertion, and the
  // module's viewport is the one element here whose TYPE comes from the mode.
  const Viewport = surface.renderer?.Viewport ?? null;
  const hasSurface = Viewport !== null && surface.hasContent;

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
   * Both results now resolve in the TOP strip, in one shared plate:
   *   * an ordinary round → `RoundResultBeat`
   *   * a settled block   → `SegmentResultBeat`, whose vocabulary is extended
   *     exactly far enough to carry the one thing a round cannot say — each
   *     player's N/5 — and no further.
   *
   * Settlement feedback for an ordinary round is otherwise carried, in full, by
   * the answer tablets' reveal and each duelist column's verdict row and
   * recent-round ledger. `RevealBanner` survives as the arena inspector's
   * fixture; the segment banner had no other caller and is deleted outright —
   * its one irreplaceable part, the card-by-card transcript, is disclosed from
   * the block's own beat instead.
   */
  return (
    <ArenaShell size="wide" header={chrome}>
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
    <div className="ranked-shell flex flex-col gap-3 lg:flex-1 lg:gap-2"
      data-testid="ranked-match" data-reveal-hold={view.revealHold ? "true" : "false"}>
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
      {/* Condensed top strip — mode · round · timer in one compact row.
          `min-h` reserves the tallest state this strip ever reaches, so the
          transition pill appearing or the timer gaining a notice line cannot
          push the arena below it. */}
      <section data-testid="ranked-header"
        className="ranked-panel ranked-header-plate flex min-h-[3.5rem] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="ranked-eyebrow">{header.eyebrow}</div>
            <h3 className="ranked-title text-lg font-bold leading-tight">{header.title}</h3>
          </div>
          {header.transitionNote && (
            <span data-testid="ranked-round-transition"
              className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              {header.transitionNote}
            </span>
          )}
        </div>
        {/* THE ROUND-RESOLUTION BEAT. Third child of a `justify-between` row,
            so it takes the gap the strip already had between the round title
            and the clock — the left group and the timer keep their ends, and
            neither moves when it appears.

            `key` on the ROUND is what makes this a beat rather than a static
            summary: a new settlement remounts the plate and replays its
            entrance. A round settles exactly once, so the round number is a
            stable, monotonic event id.

            `hidden md:flex` because below that width the strip has no gap to
            take (the duelist ledgers carry the history at every width). The
            plate is a fixed 2.5rem and never wraps, so it cannot grow the
            strip past its reserved min-height or crowd the timer. */}
        {segmentSettlement ? (
          // A settled block wins the slot: it describes the same round the
          // arena settlement does, and two plates would be two answers to one
          // question. It also says strictly more — a round beat cannot report
          // a 5-card scoreline.
          <SegmentResultBeat key={`segment-${segmentSettlement.roundNumber ?? "?"}`}
            settlement={segmentSettlement.settlement}
            viewerUserId={segmentSettlement.viewerUserId}
            opponentUserId={segmentSettlement.opponentUserId}
            roundNumber={segmentSettlement.roundNumber}
            detailsOpen={detailsOpen} onToggleDetails={setDetailsOpen}
            className="hidden md:flex" />
        ) : view.roundBeat ? (
          <RoundResultBeat key={view.roundBeat.settlement.roundNumber}
            settlement={view.roundBeat.settlement} viewerSlot={view.roundBeat.viewerSlot}
            className="hidden md:flex" />
        ) : null}
        {/* RA10: the timer block sits behind a brass hairline, scoreboard-style,
            so the clock reads as its own instrument. Border only — the strip's
            reserved min-height is untouched. */}
        <div className="flex items-center gap-3 sm:border-l sm:border-[#b9934c]/30 sm:pl-4">
          {(header.playtestNote || header.presenceNote) && (
            <div className="hidden text-right sm:block">
              {header.playtestNote && (
                <p data-testid="ranked-playtest-label"
                  className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {header.playtestNote}
                </p>
              )}
              {header.presenceNote && (
                <p data-testid="ranked-presence" className="text-[11px] text-muted-foreground">{header.presenceNote}</p>
              )}
            </div>
          )}
          {header.timer && <TimerDisplay timer={header.timer} label={header.timerLabel} />}
        </div>
      </section>
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

      {/* Mobile-only presence/playtest line (hidden in the strip on <sm). */}
      {(header.playtestNote || header.presenceNote) && (
        <div className="flex flex-wrap gap-x-3 px-1 sm:hidden">
          {header.playtestNote && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {header.playtestNote}
            </span>
          )}
          {header.presenceNote && <span className="text-[11px] text-muted-foreground">{header.presenceNote}</span>}
        </div>
      )}

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
             the track is not stretching the content. */}
      <div className="grid grid-cols-2 gap-3 lg:flex-1 lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)] lg:items-stretch min-[1500px]:gap-4">
        {/* `h-full` on BOTH the track cell and the panel: `items-stretch`
            stretches the grid cell, and without this the panel would still sit
            at its own content height inside a taller cell — which is the
            "tiny floating side cards beside a giant centre" reading §14 rules
            out. The panel's own sections keep their sizes; only the shared
            column extent changes. */}
        <div className="lg:col-start-1 lg:row-start-1 lg:h-full">
          <Rail rail={view.left} progressionEnabled={view.progressionEnabled} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1 lg:h-full">
          <Rail rail={view.right} progressionEnabled={view.progressionEnabled} />
        </div>

        <div data-testid="ranked-focus-column"
          className="relative col-span-2 flex flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          {/* The level-2 choice is OVERLAID on the question rather than
              inserted above it. In flow it added ~192px to the middle of the
              page the instant a round resolved, pushing the question, the
              ability tray and the status panel down under the player's cursor.
              The panel is opaque and sits in the same place the question does,
              so it reads as the focal control without moving anything. */}
          {progression && (
            <section data-testid="ranked-progression"
              // Overlaid on the question so nothing below it moves — EXCEPT
              // when the focus column has no surface at all (a phased segment
              // between engine rounds): overlaying an empty column would hang
              // the panel over whatever sits beneath, so it renders in flow
              // there (the column was empty; nothing shifts).
              className={hasSurface ? "absolute inset-x-0 top-0 z-20" : ""}>
              <LevelUpPanel
                event={{
                  kind: "level2-choice",
                  options: progression.options,
                  // R3: the pending id marks the choice IN FLIGHT, not one awaiting
                  // a confirmation click. The server's acceptance is what ends the
                  // progression phase, so nothing is confirmed locally.
                  pendingOptionId: progression.pendingOptionId, confirmedOptionId: null,
                }}
                permissions={{ ...NO_INTERACTIONS, canSelectAbility: !progression.busy }}
                onSelectOption={progression.onSelectOption}
                gatesNextRound
              />
            </section>
          )}
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
              className={`ranked-panel ranked-folio p-3 sm:p-5 min-[1500px]:px-7 transition-opacity duration-200 motion-reduce:transition-none lg:flex lg:flex-1 lg:flex-col ${
                view.revealHold || progression ? "opacity-60" : "opacity-100"}`}>
              {/* THE QUESTION'S BOX. It takes the card's height and there is
                  NOTHING to scroll inside it — no `overflow`, no clipping, no
                  bar in the parchment. The stage is sized so real content fits
                  whole (audited: 108-character prompts, 63-character options),
                  and content that genuinely cannot be seated grows the page
                  instead, which is the browser's job and not the folio's. */}
              <div className="lg:flex lg:flex-1 lg:flex-col"
                data-testid="ranked-question-body">
              {/* `my-auto`, deliberately NOT `justify-center`. Both centre the
                  question in a card that is taller than its content; only this
                  one degrades correctly when the content is TALLER than the
                  card, because auto margins resolve to zero the moment there
                  is no free space left, while `justify-content: center` would
                  push the first lines of a long prompt off the top. */}
              <div className="lg:my-auto lg:w-full">
              <Viewport
                // The FROZEN snapshot: the surface keeps rendering the round the
                // player was looking at until the next one is genuinely ready.
                publicRound={surface.publicRound}
                selection={surface.selection}
                permissions={surface.permissions}
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
              />
              </div>
              </div>
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
          The row is rendered for the whole match, INCLUDING a level-2 choice:
          unmounting it there tore ~230px out of the middle of the page.

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
            <div className="flex items-start justify-between gap-3 px-1">
              <p role={status?.isError ? "alert" : "status"} data-testid="submission-status"
                className={`line-clamp-2 min-h-[2.25rem] text-xs ${
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
          beat, through a block settlement and through a level-2 choice — which
          is what makes it the arena's floor rather than another thing that
          appears and disappears down here. */}
      {timeline && <RoundTimeline timeline={timeline} className="lg:shrink-0" />}
    </div>
    </ArenaShell>
  );
}
