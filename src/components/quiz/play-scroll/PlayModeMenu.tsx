/**
 * PLAY1 — the three clauses of the match-entry record.
 *
 * Ranked Match, Daily Challenge, Invite, written as ILLUMINATED clauses: a
 * compact League thumbnail in the margin, a heading in small capitals, the
 * option's name, a marginal note, one line of whatever the academy actually
 * knows about that entry today, and a struck seal to press.
 *
 * WHY EACH ONE IS A PAINTED ENTRY AND NOT A ROW
 * ─────────────────────────────────────────────
 * These are the three ways to PLAY. Drawn as ruled rows they read as a
 * settings list — three lines of the same weight, distinguishable only by
 * their words, with nothing to tell the eye which is the competitive one. The
 * thumbnail does that work before a word is read, and the per-mode accent
 * carries it into the frame: Ranked takes gold and the strongest rule, Daily
 * a scholar's slate, Invite a muted arcane plum. The parchment still
 * dominates all three — no card here introduces a second material.
 *
 * THE ART IS A THUMBNAIL, NOT A SPLASH. It is an anchor at the size of an
 * icon: enough League identity to tell the three entries apart at a glance,
 * deliberately not enough to turn a written clause into a framed painting.
 * The card carries the illumination; the plate is a clean inset beside it.
 *
 * RANKED IS FIRST AND HEAVIEST, deliberately. It carries `data-emphasis`,
 * which is what buys it the deeper wash, the brighter rim and the only
 * standing glow on the sheet.
 *
 * ALL THREE ARE FIRST-CLASS. None of them is greyed, hidden behind a "soon"
 * ribbon, or drawn as scaffolding. Where a mode's SERVER side is not finished
 * — Ranked invites — the honest statement belongs inside that mode's own
 * view, next to the action it affects, not stamped across its entry here.
 *
 * The list, its order and its copy come from `@/lib/quiz/playModes`; this file
 * names no mode itself. Which of them appear is the admin policy's decision,
 * resolved by the host and handed in as `modes` — see `playModeVisibility`.
 *
 * THE MARK IS A LINE OF THE RECORD, NOT A ROW OF CHIPS
 * ────────────────────────────────────────────────────
 * It used to be bordered pills. Three little outlined tags under a written
 * clause read as a dashboard widget dropped onto a manuscript — the one thing
 * on the sheet that was not written on it. So the mark is now plain inline
 * text in the record's own ink, and colour is the only thing that separates
 * its parts: the label in body ink, the figure in the entry's accent, the
 * tier in that tier's own metal.
 *
 * REAL STATE OR NOTHING:
 *   Ranked   the account's rating and its earned tier.
 *   Daily    today's real streak, and nothing else.
 *   Invite   nothing — the roster is not read until the player opens Invite,
 *            so a count here would either be a guess or a reason to query
 *            every account's friendships on open.
 * A figure that is not known is absent. Nothing here is zero-filled, and no
 * mark states anything the backend has not said. In particular the Ranked
 * mark says the account's TIER and not "your role rating": the progression
 * contract is account-level (`RankedProgressionView` carries no role), so a
 * per-role claim would be a sentence the server never made.
 */

import { ArrowRight, Check, Flame, GraduationCap } from "lucide-react";
import type { PlayModeDescriptor, PlayModeId } from "@/lib/quiz/playModes";
import { rankedTierLabel } from "@/lib/progression/rankedArt";
import type { RankTier } from "@/lib/progression/tiers";
import PlayModePlate from "./PlayModePlate";
import { PLAY_INK as INK } from "./ink";

/**
 * The one line of state a clause carries.
 *
 * Four named fields rather than a generic list of chips, because each part
 * has exactly one presentation and the presentation IS the meaning: the label
 * is quiet, the figure takes the entry's accent, the tier takes its own
 * metal, the streak takes the flame. A caller cannot ask for a tier rendered
 * as a figure, and adding a fifth kind of mark is a change to this file.
 */
export interface PlayModeDetail {
  /** The quiet word before a figure — "Rating". */
  label?: string | null;
  /** The figure itself. Takes the entry's accent. */
  figure?: string | null;
  /** An EARNED tier, drawn in that tier's own metal. */
  tier?: RankTier | null;
  /** Days. Only the Daily clause ever sets it. */
  streak?: number | null;
}

/**
 * A clause that has already been DONE today.
 *
 * A completed entry is not a disabled button — it is a different thing on the
 * page. It is drawn as a PANEL: no `<button>`, no `disabled`, no pointer, no
 * hover, and no way for a click anywhere on it to reach `onSelect`. What it
 * offers instead is one ordinary action inside it, which is the only
 * interactive thing in the slot.
 *
 * WHY NOT `<button disabled>` WITH A LINK INSIDE
 * ─────────────────────────────────────────────
 * Because that is a nested interactive control, which is invalid HTML and
 * genuinely broken in practice: a disabled button removes its whole subtree
 * from the tab order in several browsers, so the one action a completed
 * clause exists to offer would become unreachable by keyboard. The panel has
 * no interactive ancestor at all, so the action is an ordinary tab stop.
 *
 * The copy lives with whatever OWNS the state — the record, which is the only
 * thing that knows what "done" means for a given mode. This file only knows
 * that a completed clause is a panel with a heading, a line, and at most one
 * action.
 */
export interface PlayModeCompletion {
  /** Replaces the clause's title. */
  heading: string;
  /** Replaces the clause's note. */
  note: string;
  /** The one interactive thing in the slot, or nothing. */
  action: { label: string; onSelect: () => void } | null;
}

/** Whether a clause has anything real to say today. */
function hasMark(detail: PlayModeDetail | undefined): detail is PlayModeDetail {
  if (!detail) return false;
  return (
    Boolean(detail.figure) ||
    Boolean(detail.tier) ||
    (typeof detail.streak === "number" && detail.streak > 0)
  );
}

export default function PlayModeMenu({
  modes,
  details,
  onSelect,
  busyMode = null,
  completed = {},
  onPlayPractice,
  practiceIconSrc = null,
}: {
  /** Already filtered and ordered by the host from the admin policy. */
  modes: readonly PlayModeDescriptor[];
  details: Partial<Record<PlayModeId, PlayModeDetail>>;
  onSelect: (id: PlayModeId) => void;
  /** The clause whose action is in flight. Blocks a second activation. */
  busyMode?: PlayModeId | null;
  /**
   * Clauses that are already DONE for today, and what they say instead.
   *
   * A mode listed here is drawn as a panel rather than a button and can never
   * reach `onSelect` — see `PlayModeCompletion`. Resolved by the record from
   * state it already holds, never discovered by trying.
   */
  completed?: Partial<Record<PlayModeId, PlayModeCompletion>>;
  /**
   * Take the player to the lobby's Practice section. Omit and the footer is
   * not drawn at all — a link with nowhere to go is worse than no link.
   */
  onPlayPractice?: () => void;
  /**
   * The footer's mark. A small square asset supplied by the owner; when there
   * is none the slot falls back to a struck glyph at the same size, so the
   * geometry does not move when the real art arrives.
   */
  practiceIconSrc?: string | null;
}) {
  if (modes.length === 0) {
    // Every entry is withheld by policy. The record still has to say
    // something — an empty sheet reads as a broken page.
    return (
      <p
        data-testid="play-scroll-no-modes"
        className="py-6 text-center text-[12.5px] font-semibold leading-snug"
        style={{ color: INK.body }}
      >
        The academy isn't taking match entries right now. Check back shortly.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2" data-testid="play-scroll-modes">
      {modes.map((mode, index) => {
        const busy = busyMode === mode.id;
        const detail = details[mode.id];
        const done = completed[mode.id];

        // ── The clause is already done for today ──────────────────────────
        // A PANEL, not a disabled button. There is no `onSelect` reachable
        // from anywhere on it, and the one action it offers is an ordinary
        // control with no interactive ancestor. Same slot, same frame, same
        // accent, same plate — so nothing on the sheet moves when a day is
        // finished. See `PlayModeCompletion`.
        if (done) {
          return (
            <li key={mode.id}>
              <div
                data-testid={`play-mode-${mode.id}-complete`}
                data-mode={mode.id}
                data-complete="true"
                className="play-scroll-clause play-mode-card play-mode-card--done"
              >
                {/* `soft`, never `muted`: the day was COMPLETED. A drained
                    thumbnail is what a broken feature looks like. */}
                <PlayModePlate mode={mode.id} size="card" tone="soft" />

                <span className="play-mode-card__text">
                  <span
                    className="play-mode-card__title"
                    style={{ textShadow: INK.press }}
                  >
                    {done.heading}
                  </span>
                  <span className="play-mode-card__note">{done.note}</span>

                  {hasMark(detail) && typeof detail.streak === "number"
                    && detail.streak > 0 && (
                    <span
                      data-testid={`play-mode-${mode.id}-detail`}
                      className="play-mode-card__meta"
                    >
                      <span className="play-mode-card__streak">
                        <Flame
                          className="play-mode-card__flame"
                          aria-hidden="true"
                        />
                        {detail.streak}-day streak
                      </span>
                    </span>
                  )}

                  {done.action !== null && (
                    <button
                      type="button"
                      data-testid={`play-mode-${mode.id}-action`}
                      onClick={done.action.onSelect}
                      className="play-mode-card__practice"
                    >
                      {done.action.label}
                    </button>
                  )}
                </span>

                {/* The seal, struck rather than pressable. It is the same disc
                    in the same place as the arrow it replaces, so the slot's
                    geometry is untouched — a completed day changes what the
                    card SAYS, never where anything sits. Decorative: the
                    heading beside it already says the day is done. */}
                <span
                  className="play-mode-card__seal play-mode-card__seal--done"
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </div>
            </li>
          );
        }

        return (
          <li key={mode.id}>
            <button
              type="button"
              data-testid={`play-mode-${mode.id}`}
              data-mode={mode.id}
              /* The first written entry is the record's principal clause. It
                 is index-based rather than id-based so the emphasis follows
                 the ORDER the policy leaves behind: withhold Ranked and the
                 remaining head of the list is still the head of the list. */
              data-emphasis={index === 0 ? "true" : undefined}
              aria-busy={busy}
              disabled={busyMode !== null}
              onClick={() => onSelect(mode.id)}
              className="play-scroll-clause play-mode-card group disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PlayModePlate mode={mode.id} size="card" />

              <span className="play-mode-card__text">
                <span
                  className="play-mode-card__title"
                  style={{ textShadow: INK.press }}
                >
                  {mode.title}
                </span>
                <span className="play-mode-card__note">
                  {busy ? "Opening…" : mode.note}
                </span>

                {hasMark(detail) && (
                  <span
                    data-testid={`play-mode-${mode.id}-detail`}
                    className="play-mode-card__meta"
                  >
                    {detail.label && (
                      <span className="play-mode-card__meta-label">
                        {detail.label}
                      </span>
                    )}
                    {detail.figure && (
                      <span className="play-mode-card__meta-figure">
                        {detail.figure}
                      </span>
                    )}
                    {detail.tier && (
                      <span
                        className="play-mode-card__meta-tier"
                        data-tier={detail.tier}
                      >
                        {rankedTierLabel(detail.tier)}
                      </span>
                    )}
                    {typeof detail.streak === "number" && detail.streak > 0 && (
                      <span className="play-mode-card__streak">
                        {/* The flame is decorative — the streak is written out
                            beside it — so it is allowed the one genuinely RED
                            tone on the sheet, and the one rare glint. */}
                        <Flame
                          className="play-mode-card__flame"
                          aria-hidden="true"
                        />
                        {detail.streak}-day streak
                      </span>
                    )}
                  </span>
                )}
              </span>

              {/* The seal. A struck disc rather than a chevron: this is the
                  thing you press, and on a record a press leaves a mark.
                  Decorative — the button's own name is its written title. */}
              <span className="play-mode-card__seal" aria-hidden="true">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          </li>
        );
      })}
      </ul>

      {/*
       * PRACTICE — a footer, deliberately not a fourth mode.
       *
       * The record is a CHOICE between three ways to play; practice is not one
       * of them, it is the thing to do instead of playing. So it sits outside
       * the list entirely, under a rule, with no frame, no plate, no accent
       * and no supporting line — a struck link with a mark beside it, at a
       * weight that reads as secondary at a glance.
       *
       * IT IS NOT ROUTED THROUGH DAILY CHALLENGE. It calls the host's practice
       * handoff directly — the same one the completed Daily clause offers — so
       * the Daily workstream can replace everything about that mode without
       * this footer noticing. It commits no role: practice does not queue.
       */}
      {onPlayPractice && (
        <div className="play-scroll-footer">
          <button
            type="button"
            data-testid="play-scroll-practice"
            onClick={onPlayPractice}
            className="play-scroll-practice"
          >
            {/* The owner's mark goes here. Until a file is supplied the slot
                is a struck roundel with a glyph rather than an invented
                picture — it holds the exact geometry the art will take, so
                dropping the asset in later moves nothing. */}
            <span className="play-scroll-practice__mark" aria-hidden="true">
              {practiceIconSrc ? (
                <img src={practiceIconSrc} alt="" />
              ) : (
                <GraduationCap className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="play-scroll-practice__label">Practice Questions</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
