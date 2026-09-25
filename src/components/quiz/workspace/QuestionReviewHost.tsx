/**
 * HISTORY-D — the responsive HOST for the question inspector.
 *
 * `QuestionReviewCard` is the approved inspector and this file never touches
 * what it says. What changes by device is only where the card is shown:
 *
 * * **Pointer-fine (mouse, trackpad):** the anchored Radix `Popover` that
 *   `QuestionTimeline` has always used — unchanged.
 * * **Coarse pointer (touch):** a modal bottom sheet. An anchored 460px card
 *   over a thumb-sized icon on a 375px screen covers the row it describes,
 *   dismisses on the scroll gesture meant to read it, and has no close
 *   control a finger can hit. The sheet is modal (focus trapped, page scroll
 *   locked by Radix Dialog), has an explicit 44px close, scrolls its own body,
 *   clears the safe-area insets, and hands focus back to the icon that opened
 *   it.
 *
 * The sheet is composed from the app's own Sheet primitives (Radix Dialog) —
 * not `SheetContent`, whose built-in 16px close and dark `bg-background` are
 * wrong for a parchment inspector.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Sheet, SheetClose, SheetOverlay, SheetPortal, SheetTitle } from "@/components/ui/sheet";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import QuestionReviewCard from "@/components/quiz/workspace/QuestionReviewCard";
import type { ReviewRound } from "@/lib/ranked-public/contracts";

const COARSE_QUERY = "(pointer: coarse)";

function readCoarse(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(COARSE_QUERY)?.matches);
}

/** Live `(pointer: coarse)` — the PRIMARY pointer is a finger. A touch laptop
 *  whose primary pointer is its trackpad stays on the Popover. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(readCoarse);
  useEffect(() => {
    const mq = window.matchMedia?.(COARSE_QUERY);
    const sync = () => setCoarse(readCoarse());
    sync();
    mq?.addEventListener?.("change", sync);
    return () => mq?.removeEventListener?.("change", sync);
  }, []);
  return coarse;
}

/**
 * How many icons fit on one line of `ref`'s width, capped at `max`.
 *
 * The product's five-per-page stands wherever five fit. On a narrow row with
 * 44px touch targets they do not, and the honest answer is a shorter page —
 * not a track that overflows its row or icons shrunk below a finger. Without
 * a layout (jsdom, first paint) the answer is `max`.
 */
export function useFittingPageSize(
  ref: RefObject<HTMLElement>,
  { max, slot, gap, reserved }: { max: number; slot: number; gap: number; reserved: number },
): number {
  const [size, setSize] = useState(max);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return setSize(max);
      const fit = Math.floor((width - reserved + gap) / (slot + gap));
      setSize(Math.max(1, Math.min(max, fit)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, max, slot, gap, reserved]);
  return size;
}

export function QuestionReviewSheet({
  round,
  position,
  total,
  label,
  onClose,
  returnFocusTo,
}: {
  /** The round on review, or null when the sheet is closed. */
  round: ReviewRound | null;
  position: number;
  total: number;
  /** The accessible name — the same label the opening icon carries. */
  label: string;
  onClose: () => void;
  /** The icon that opened the sheet. Focused explicitly on close: a tapped
   *  button is not focused on every mobile browser, so Radix's own "restore
   *  what was focused" can land on the page body. */
  returnFocusTo: () => HTMLElement | null;
}) {
  return (
    <Sheet open={round !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetPortal>
        {/* No enter/exit animation, for the same reason the Popover has none:
            Radix Presence keeps a closing layer mounted until `animationend`,
            which a backgrounded tab may never fire. Instant is also the
            reduced-motion answer, so neither preference needs a branch. */}
        <SheetOverlay className="!animate-none bg-black/60" data-testid="question-review-sheet-overlay" />
        <DialogPrimitive.Content
          data-testid="question-review-sheet"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            const target = returnFocusTo();
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
          className="lc-vellum lc-vellum--card fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-[32rem] flex-col rounded-t-md border border-b-0 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] !animate-none focus:outline-none"
          style={{
            borderColor: LEAGUECRAFT_INK.rule,
            boxShadow: "0 -18px 40px -24px rgba(0,0,0,0.7)",
          }}
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <div className="flex shrink-0 justify-end px-1 pt-1">
            <SheetClose
              data-testid="question-review-sheet-close"
              aria-label="Close question review"
              className="flex h-11 w-11 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ color: LEAGUECRAFT_INK.brass }}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </SheetClose>
          </div>
          <div
            data-testid="question-review-sheet-body"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {round && <QuestionReviewCard round={round} position={position} total={total} />}
          </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
