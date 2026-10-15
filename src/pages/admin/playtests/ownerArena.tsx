/**
 * UGMP — the pieces every owner lab mode shares, so Rangefinder, Glyph Press,
 * Stat Drop and Combat Estimate read as one experience inside the real
 * `CanonicalArena`: the way back to Playtests at the head of the arena's chrome
 * row, the rails, and the session's loading and failure states.
 */
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PLAYTESTS_HUB_ROUTE, LAB_MODES, type LabModeId } from "@/lib/playtests/modes";

/** The honest label for the server-validated prototypes (their grader is the backend's). */
export const SERVER_PROTOTYPE_NOTE = "Prototype · server-validated · unrated";

/** The chrome row's lead: back to Playtests, then the mode's name. */
export function PlaytestLead({ mode }: { mode: LabModeId }) {
  return (
    <span className="flex shrink-0 items-center gap-2" data-testid="playtest-lead">
      <Link
        to={PLAYTESTS_HUB_ROUTE}
        data-testid="playtest-back"
        className="inline-flex min-h-[28px] items-center gap-1 rounded border border-[#d5b66f]/40 px-2 py-0.5 text-[11px] text-[#f6e6bb] hover:border-[#d5b66f]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> Playtests
      </Link>
      <span className="ranked-eyebrow shrink-0" data-testid="playtest-mode-title">{LAB_MODES[mode].title}</span>
    </span>
  );
}

export function OwnerRail({ title, testId, rows }: { title: string; testId: string; rows: [string, ReactNode][] }) {
  return (
    <aside data-testid={testId} className="ranked-panel hidden h-full flex-col gap-3 p-4 text-[#efe8d6] lg:flex">
      <p className="ranked-eyebrow">{title}</p>
      <dl className="flex flex-col gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-[#a9b3c1]">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

/** Loading / failure of a whole session, in the same dark frame the arena uses. */
export function SessionState({ mode, state, message, onRetry }: {
  mode: LabModeId;
  state: "loading" | "error";
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div data-testid="owner-playtest-state" data-state={state} className="min-h-screen w-full bg-[#050b15] px-4 pb-10 pt-20 text-[#efe8d6]">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <PlaytestLead mode={mode} />
        {state === "loading" ? (
          <p data-testid="owner-playtest-loading" aria-busy className="text-sm text-[#a9b3c1]">Dealing a new session…</p>
        ) : (
          <>
            <p role="alert" data-testid="owner-playtest-error" className="text-sm text-red-300">{message}</p>
            {onRetry ? (
              <button type="button" onClick={onRetry} data-testid="owner-playtest-retry"
                className="min-h-[44px] rounded border border-[#d5b66f] bg-[#2a2110] px-4 text-xs uppercase tracking-[0.14em] text-[#f6e6bb]">
                Try again
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** The chrome row's right side: round counter, then Next / New session. */
export function RoundControls({ index, total, revealed, onNext, onRestart, testIdPrefix }: {
  index: number;
  total: number;
  revealed: boolean;
  onNext: () => void;
  onRestart: () => void;
  testIdPrefix: string;
}) {
  const last = index >= total - 1;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      <span data-testid={`${testIdPrefix}-counter`} className="font-mono tabular-nums opacity-80">
        Round {index + 1} / {total}
      </span>
      {last ? (
        <button type="button" data-testid={`${testIdPrefix}-restart`} onClick={onRestart} disabled={!revealed}
          className="min-h-[28px] whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14] disabled:opacity-40">
          New session
        </button>
      ) : (
        <button type="button" data-testid={`${testIdPrefix}-next`} onClick={onNext} disabled={!revealed}
          className="min-h-[28px] whitespace-nowrap rounded border border-[#d5b66f] bg-[#2a2110] px-2 py-0.5 uppercase tracking-[0.14em] text-[#f6e6bb] hover:bg-[#3a2d14] disabled:opacity-40">
          Next
        </button>
      )}
    </span>
  );
}
