/**
 * THE DAILY'S TWO CONTROLS (ARENA1 Step 5).
 *
 * Mounted in `CanonicalArena`'s guidance slot — the seam Step 4 built so a mode
 * can put its own node in the arena's FOCAL region, directly under the question
 * it speaks about, without reproducing the arena around it. The Tutorial's
 * coaching panel is the other caller.
 *
 * There are exactly two, and each exists because the Daily has a beat Ranked
 * genuinely does not:
 *
 * START — a Meta Reflex card that has been REACHED but not begun. Six seconds
 * are for answering, not for parsing a prompt that arrived with the countdown,
 * so the card renders first and the clock starts on a press. Nothing on this
 * surface activates on mount, and the arena's answer tablets are already inert
 * (the adapter withholds `canSelectAnswer` in this phase) — so the gate is a
 * button and a sentence, not a second copy of the card behind a scrim.
 *
 * CONTINUE — a resolved card, held. The backend advances past a card in the
 * same transaction that resolves it, so without a hold the explanation would be
 * replaced by the next prompt in the same frame. The player leaves when THEY
 * are done reading. Ranked has no equivalent because its rounds are shared and
 * the clock moves them on.
 *
 * WHAT THIS IS NOT. It is not a stage, not a shell, not a question surface and
 * not an answer surface. It draws no prompt, no option, no media, no reveal and
 * no explanation — every one of those is the canonical arena's, above it.
 */

import { ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DailyRunControlsProps {
  /** A Meta Reflex card is waiting on a deliberate press. */
  reflexGate: boolean;
  /** A resolved card is being held for reading. */
  onContinue: (() => void) | null;
  continueLabel: string;
  busy: boolean;
  onActivate: () => void;
}

export function DailyRunControls({
  reflexGate, onContinue, continueLabel, busy, onActivate,
}: DailyRunControlsProps) {
  if (!reflexGate && !onContinue) return null;
  return (
    <section data-testid="dc-controls" className="space-y-2">
      {reflexGate && (
        <div
          data-testid="dc-reflex-gate"
          className="flex flex-col items-center gap-2 rounded-md border border-amber-400/30
                     bg-amber-500/10 p-3 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            Six seconds
          </p>
          <p className="text-xs text-muted-foreground">
            Read the card. The clock starts when you do.
          </p>
          <Button type="button" data-testid="dc-reflex-start" onClick={onActivate}
            disabled={busy} className="gap-1.5">
            <Zap className="h-4 w-4" aria-hidden="true" />
            {busy ? "Starting…" : "Start card"}
          </Button>
        </div>
      )}
      {onContinue && (
        <Button type="button" data-testid="dc-continue" onClick={onContinue}
          disabled={busy} className="w-full gap-1.5 sm:w-auto">
          {continueLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </section>
  );
}
