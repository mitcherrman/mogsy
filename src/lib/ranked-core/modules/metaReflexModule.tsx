// ---------------------------------------------------------------------------
// `item_cost_duel.v4` — the Meta Reflex block (QUIZ1 Phase 7).
//
// "Meta Reflex" is the internal name; players see "Stat Check" (SC-RENAME3,
// `META_REFLEX_LABEL`). `item_cost_duel` is the shipped module id
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
import { Check, X } from "lucide-react";
import { ChampionLevelBadge } from "@/components/ChampionLevelBadge";
import {
  MetaReflexSting, STING_MS, useEntrySting,
} from "@/components/ranked-arena/MetaReflexSting";
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
export { META_REFLEX_LABEL } from "./metaReflexLabel";
import { META_REFLEX_LABEL } from "./metaReflexLabel";

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
function ChoiceCard({ card, side, selected, disabled, onPick, reveal = null, picked = false }: {
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
  /** RFX1 — on a settled card, this side is the player's own pick. */
  picked?: boolean;
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
      aria-label={reveal === "correct" ? `${accessibleName}, ${picked ? "your answer, " : ""}correct answer`
        : reveal === "wrong" ? `${accessibleName}, your answer, incorrect`
          : accessibleName}
      data-testid={`mr-choice-${side}`}
      data-card-id={side === "left" ? card.leftCardId : card.rightCardId}
      data-reveal={reveal ?? undefined}
      // The border is ALREADY 2px in every state, so switching its colour
      // cannot reflow the row: a reveal changes what the rectangle says and
      // never how large it is.
      data-picked={picked || undefined}
      className={`relative flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-center lg:gap-3 lg:p-5
        transition-[border-color,background-color,transform] duration-150 motion-reduce:transition-none
        disabled:cursor-not-allowed
        enabled:hover:border-[#e8c97a]/70 enabled:active:scale-[0.99]
        ${reveal === "correct"
        ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-400/40 disabled:opacity-100"
        : reveal === "wrong"
          ? "border-red-600 bg-red-500/15 disabled:opacity-100"
          : `disabled:opacity-70 ${selected
            ? "border-[#e8c97a] bg-[#e8c97a]/10" : "border-[#b9934c]/30 bg-black/20"}`}`}
    >
      {/* RFX1 — absolute corner tags (no layout): the pick is named in words
          and an icon, never colour alone. */}
      {reveal && (
        <span data-testid={`mr-tag-${side}`} aria-hidden
          className={`pointer-events-none absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.14em] text-white lg:text-[10px] ${
            reveal === "correct" ? "bg-emerald-700" : "bg-red-700"}`}>
          {reveal === "correct"
            ? <Check className="h-2.5 w-2.5" strokeWidth={4} />
            : <X className="h-2.5 w-2.5" strokeWidth={4} />}
          {reveal === "correct" ? (picked ? "Your pick · Correct" : "Correct") : "Your pick"}
        </span>
      )}
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

// ---------------------------------------------------------------------------
// NO RESULT PLATE IS DRAWN HERE (POINT1 corrective).
//
// A card's CORRECT / INCORRECT verdict and its +1 / +0 belong to the arena's
// ONE result slot — the top header strip — and are rendered there by
// `components/ranked-arena/CardResultBeat` from `ArenaViewModel.cardBeat`.
//
// The first POINT1 pass put a `BeatPlate` at the top of this viewport instead,
// reasoning that the header slot was owned by the module-level
// `SegmentResultBeat`. It is — but only once the block has SETTLED, which by
// construction cannot happen while one of its cards is being revealed. The
// result was two textual result surfaces on screen for the same card, with the
// header one showing the stale previous ROUND through the legacy damage branch.
//
// What this viewport still owns is the card BODY: the settled card held in
// place, the server's correct side marked green, and "Next card...".
// ---------------------------------------------------------------------------

/**
 * THE BLOCK'S ONE FRAME (SCBS1).
 *
 * Every phase of a block is drawn into the SAME four slots, each of a declared
 * height:
 *
 *   header        the product name and "n / 5", with the card clock beside it
 *   prompt block  the level slot, then a two-line prompt slot
 *   card row      the two choices (or, with no card yet, a one-line message)
 *   status line   one line: the opponent's progress, "Locked in", an error
 *
 * Before this each phase was exactly as tall as it happened to be — "Loading"
 * a line, "Starting…" two, a live card ~330px, the wait (which dropped the
 * header and the prompt) ~295px — and the whole box was centred in the folio.
 * So the arena's content jumped when a block opened (onto the first card) and
 * again when its last card settled (into the wait), by half the height
 * difference or all of it, while the cards between, being one height, held
 * still. The old reserve was an 18.5rem min-height: 37px short of the live card,
 * and absent below `lg` — so it reserved nothing at either end.
 *
 * CONTENT ADAPTS TO THE FRAME. A recognition card (large art) and a named card
 * (small art and a label) are drawn into the same card row, the prompt into the
 * same two-line slot, and a phase with less to say leaves its slots empty
 * rather than giving the height back. The card row is sized for the tallest
 * card at each breakpoint — recognition art (96/112/144/160px) plus the card's
 * padding and border, or named art plus a two-line label — so nothing is
 * clipped and nothing is measured.
 */
const CARD_ROW_H = "h-[9rem] lg:h-[13rem]";

function BlockFrame({ testId, phase, progress, clock, card, row, status }: {
  testId: string;
  phase?: string;
  progress: string;
  clock?: React.ReactNode;
  /** The card whose level and prompt the prompt block shows, or null. */
  card: MetaReflexCard | null;
  row: React.ReactNode;
  status: React.ReactNode;
}) {
  return (
    <div className="space-y-3" data-testid={testId} data-phase={phase}>
      <MetaReflexHeader progress={progress} clock={clock} />
      <CardPrompt card={card} />
      <div data-testid="mr-card-row" className={`flex gap-2 sm:gap-3 ${CARD_ROW_H}`}>
        {row}
      </div>
      <div data-testid="mr-status-slot" className="h-5">{status}</div>
    </div>
  );
}

/** A one-line message that stands where the cards will be. */
function RowMessage({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <p className="m-auto text-center text-sm text-muted-foreground" role="status"
       data-testid={testId}>
      {children}
    </p>
  );
}

const STATUS_CLASS = "text-center text-xs text-muted-foreground";

function BlockPhase({ state, cards, actions, skewMs, errorLine }: {
  state: SegmentStateView;
  cards: MetaReflexCard[];
  actions: ModuleViewportProps["actions"];
  skewMs: number;
  /** `actions.error`, drawn in the status slot in place of the status. */
  errorLine: React.ReactNode;
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
      // THE LAST CARD'S REVEAL, on the card, with the surface to itself.
      // Card five has no successor waiting on a clock, so it is held until the
      // module summary replaces it — the block's own result is what ends this,
      // not a timer. It is drawn in the SAME frame as the live card (header,
      // prompt, card row, status), so the wait does not move it.
      <BlockFrame testId="mr-waiting"
        progress={`${state.challengeCount} / ${state.challengeCount}`}
        card={finalCard}
        row={lastSettled && finalCard
          ? <SettledCard card={finalCard} reveal={lastSettled} /> : null}
        status={errorLine ?? (
          <p className={STATUS_CLASS} role="status">
            {state.opponentFinished
              ? "Both players are done — scoring the block…"
              : `Waiting for the opponent (${state.opponentChallengesCompleted} of ${state.challengeCount} done)…`}
          </p>
        )} />
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
      <BlockFrame testId="mr-block" phase="reveal"
        progress={`${revealing.challengeIndex + 1} / ${state.challengeCount}`}
        card={revealedCard}
        row={<SettledCard card={revealedCard} reveal={revealing} />}
        status={errorLine ?? (
          <p className={STATUS_CLASS} role="status" data-testid="mr-status">
            Next card…
          </p>
        )} />
    );
  }

  return (
    <BlockFrame testId="mr-block" phase="answer"
      progress={`${index + 1} / ${state.challengeCount}`}
      clock={<Countdown deadline={state.ownCardDeadline} skewMs={skewMs}
                        timerMs={state.cardTimerMs} />}
      card={current}
      row={(
        <>
          <ChoiceCard card={current} side="left" disabled={locked}
                      selected={pending?.cardId === current.leftCardId}
                      onPick={() => pick(current.leftCardId)} />
          <ChoiceCard card={current} side="right" disabled={locked}
                      selected={pending?.cardId === current.rightCardId}
                      onPick={() => pick(current.rightCardId)} />
        </>
      )}
      status={errorLine ?? (
        <p className={STATUS_CLASS} role="status" data-testid="mr-status">
          {answered ? "Locked in — next card…"
            : expired ? "Time's up — next card…"
              : `Opponent: ${state.opponentChallengesCompleted} of ${state.challengeCount} done`}
        </p>
      )} />
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
    <div className="flex h-full w-full gap-2 sm:gap-3" data-testid="mr-settled-card">
      {(["left", "right"] as Side[]).map((side) => (
        <ChoiceCard key={side} card={card} side={side} selected={false}
          disabled onPick={() => {}} reveal={stateFor(side)}
          picked={sideOf(side) === reveal.selectedCardId} />
      ))}
    </div>
  );
}

/**
 * The card's question: the frozen level, then the prompt.
 *
 * ONE component for both phases (answer and reveal) rather than two copies of
 * the markup, because a card that grew a badge when it settled — or lost one —
 * would read as the question having changed.
 *
 * MRLVL1: the badge sits ABOVE the prompt, centred, on its own line. Three
 * reasons it is not anywhere else:
 *
 *  - not inside either ChoiceCard, because the level applies to BOTH champions
 *    and a badge on a coin reads as a fact about that coin;
 *  - not in `MetaReflexHeader`, whose right-hand slot is the per-card
 *    countdown — a gold pill beside a gold clock is two numbers competing to
 *    be the urgent one;
 *  - above rather than below, so it is read before the question it qualifies.
 *
 * SC-RENAME3: the badge row is a PERMANENTLY RESERVED fixed-height slot.
 * `ChampionLevelBadge` still renders nothing for a null level, but the slot
 * stays, so a level-independent card (or a pre-MRLVL1 segment) puts its prompt
 * and choice cards at exactly the same y as a level-aware one. Without it, a
 * block mixing the two shifted the prompt and cards ~23px between consecutive
 * cards. The slot is a fixed `h-5` (the pill is ~17px) so it never grows.
 */
function CardPrompt({ card }: { card: MetaReflexCard | null }) {
  const hasLevel = card?.championLevel != null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div data-testid="mr-level-slot"
           data-has-level={hasLevel ? "true" : "false"}
           aria-hidden={hasLevel ? undefined : true}
           className="flex h-5 shrink-0 items-center justify-center">
        <ChampionLevelBadge level={card?.championLevel ?? null} />
      </div>
      {/* SCBS1 — TWO LINES, ALWAYS. The prompt is centred in a slot sized for
          two lines of its own leading (24px below `sm`, 28px from it), so a
          prompt that wraps on a phone does not push the cards down, and a phase
          with no card (loading, starting) keeps the slot empty. */}
      <div data-testid="mr-prompt-slot"
           className="flex min-h-[3rem] w-full items-center justify-center sm:min-h-[3.5rem]">
        {card && (
          <p className="w-full text-center text-base font-semibold sm:text-lg lg:text-xl"
             data-testid="mr-prompt">
            {card.prompt}
          </p>
        )}
      </div>
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

function MetaReflexViewport({
  publicRound, segmentState, actions, skewMs, entryPresentationMs,
}: ModuleViewportProps) {
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
  /**
   * RFX1 2B3 — the coordinator's window, or the sting's own default when no
   * coordinator supplied one (the dev harnesses). 0 means "not owed one",
   * which is how a reconnect into a running block skips it.
   */
  const stingMs = entryPresentationMs && entryPresentationMs > 0
    ? entryPresentationMs : STING_MS;
  const stinging = useEntrySting(blockKey, entryPresentationMs ?? STING_MS);
  const block = segmentState?.block;
  // `actions.error`, drawn in the status slot in place of the status: a line
  // that APPENDED to the surface would grow it, and move the card with it.
  const errorLine = actions.error ? (
    <p role="alert" data-testid="mr-error" className="text-center text-sm text-destructive">
      {actions.error}
    </p>
  ) : null;
  // Every case — loading, unavailable, starting, and each phase of the block —
  // is drawn into the block's ONE frame (see `BlockFrame`), so the surface is
  // the same box whichever of them is on screen.
  let content: React.ReactNode;
  if (!segmentState) {
    // The public round names the segment before the viewer's own state has
    // been read, so this is a real, brief state at the start of every block.
    content = (
      <BlockFrame testId="mr-loading-frame" progress={" "} card={null}
        row={<RowMessage testId="mr-loading">Loading the block…</RowMessage>}
        status={errorLine} />
    );
  } else if (segmentState.phase === "challenges" && block?.contract !== "meta_reflex") {
    // Fail closed rather than render an empty two-card frame: a v4 segment
    // whose block did not arrive as Meta Reflex cards is a contract problem,
    // and guessing at it would put a clickable card on screen with nothing
    // behind it.
    content = (
      <BlockFrame testId="mr-unavailable-frame" progress={" "} card={null}
        row={(
          <RowMessage testId="mr-unavailable">
            This {META_REFLEX_LABEL} block could not be loaded. Please refresh.
          </RowMessage>
        )}
        status={errorLine} />
    );
  } else if (block?.contract === "meta_reflex") {
    content = (
      <BlockPhase state={segmentState} cards={block.cards} actions={actions} skewMs={skewMs}
        errorLine={errorLine} />
    );
  } else {
    // A pre-challenge phase (a legacy ability window). The server expires it
    // on its own; there is nothing to offer and nothing to decide.
    content = (
      <BlockFrame testId="mr-starting" progress={`0 / ${segmentState.challengeCount}`}
        card={null}
        row={<RowMessage testId="mr-starting-note">Starting…</RowMessage>}
        status={errorLine} />
    );
  }
  return (
    // ONE PRESENTATION BOX FOR THE WHOLE BLOCK. Its height is not reserved by a
    // `min-h` that every phase then happens to fit: it is the sum of the
    // frame's four slots, each declared (see `BlockFrame`), so it is the same
    // box in every phase and at every width. The sting is absolute, so — unlike
    // when this was a `space-y-3` stack whose first child it was — it adds no
    // margin to the block while it is up and takes none away when it goes.
    <div className="relative" data-testid="mr-surface">
      {/* Laid OVER a live, clickable card — never in front of it. See
          MetaReflexSting for why a blocking curtain would spend the player's
          own answer window. */}
      {stinging && segmentState && (
        /* RFX1 2B3 visual implementation — the sting is told how long it is
           being HELD for, so its animation lasts as long as the element does.
           Before this it ran a fixed 720 ms in-and-out cycle and came to rest
           at `opacity: 0`, which left ~1080 ms of the Ranked 1800 ms beat
           showing nothing at all. The card count is the block's own. */
        <MetaReflexSting variant="beat" durationMs={stingMs}
          cardCount={segmentState.challengeCount} />
      )}
      {content}
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
