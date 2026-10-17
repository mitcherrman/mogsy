/**
 * PERFECT TIMING — THE BETWEEN-STAGE TRANSITION (PT5.1).
 *
 * A Mastery Slice changes ONE input between stages, and the player has to feel
 * it before they time again. This is the screen that says so, as a state of its
 * own between the reveal and the next playable stage:
 *
 *   RANK UP        the ability gained ranks    Rank 1 → Rank 3, the new pips light
 *   ITEM EQUIPPED  the item arrives in a slot  Sheen, +10 Ability Haste
 *
 * then, on both, "Cooldown changed / reduced" and "Adjust your timing".
 *
 * WHAT IT NEVER DOES. It shows no cooldown, no target and no figure that is not
 * already public on the stage (rank, rank count, the item's name and ability
 * haste — all from the server's deal). No clock runs and nothing can be cast
 * here: the round is not armed until the player continues. The wording about
 * the cooldown is neutral unless the stage guarantees a direction (an item with
 * positive ability haste always shortens it).
 *
 * MOTION. One finite entrance, 1 s end to end, `both` — the rest frame is the
 * full composition, so reduced motion (OS or in-app) is that frame from the
 * first paint. Nothing loops, and the whole thing is gone before anything can
 * be timed. Only opacity and transform move, so the layout never shifts.
 *
 * THE WAY ON. Continue becomes live once the headline and the change have had
 * time to be read (`useSettledAdvance`): then focus moves to it and Space/Enter
 * anywhere continue, once, never on a repeat. Before that nothing advances, so
 * the key that left the reveal cannot also leave this screen.
 */
import { useRef, useState, type CSSProperties } from "react";
import { SubjectArt } from "@/components/interaction-grammar/shared";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useSettledAdvance } from "@/lib/perfect-timing/useSettledAdvance";
import type { PtRoundView, PtSliceItemView, PtSliceStageView } from "@/lib/perfect-timing/viewModel";
import { HeroArt } from "./PerfectTimingStage";
import {
  ADJUST_TIMING_TEXT, TRANSITION_READY_MS, TRANSITION_READY_REDUCED_MS, TRANSITION_TITLE, cooldownChangeText, hasTransition, hasteText, rankStepText, rankText,
} from "./presentation";
import "./perfectTiming.css";


function ItemSlot({ item }: { item: PtSliceItemView }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="pt-tr-slot" data-testid="pt-tr-slot" aria-hidden>
      <span className="pt-tr-slot-ring" />
      {item.iconUrl && !failed
        ? <img className="pt-tr-item-icon" data-testid="pt-tr-item-icon" src={item.iconUrl} alt="" draggable={false} onError={() => setFailed(true)} />
        : <span className="pt-tr-item-icon pt-tr-item-icon--none">{item.name.slice(0, 1)}</span>}
    </span>
  );
}

/** Rank pips like an ability's in game: kept ranks steady, gained ranks lighting one by one. */
function RankPips({ from, to, count }: { from: number; to: number; count: number }) {
  const n = Math.max(1, Math.min(8, Math.max(count, to)));
  return (
    <span className="pt-tr-pips" aria-hidden data-testid="pt-tr-pips">
      {Array.from({ length: n }, (_, i) => {
        const rank = i + 1;
        const state = rank <= from ? "kept" : rank <= to ? "gained" : "empty";
        return <i key={rank} data-state={state} style={{ "--pt-i": Math.max(0, rank - from - 1) } as CSSProperties} />;
      })}
    </span>
  );
}

function TransitionBody({ round, slice, onContinue, continueLabel }: {
  round: PtRoundView;
  slice: PtSliceStageView & { kind: "rank_up" | "equipped" };
  onContinue: (source?: "key") => void;
  continueLabel: string;
}) {
  const reducedMotion = useReducedMotionPreference();
  const animate = !reducedMotion;
  const coarse = useCoarsePointer();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { settled, advanceFromClick } = useSettledAdvance({
    buttonRef,
    settleMs: animate ? TRANSITION_READY_MS : TRANSITION_READY_REDUCED_MS,
    onAdvance: onContinue,
  });

  const kind = slice.kind;
  const to = round.rank ?? 0;
  const from = slice.previous?.rank ?? Math.max(1, to - 1);
  const item = kind === "equipped" ? slice.item : null;
  const effect = cooldownChangeText(kind, slice.abilityHaste);
  const title = TRANSITION_TITLE[kind];
  const change = kind === "rank_up"
    ? rankStepText(from, to)
    : `${item?.name ?? "Item"} ${hasteText(slice.abilityHaste)}`;
  const announcement = `${title}. ${round.championName} ${round.slot}, ${round.abilityName}. ${change}. ${effect}. ${ADJUST_TIMING_TEXT}.`;

  return (
    <section className="pt-transition" data-testid="pt-transition" data-kind={kind}
      data-animate={animate ? "true" : "false"} data-ready={settled ? "true" : "false"} aria-label={title}>
      <div className="pt-tr-card">
        <HeroArt src={round.splashUrl} />
        <span className="pt-tr-burst" aria-hidden />

        <div className="pt-tr-anchor" data-testid="pt-tr-anchor">
          <span className="pt-tr-icon" data-testid="pt-tr-icon">
            <SubjectArt media={round.iconUrl ? { src: round.iconUrl, alt: "" } : null} monogram={round.slot} className="h-full w-full" />
          </span>
          {item ? <ItemSlot item={item} /> : null}
        </div>

        <div className="pt-tr-copy">
          <p className="pt-tr-title" data-testid="pt-tr-title">{title}</p>
          <p className="pt-tr-subject" data-testid="pt-tr-subject">
            <b>{round.championName}</b>
            <span className="pt-tr-slotkey" aria-hidden>{round.slot}</span>
            <span className="pt-tr-ability">{round.abilityName}</span>
          </p>

          {kind === "rank_up" ? (
            <p className="pt-tr-change" data-testid="pt-tr-change" data-kind="rank_up">
              <span className="pt-tr-from" data-testid="pt-tr-from">Rank {from}</span>
              <span className="pt-tr-arrow" aria-hidden>→</span>
              <span className="pt-tr-to" data-testid="pt-tr-to">Rank {to}</span>
            </p>
          ) : (
            <p className="pt-tr-change" data-testid="pt-tr-change" data-kind="equipped">
              <span className="pt-tr-item" data-testid="pt-tr-item-name">{item?.name ?? "Item"}</span>
              <span className="pt-tr-haste" data-testid="pt-tr-haste">{hasteText(slice.abilityHaste)}</span>
            </p>
          )}

          {/* One focal message per transition. Rank up: the rank change, with the ability-style pips
              as its only companion. Equipped: the item and its haste, with the rank as a quiet line. */}
          {kind === "rank_up" ? (
            <p className="pt-tr-rank" data-testid="pt-tr-rank" data-kind="rank_up">
              <RankPips from={from} to={to} count={round.rankCount} />
            </p>
          ) : (
            <p className="pt-tr-rank" data-testid="pt-tr-rank" data-kind="equipped">
              {rankText(round.rank, round.rankCount)}
            </p>
          )}

          <p className="pt-tr-support" data-testid="pt-tr-support">
            <span className="pt-tr-effect" data-testid="pt-tr-effect">{effect}</span>
            <span className="pt-tr-dash" aria-hidden>—</span>
            <span className="pt-tr-adjust" data-testid="pt-tr-adjust">{ADJUST_TIMING_TEXT}</span>
          </p>

          <div className="pt-tr-actions">
            <button ref={buttonRef} type="button" className="pt-next pt-tr-continue" data-testid="pt-tr-continue"
              aria-disabled={!settled} data-ready={settled ? "true" : "false"}
              onClick={(e) => advanceFromClick(e.detail)}>
              {continueLabel}
            </button>
            <p className="pt-tr-hint" data-testid="pt-tr-hint" data-live={settled ? "true" : "false"}>
              <kbd className="pt-kbd">Space</kbd><span>or</span><kbd className="pt-kbd">Enter</kbd>
              <span>{coarse ? "· or tap" : "· or click"}</span>
            </p>
          </div>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="pt-tr-announce">{announcement}</p>
    </section>
  );
}

export function SliceTransition({ round, onContinue, continueLabel = "Continue" }: {
  /** The stage being entered. */
  round: PtRoundView;
  onContinue: (source?: "key") => void;
  continueLabel?: string;
}) {
  const slice = round.slice ?? null;
  if (!slice || !hasTransition(slice.kind)) return null;
  return <TransitionBody round={round} slice={slice as PtSliceStageView & { kind: "rank_up" | "equipped" }} onContinue={onContinue} continueLabel={continueLabel} />;
}
