/**
 * The experience's detail surfaces (UX2), shared by Stages, Schedule and
 * Teams: one match detail, one way to show it.
 *
 * DESKTOP: `ContextColumn` is adaptive. A selected match opens it (360 px, or
 * 320 px below 1536 px). With nothing selected it holds the screen's brief
 * only if the reader asked for it, and otherwise folds to a 48 px rail, so a
 * bracket, the Swiss map or a day's fixtures get the width. The choice is
 * remembered for the session.
 *
 * PHONE: `BottomSheet` (a focus-trapped Radix dialog with drag-to-dismiss),
 * used by the match sheet and the Teams sheet. Close, drag down, overlay tap,
 * Escape and Back all dismiss it.
 *
 * NEITHER SCROLLS (UX4). The column is the workspace's height and the sheet
 * is capped below the screen's; what they hold compacts, then divides into
 * views, to fit (`fit.tsx`).
 */
import { useCallback, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { useKit } from "@/components/pro-play/tournament/TournamentParts";
import { cn } from "@/lib/utils";

import { useExperience } from "./ExperienceContext";
import { MatchDetail } from "./MatchDetail";
import { DURATION, OFFSET, slideTransition } from "./motion";
import { SURFACE } from "./parts";

const BRIEF_KEY = "ux2.contextBrief";

function readBrief() {
  try {
    return window.sessionStorage.getItem(BRIEF_KEY) === "open";
  } catch {
    return false;
  }
}

/** Whether the reader keeps the brief open (per session; closed by default). */
export function useBriefPreference() {
  const [open, setOpen] = useState(readBrief);
  const set = useCallback((v: boolean) => {
    setOpen(v);
    try {
      window.sessionStorage.setItem(BRIEF_KEY, v ? "open" : "closed");
    } catch {
      /* storage unavailable: the choice lasts for this view */
    }
  }, []);
  return [open, set] as const;
}

export function ContextColumn({ brief, briefLabel, briefKey }: {
  brief: ReactNode;
  /** "Play-In brief", "Day brief". */
  briefLabel: string;
  /** Changes when the brief's subject changes (stage, day). */
  briefKey: string;
}) {
  const kit = useKit();
  const x = useExperience();
  const match = x.loc.matchId ? (kit.byId.get(x.loc.matchId) ?? null) : null;
  const [briefOpen, setBriefOpen] = useBriefPreference();
  const open = Boolean(match) || briefOpen;
  const key = match ? `match:${match.match_id}` : open ? `brief:${briefKey}` : "rail";
  return (
    <aside
      className={cn(
        SURFACE,
        "relative min-h-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none",
        open ? "w-[320px] 2xl:w-[360px]" : "w-12",
      )}
      data-testid="context-panel"
      data-mode={match ? "match" : open ? "brief" : "collapsed"}
      aria-label={match ? "Match detail" : briefLabel}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={key}
          initial={x.reduced ? { opacity: 0 } : { opacity: 0, x: OFFSET.panel }}
          animate={{ opacity: 1, x: 0 }}
          exit={x.reduced ? { opacity: 0 } : { opacity: 0, x: -OFFSET.panel / 2 }}
          transition={slideTransition(DURATION.panel, x.reduced)}
          className={cn("flex h-full flex-col", open ? "w-[318px] 2xl:w-[358px]" : "w-full")}
        >
          {match ? (
            <MatchDetail match={match} onClose={() => x.selectMatch(null)} />
          ) : open ? (
            <div className="relative flex h-full flex-col">
              {brief}
              <button
                type="button"
                onClick={() => setBriefOpen(false)}
                aria-label={`Hide ${briefLabel.toLowerCase()}`}
                aria-expanded="true"
                data-testid="brief-toggle"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
              >
                <PanelRightClose className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBriefOpen(true)}
              aria-label={`Show ${briefLabel.toLowerCase()}`}
              aria-expanded="false"
              data-testid="brief-toggle"
              className="flex h-full w-full flex-col items-center gap-3 pt-4 text-muted-foreground outline-none transition-colors hover:bg-white/[0.03] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c9a84c]"
            >
              <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
              <span className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.22em] [writing-mode:vertical-rl]">{briefLabel}</span>
            </button>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}

/* ── phone sheet ────────────────────────────────────────────────────────── */

export function BottomSheet({ open, onClose, title, testId, fill = false, children }: {
  open: boolean;
  onClose: () => void;
  /** Read by screen readers as the dialog's name. */
  title: string;
  testId: string;
  /** A fixed height (content with views and pages) instead of the content's own, up to the cap. */
  fill?: boolean;
  children: ReactNode;
}) {
  const x = useExperience();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 96 || info.velocity.y > 600) onClose();
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" data-testid="sheet-overlay" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-[61] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 motion-reduce:animate-none"
          data-testid={testId}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <motion.div
            drag={x.reduced ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            // UX4: the sheet never outgrows the screen and never scrolls
            // inside; what it holds is composed to fit (views, pages).
            className={cn(
              "mx-auto flex max-h-[min(88dvh,46rem)] w-full max-w-lg flex-col overflow-clip rounded-t-3xl border border-b-0 border-white/10 bg-[hsl(214_50%_8%)] pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)]",
              fill && "h-[min(88dvh,46rem)]",
            )}
          >
            <div className="flex shrink-0 justify-center pb-1 pt-2.5" aria-hidden="true">
              <span className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The selected match (Stages or Schedule) on a phone. */
export function MatchSheet() {
  const kit = useKit();
  const x = useExperience();
  const match = x.loc.matchId ? (kit.byId.get(x.loc.matchId) ?? null) : null;
  const close = () => x.selectMatch(null);
  return (
    <BottomSheet open={Boolean(match)} onClose={close} title="Match detail" testId="match-sheet">
      {match && <MatchDetail match={match} onClose={close} />}
    </BottomSheet>
  );
}
