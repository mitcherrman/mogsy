/**
 * HUB4 — the Ranked Hub's lower workspace, as ONE History surface.
 *
 * It used to be three peer tabs — History | Review | Trends. That shell is
 * gone. History is the surface; Review and Trends are capabilities inside it:
 *
 *   * the record itself — completed Daily runs (Daily → Stage → Question),
 *     then the existing Ranked and Practice ledger — is always what is shown;
 *   * Owned / Missed, what the Review tab held, is a contextual section the
 *     reader opens from History, with its loaders, entitlement lines and
 *     practice actions unchanged;
 *   * run and stage comparison, what Trends was for, lives in each Daily
 *     run's and stage's own Premium expansion (HUB2 authority).
 *
 * The sheet is the same flat vellum it always was — a record book, not a
 * dashboard — with no strip of tabs across its top.
 *
 * ADDRESSABLE, AND OLD LINKS STILL LAND
 * ─────────────────────────────────────
 * `#history` opens the record. `#review` and `#trends` are legacy links from
 * results screens and older builds; the hub maps each to the History context
 * it meant (the Owned/Missed section; the newest run's analysis) and then
 * canonicalises the URL to `#history` with `replace`, so the back button does
 * not step through a hash that no longer names anything.
 */
import { useEffect, useId, useRef } from "react";
import { BookX, ChevronDown } from "lucide-react";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import { useCoarsePointer } from "@/components/quiz/workspace/QuestionReviewHost";

/** What a workspace hash asks for. Only `history` is canonical. */
export type HistoryHashTarget = "history" | "review" | "trends";

const HASH_TARGETS: readonly HistoryHashTarget[] = ["history", "review", "trends"];

export const HISTORY_HASH = "#history";

/** `#history`, and the two legacy hashes that now resolve into it. Anything
 *  else is not the workspace's, and returns null. */
export function parseHistoryHash(hash: string | null | undefined): HistoryHashTarget | null {
  const raw = (hash ?? "").replace(/^#/, "").toLowerCase();
  return (HASH_TARGETS as readonly string[]).includes(raw) ? (raw as HistoryHashTarget) : null;
}

export default function LeaguecraftWorkspace({
  questionsOpen,
  onQuestionsOpenChange,
  questionsFocusSignal = null,
  questions,
  children,
  className = "",
}: {
  /** Whether the contextual Owned/Missed section is open. */
  questionsOpen: boolean;
  onQuestionsOpenChange: (open: boolean) => void;
  /** A changing value moves focus to the Owned/Missed section — the legacy
   *  `#review` arrival. */
  questionsFocusSignal?: number | null;
  /** The Owned/Missed body. Rendered only while open, so its account-bound
   *  and Pro-gated reads never run for a reader who did not ask. */
  questions: React.ReactNode;
  /** The record: Daily runs, then the Ranked/Practice ledger. */
  children: React.ReactNode;
  className?: string;
}) {
  const regionId = useId();
  const regionRef = useRef<HTMLElement | null>(null);
  const coarse = useCoarsePointer();

  useEffect(() => {
    if (questionsFocusSignal === null || !questionsOpen) return;
    regionRef.current?.focus({ preventScroll: true });
  }, [questionsFocusSignal, questionsOpen]);

  return (
    <div className={className} data-testid="leaguecraft-workspace" data-surface="history">
      <LobbyPanel variant="vellum" className="gap-2">
        <div className="flex justify-end">
          <button
            type="button"
            aria-expanded={questionsOpen}
            aria-controls={regionId}
            data-testid="history-questions-toggle"
            onClick={() => onQuestionsOpenChange(!questionsOpen)}
            className={`inline-flex items-center gap-1.5 rounded px-1.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              coarse ? "min-h-[44px]" : "py-1"
            }`}
            style={{ color: questionsOpen ? LEAGUECRAFT_INK.heading : LEAGUECRAFT_INK.brass }}
          >
            <BookX className="h-3 w-3" aria-hidden="true" />
            Owned &amp; Missed
            <ChevronDown
              className={`h-3 w-3 transition-transform motion-reduce:transition-none ${questionsOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {questionsOpen && (
          <section
            ref={regionRef}
            id={regionId}
            tabIndex={-1}
            aria-label="Owned and missed questions"
            data-testid="history-questions"
            className="rounded border px-2.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ borderColor: "rgba(96,68,28,0.34)" }}
          >
            {questions}
          </section>
        )}

        <div data-testid="history-record" className="min-h-[9rem] pt-1">
          {children}
        </div>
      </LobbyPanel>
    </div>
  );
}
