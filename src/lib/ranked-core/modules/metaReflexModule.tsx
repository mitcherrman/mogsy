// ---------------------------------------------------------------------------
// `item_cost_duel.v4` — the Meta Reflex block (QUIZ1 Phase 7).
//
// "Meta Reflex" is the product name; `item_cost_duel` is the shipped module id
// and stays as-is, because it is what every historical row, reveal and
// analytics record already stores. Nothing a player sees says item_cost_duel.
//
// ONE presentation for every family. A block draws its five cards from eighteen
// declared families across three KINDS, and the kind — not the family — decides
// what may be shown:
//
//   magnitude       two named entities, compare a value the client never has
//   classification  two named champions, judge a property the client never has
//   recognition     two anonymous images; the label WOULD BE the answer
//
// So there is one card component with a per-kind side renderer, not three
// pages. Adding a nineteenth family adds no frontend code.
//
// Authority: this component computes NOTHING. The active card index, the card
// deadline, both cards, and whether the block is over all come from the
// authoritative `segmentState` on every poll. The only local state is an "I
// just clicked this" marker, overwritten by the next snapshot. There is no
// local index increment and no local correctness — a refresh at any point lands
// on exactly the right card, and an expired card is advanced by the server.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { BeatPlate } from "@/components/ranked-arena/RoundResultBeat";
import { MetaReflexSting, useEntrySting } from "@/components/ranked-arena/MetaReflexSting";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { remainingMs, remainingSeconds } from "@/lib/ranked-core/timerMath";
import type { QuestionView } from "@/lib/ranked-core/viewTypes";
import type {
  MetaReflexCard,
  PublicRoundView,
  SegmentStateView,
  SettledCardReveal,
} from "@/lib/ranked-public/contracts";
import { META_REFLEX_MIXED_VERSION } from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleViewportProps } from "./types";

export const META_REFLEX_MODULE_ID = "item_cost_duel";
/** Public product name. Never the module id, which is an implementation fact. */
export const META_REFLEX_LABEL = "Meta Reflex";

/** 100ms tick: the per-card clock is ~6s, so a 1s tick loses a fifth of it. */
function useFastTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * The viewer's own card clock, as a DISPLAY value.
 *
 * `deadline` is the server's `own_card_deadline` and `skewMs` maps the local
 * wall clock onto server time, so a drifting or tampered browser clock changes
 * what is drawn and nothing else. Reaching zero here does not decide a timeout:
 * the server's schedule does, and the next snapshot is what moves the block on.
 */
export function cardCountdown(deadline: string | null, skewMs: number, nowMs: number,
                              timerMs: number | null) {
  if (!deadline) return null;
  const leftMs = remainingMs(deadline, skewMs, nowMs);
  const total = timerMs && timerMs > 0 ? timerMs : null;
  return {
    seconds: remainingSeconds(deadline, skewMs, nowMs),
    expired: leftMs <= 0,
    fraction: total === null ? null : Math.min(1, Math.max(0, leftMs / total)),
  };
}

function Countdown({ deadline, skewMs, timerMs }:
{ deadline: string | null; skewMs: number; timerMs: number | null }) {
  const now = useFastTick();
  const clock = cardCountdown(deadline, skewMs, now, timerMs);
  if (!clock) return null;
  return (
    <div className="flex items-center gap-2" data-testid="mr-countdown"
         data-expired={clock.expired ? "true" : "false"}>
      {clock.fraction !== null && (
        <span aria-hidden className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
          <span className="block h-full rounded-full bg-[#e8c97a] transition-[width] duration-100 ease-linear motion-reduce:transition-none"
                style={{ width: `${clock.fraction * 100}%` }} />
        </span>
      )}
      {/* aria-live is deliberately OFF: announcing every tick of a six-second
          clock would drown a screen reader. The value is labelled instead. */}
      <p className="text-sm font-semibold tabular-nums">
        <span className="sr-only">Time left on this card: </span>
        {clock.seconds}s
      </p>
    </div>
  );
}

/**
 * The card's picture. The slot is ALWAYS rendered, so a missing, still-loading
 * or broken image cannot change the layout or block an answer — a card with no
 * art is still a card you can click.
 *
 * Both media contracts resolve through the same helper because both are paths
 * on the combat API origin: a named side carries a repo-relative `assets/…`
 * path, and a recognition side carries the positional
 * `/api/ranked/media/segment-card/…` route that serves the same bytes without
 * naming their subject. Neither is ever parsed for identity.
 */
function CardArt({ src, alt, large }: { src?: string; alt: string; large: boolean }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [src]);
  const show = Boolean(src) && !errored;
  return (
    <span
      data-testid="mr-card-art"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#b9934c]/25 bg-black/25 ${
        large
          ? "h-24 w-24 sm:h-28 sm:w-28 lg:h-36 lg:w-36 min-[1500px]:h-40 min-[1500px]:w-40"
          : "h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20 min-[1500px]:h-24 min-[1500px]:w-24"}`}
    >
      {show ? (
        <img src={src} alt={alt} className="h-full w-full object-contain" loading="eager"
             data-testid="mr-card-img"
             onError={() => {
               if (import.meta.env.DEV) {
                 console.warn(`[meta-reflex] card art failed to load: ${src}`);
               }
               setErrored(true);
             }} />
      ) : (
        <span role="img" aria-label={alt} data-testid="mr-card-art-fallback">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"
               className="text-muted-foreground" fill="none" stroke="currentColor"
               strokeWidth="1.5">
            <path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" />
            <path d="M12 3v18M5 7l7 4 7-4" opacity="0.5" />
          </svg>
        </span>
      )}
    </span>
  );
}

type Side = "left" | "right";

/**
 * One of the two choices.
 *
 * What it shows is decided by the CARD'S KIND and nothing else, which is the
 * hidden-information rule expressed as a render:
 *
 *  * magnitude / classification name their entity — the player is being asked
 *    about two named things — and the numbers or properties being compared are
 *    simply not in the payload to leak;
 *  * recognition shows art only, and the accessible name is its POSITION
 *    ("left option"), because any real description would be the answer. The
 *    media URL is never parsed for a name either.
 */
function ChoiceCard({ card, side, selected, disabled, onPick, reveal = null }: {
  card: MetaReflexCard;
  side: Side;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  /**
   * POINT1 — this side's settled state, or null while the card is live.
   *
   * `"correct"` is the option the SERVER named (`correctCardId`) and is drawn
   * green whether or not the player picked it: the whole point of holding the
   * card through its reveal is that a player who got it wrong can see what the
   * answer was, in the place they were already looking.
   *
   * `"wrong"` is the player's own losing pick. It is the only other state,
   * because the two untaken sides of a settled card have nothing to say.
   */
  reveal?: "correct" | "wrong" | null;
}) {
  const recognition = card.kind === "recognition";
  const entity = card[side];
  const label = recognition ? null : (entity as { label: string }).label;
  const src = resolveQuizAssetUrl(
    recognition
      ? (entity as { mediaUrl: string }).mediaUrl
      : (entity as { media: string | null }).media);
  const accessibleName = label ?? `${side === "left" ? "Left" : "Right"} option`;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={selected}
      // The verdict is stated in WORDS to a screen reader, never by colour
      // alone — the same rule the arena's verdict chips follow.
      aria-label={reveal === "correct" ? `${accessibleName}, correct answer`
        : reveal === "wrong" ? `${accessibleName}, your answer, incorrect`
          : accessibleName}
      data-testid={`mr-choice-${side}`}
      data-card-id={side === "left" ? card.leftCardId : card.rightCardId}
      data-reveal={reveal ?? undefined}
      // The border is ALREADY 2px in every state, so switching its colour
      // cannot reflow the row: a reveal changes what the rectangle says and
      // never how large it is.
      className={`flex min-h-[7.5rem] flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-center lg:min-h-[12rem] lg:gap-3 lg:p-5
        transition-[border-color,background-color,transform] duration-150 motion-reduce:transition-none
        disabled:cursor-not-allowed
        enabled:hover:border-[#e8c97a]/70 enabled:active:scale-[0.99]
        ${reveal === "correct"
        ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/40 disabled:opacity-100"
        : reveal === "wrong"
          ? "border-destructive bg-destructive/10 disabled:opacity-100"
          : `disabled:opacity-70 ${selected
            ? "border-[#e8c97a] bg-[#e8c97a]/10" : "border-[#b9934c]/30 bg-black/20"}`}`}
    >
      <CardArt src={src} alt={`${accessibleName} artwork`} large={recognition} />
      {label !== null && (
        <span className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base lg:text-lg"
              data-testid={`mr-choice-${side}-label`}>
          {label}
        </span>
      )}
      {/* Nothing else. The compared value, the champion's class and the
          answer are not client-side facts until the segment settles. */}
    </button>
  );
}

/**
 * THE PER-CARD RESULT NOTIFICATION (POINT1).
 *
 * The same plate the arena states a settled ROUND with — `BeatPlate`, imported
 * rather than re-drawn, so a card result and a round result cannot drift into
 * two visual languages. It sits at the top of the module's own viewport rather
 * than in the arena header, because the header has ONE result slot and the
 * module-level `SegmentResultBeat` owns it: a block that replaced its own
 * summary with a card's would lose the scoreline the block exists to produce.
 *
 * "+1 POINT" / "+0 POINTS" IS A PROJECTION, NOT A SECOND SCORER. Meta Reflex
 * pays exactly one point per correct card — `item_cost_duel.block_damage` is
 * `damage = correct_count`, plus module-level bonuses — and the backend
 * publishes no per-card award to read, so the only honest thing a card can
 * state is that rule applied to the server's own verdict. Nothing here adds,
 * compares or accumulates: the module summary remains the authority on the
 * block's total, and the perfect/first bonus is stated ONLY there, because it
 * is a property of the block and belongs to no single card.
 *
 * There is deliberately no opponent clause. A Meta Reflex card is not zero-sum
 * — both players can be correct on the same card — so "OPPONENT +1 POINT"
 * would be inventing a transfer the rules do not contain.
 */
function CardResultBeat({ reveal, cardNumber }: {
  reveal: SettledCardReveal;
  cardNumber: number;
}) {
  const correct = reveal.outcome === "correct";
  return (
    <BeatPlate
      kind={correct ? "correct" : "incorrect"}
      mode="round"
      ariaLabel={`Card ${cardNumber} result: ${
        correct ? "correct, plus one point" : "incorrect, no points"}`}
      marker={`C${cardNumber}`}
      dataAttributes={{
        "data-testid": "mr-card-beat",
        "data-outcome": reveal.outcome,
        "data-challenge-index": String(reveal.challengeIndex),
      }}
      primary={correct ? "CORRECT" : "INCORRECT"}
      secondary={correct ? "+1 POINT" : "+0 POINTS"}
    />
  );
}

function BlockPhase({ state, cards, actions, skewMs }: {
  state: SegmentStateView;
  cards: MetaReflexCard[];
  actions: ModuleViewportProps["actions"];
  skewMs: number;
}) {
  const index = state.ownNextChallengeIndex;
  const current = cards[index];
  // "I clicked this" marker, cleared the moment the SERVER moves the index —
  // so a click never survives onto the next card as a stale selection.
  const [pending, setPending] = useState<{ index: number; cardId: string } | null>(null);
  useEffect(() => { setPending((p) => (p && p.index !== index ? null : p)); }, [index]);

  const now = useFastTick();
  const clock = cardCountdown(state.ownCardDeadline, skewMs, now, state.cardTimerMs);

  // RG3 — the card the viewer most recently FINISHED, whatever ended it. The
  // list is server-built and contains only settled cards, so "the last entry"
  // is always the one that just resolved and never the one on screen.
  const lastSettled = state.ownCardReveals.length
    ? state.ownCardReveals[state.ownCardReveals.length - 1] : null;

  if (state.ownFinished || !current) {
    const finalCard = lastSettled ? cards[lastSettled.challengeIndex] : null;
    return (
      <div className="space-y-3" data-testid="mr-waiting">
        <MetaReflexHeader progress={`${state.challengeCount} / ${state.challengeCount}`} />
        {/* THE LAST CARD'S REVEAL, on the card, with the surface to itself.
            Card five has no successor waiting on a clock, so it is held until
            the module summary replaces it — the block's own result is what
            ends this, not a timer. */}
        {lastSettled && finalCard && (<>
          <CardResultBeat key={lastSettled.challengeIndex} reveal={lastSettled}
            cardNumber={lastSettled.challengeIndex + 1} />
          <SettledCard card={finalCard} reveal={lastSettled} />
        </>)}
        <p className="text-sm text-muted-foreground" role="status">
          {state.opponentFinished
            ? "Both players are done — scoring the block…"
            : `Waiting for the opponent (${state.opponentChallengesCompleted} of ${state.challengeCount} done)…`}
        </p>
      </div>
    );
  }

  // Locked for three different reasons, all of them the server's: a submission
  // is in flight, this card was already answered, or its clock has run out and
  // the next snapshot is about to move past it. None of them is a verdict —
  // no correctness is shown here, because none exists client-side.
  const answered = pending !== null;
  const expired = clock?.expired === true;
  const locked = actions.busy || answered || expired;

  const pick = (cardId: string) => {
    if (locked) return;
    setPending({ index, cardId });
    actions.submitChallenge(index, { cardId });
  };

  /**
   * THE REVEAL PHASE (POINT1), and the whole reason it can exist.
   *
   * `ownRevealingCardIndex` is server-derived from the segment's own frozen
   * reveal window: the card it names has settled, the NEXT card has not opened
   * (the backend's schedule refuses a submission to it), and the answer is
   * being shown on the card the player was looking at. Before this window
   * existed the two events arrived on the same snapshot and the settled card
   * was gone before its answer was known — which is why the resolution used to
   * be a strip laid beside live play instead of the card itself.
   *
   * Read, never timed. There is no local `setTimeout` deciding the phase, so a
   * refresh mid-reveal reconstructs exactly this state from the same rows.
   */
  const revealing = state.ownRevealingCardIndex !== null
    ? state.ownCardReveals.find(
      (r) => r.challengeIndex === state.ownRevealingCardIndex) ?? null
    : null;
  const revealedCard = revealing ? cards[revealing.challengeIndex] : null;

  if (revealing && revealedCard) {
    return (
      <div className="space-y-3" data-testid="mr-block" data-phase="reveal">
        <MetaReflexHeader
          progress={`${revealing.challengeIndex + 1} / ${state.challengeCount}`}
        />
        <CardResultBeat key={revealing.challengeIndex} reveal={revealing}
          cardNumber={revealing.challengeIndex + 1} />
        <p className="text-center text-base font-semibold sm:text-lg lg:text-xl"
           data-testid="mr-prompt">
          {revealedCard.prompt}
        </p>
        <SettledCard card={revealedCard} reveal={revealing} />
        <p className="min-h-[1.25rem] text-center text-xs text-muted-foreground"
           role="status" data-testid="mr-status">
          Next card…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mr-block" data-phase="answer">
      <MetaReflexHeader
        progress={`${index + 1} / ${state.challengeCount}`}
        clock={<Countdown deadline={state.ownCardDeadline} skewMs={skewMs}
                          timerMs={state.cardTimerMs} />}
      />

      <p className="text-center text-base font-semibold sm:text-lg lg:text-xl" data-testid="mr-prompt">
        {current.prompt}
      </p>

      <div className="flex gap-2 sm:gap-3">
        <ChoiceCard card={current} side="left" disabled={locked}
                    selected={pending?.cardId === current.leftCardId}
                    onPick={() => pick(current.leftCardId)} />
        <ChoiceCard card={current} side="right" disabled={locked}
                    selected={pending?.cardId === current.rightCardId}
                    onPick={() => pick(current.rightCardId)} />
      </div>

      <p className="min-h-[1.25rem] text-center text-xs text-muted-foreground"
         role="status" data-testid="mr-status">
        {answered ? "Locked in — next card…"
          : expired ? "Time's up — next card…"
            : `Opponent: ${state.opponentChallengesCompleted} of ${state.challengeCount} done`}
      </p>
    </div>
  );
}

/**
 * The two rectangles of a card that has SETTLED, in the same geometry they had
 * while live.
 *
 * The correct side is green whether the player chose it or not — that is the
 * learning the reveal exists for — and the player's own losing pick is marked
 * as theirs. Both come from the server's `correctCardId` / `selectedCardId`;
 * nothing here decides which side was right, and there is no `onPick`, because
 * a settled card cannot be answered.
 */
function SettledCard({ card, reveal }: {
  card: MetaReflexCard; reveal: SettledCardReveal;
}) {
  const sideOf = (side: Side) =>
    (side === "left" ? card.leftCardId : card.rightCardId);
  const stateFor = (side: Side): "correct" | "wrong" | null => {
    const id = sideOf(side);
    if (id === reveal.correctCardId) return "correct";
    if (id === reveal.selectedCardId) return "wrong";
    return null;
  };
  return (
    <div className="flex gap-2 sm:gap-3" data-testid="mr-settled-card">
      {(["left", "right"] as Side[]).map((side) => (
        <ChoiceCard key={side} card={card} side={side} selected={false}
          disabled onPick={() => {}} reveal={stateFor(side)} />
      ))}
    </div>
  );
}

function MetaReflexHeader({ progress, clock }:
{ progress: string; clock?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div>
        <div className="ranked-eyebrow ranked-eyebrow--cyan">{META_REFLEX_LABEL}</div>
        <p className="text-sm font-semibold tabular-nums" data-testid="mr-progress">{progress}</p>
      </div>
      {clock}
    </header>
  );
}

function MetaReflexViewport({ publicRound, segmentState, actions, skewMs }: ModuleViewportProps) {
  /**
   * Phase 11 — the entry sting's identity is the BLOCK, not the card.
   *
   * Keyed on the segment number (plus the module version, so a client that
   * lives through a module upgrade treats the new block as new), and set only
   * once the block is actually in its `challenges` phase. Card 1 to card 5 all
   * share this key, so the sting plays exactly once per block and a second
   * block later in the match plays its own.
   *
   * The hook is called unconditionally, above every early return, because a
   * segment that arrives mid-load must not change the hook order.
   */
  const blockKey = segmentState && segmentState.phase === "challenges"
    ? `${publicRound.segment.moduleVersion}#${publicRound.segment.segmentNumber ?? "-"}`
    : null;
  const stinging = useEntrySting(blockKey);
  if (!segmentState) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="mr-loading">
        Loading the block…
      </p>
    );
  }
  const block = segmentState.block;
  // Fail closed rather than render an empty two-card frame: a v4 segment whose
  // block did not arrive as Meta Reflex cards is a contract problem, and
  // guessing at it would put a clickable card on screen with nothing behind it.
  if (segmentState.phase === "challenges" && block?.contract !== "meta_reflex") {
    return (
      <p className="text-sm text-muted-foreground" role="status" data-testid="mr-unavailable">
        This {META_REFLEX_LABEL} block could not be loaded. Please refresh.
      </p>
    );
  }
  return (
    <div className="relative space-y-3">
      {/* Laid OVER a live, clickable card — never in front of it. See
          MetaReflexSting for why a blocking curtain would spend the player's
          own answer window. */}
      {stinging && <MetaReflexSting />}
      {block?.contract === "meta_reflex" ? (
        <BlockPhase state={segmentState} cards={block.cards} actions={actions} skewMs={skewMs} />
      ) : (
        // A pre-challenge phase (a legacy ability window). The server expires it
        // on its own; there is nothing to offer and nothing to decide.
        <div className="space-y-2" data-testid="mr-starting">
          <MetaReflexHeader progress={`0 / ${segmentState.challengeCount}`} />
          <p className="text-sm text-muted-foreground" role="status">Starting…</p>
        </div>
      )}
      {actions.error && (
        <p role="alert" data-testid="mr-error" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}
    </div>
  );
}

export const metaReflexModule: ModuleRenderer = {
  moduleId: META_REFLEX_MODULE_ID,
  moduleVersion: META_REFLEX_MIXED_VERSION,
  servesVersion: (version) => version >= META_REFLEX_MIXED_VERSION,
  // The block owns its own input, so the shell must not also render the quiz
  // confirm strip or the ability tray beside it.
  ownsSubmission: true,
  Viewport: MetaReflexViewport,
  // Not question-shaped: the shell drives the viewport from `segmentState`.
  projectQuestion: (_pub: PublicRoundView): QuestionView | null => null,
  summaryLabel: (pub) => {
    const state = pub.segmentState;
    if (!state) return null;
    return `${META_REFLEX_LABEL} ${
      Math.min(state.ownNextChallengeIndex + 1, state.challengeCount)} / ${state.challengeCount}`;
  },
};
