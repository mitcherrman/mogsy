/**
 * Compact Item Cost Duel segment result (Phase 2 compact layout).
 *
 * The full SegmentTranscript is an owner-playtest reading surface: rendered in
 * the live flow it stacked ~360px of table under the NEXT active round and
 * pushed the controls below the fold. This banner shows the head-to-head
 * outcome in one reserved row; the complete challenge-by-challenge transcript
 * stays available behind an explicit Details expansion (the unchanged
 * SegmentTranscript — canonical data is deferred, never dropped).
 *
 * A new settlement always starts collapsed — the full table can never mount
 * under a live question on its own. The expansion may also be CONTROLLED
 * (`open` + `onOpenChange`), which is how the live arena keeps the banner
 * mounted past the reveal beat while the player has Details open; a controlled
 * parent owns the collapse-on-new-segment reset.
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, Hourglass, MinusCircle, XCircle } from "lucide-react";
import type { SegmentResult } from "@/lib/ranked-public/contracts";
import {
  SegmentTranscript,
  SegmentTranscriptProps,
  segmentTitle,
} from "./SegmentTranscript";

const RESULT_LABEL: Record<SegmentResult, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  timeout: "Timeout",
};

/** RA10 combat-log glyphs: decorative, the copy beside them is unchanged. */
const RESULT_ICON: Record<SegmentResult, React.JSX.Element> = {
  win: <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" />,
  loss: <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#e2757b]" />,
  draw: <MinusCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  timeout: <Hourglass aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
};

export function SegmentResultBanner(
  props: SegmentTranscriptProps & {
    /** Controlled expansion. Omit for the original self-managed behaviour. */
    open?: boolean;
    /** Fired on every toggle, controlled or not. */
    onOpenChange?: (open: boolean) => void;
  },
) {
  const { reveal, viewerUserId, opponentUserId, damageDealt = null } = props;
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = props.open !== undefined;
  const open = controlled ? props.open! : selfOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setSelfOpen(next);
    props.onOpenChange?.(next);
  };
  // A NEW settlement always starts collapsed (render-time reset, no effect
  // tick): the full transcript never carries over beneath a later round. Only
  // for the UNCONTROLLED shape — a controlled parent owns its own reset.
  const [seen, setSeen] = useState(reveal);
  if (seen !== reveal) {
    setSeen(reveal);
    if (!controlled) setSelfOpen(false);
  }
  const you = reveal.players[viewerUserId];
  const them = opponentUserId ? reveal.players[opponentUserId] : undefined;
  if (!you) return null;
  const total = reveal.challengeCount;
  const title = segmentTitle(reveal);

  return (
    <section
      aria-label={`${title} result`}
      data-testid="icd-result-banner"
      className="ranked-panel px-3 py-2 sm:px-4"
    >
      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold" data-testid="icd-banner-result">
          {you.segmentResult && RESULT_ICON[you.segmentResult]}
          <span>{title} — {you.segmentResult ? RESULT_LABEL[you.segmentResult] : "resolved"}</span>
        </span>
        <span data-testid="icd-banner-you" className="text-muted-foreground sm:border-l sm:border-white/10 sm:pl-3">
          <span className="font-semibold text-foreground">You</span>{" "}
          <span className="tabular-nums">{you.correct}/{total} correct</span>
          {damageDealt !== null && (
            <span className="tabular-nums text-[#e8c97a]"> · {damageDealt} dmg</span>
          )}
        </span>
        {them && (
          <span data-testid="icd-banner-opponent" className="text-muted-foreground sm:border-l sm:border-white/10 sm:pl-3">
            <span className="font-semibold text-foreground">Opponent</span>{" "}
            <span className="tabular-nums">{them.correct}/{total} correct</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-testid="icd-details-toggle"
          className="ml-auto inline-flex min-h-[1.75rem] items-center gap-1 rounded px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Details
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      {open && (
        <div className="mt-2 border-t border-border pt-2">
          <SegmentTranscript {...props} />
        </div>
      )}
    </section>
  );
}
