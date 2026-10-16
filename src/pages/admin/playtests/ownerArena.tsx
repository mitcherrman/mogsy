/**
 * UGMP — the pieces every owner lab mode shares, so Rangefinder, Glyph Press,
 * Stat Drop, Combat Estimate and Perfect Timing read as one experience inside the real
 * `CanonicalArena`: the way back to Playtests at the head of the arena's chrome
 * row, the rails, and the session's loading and failure states.
 */
import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { useStageRoom } from "@/components/interaction-grammar/useStageRoom";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { PLAYTESTS_HUB_ROUTE, LAB_MODES, type LabModeId } from "@/lib/playtests/modes";

/** The honest label for the server-validated prototypes (their grader is the backend's). */
export const SERVER_PROTOTYPE_NOTE = "Prototype · server-validated · unrated";

/** Below this the instrument would be unusable; the page scrolls instead. */
export const PHONE_ROOM_FLOOR_PX = 380;

/**
 * The room a measured-height primitive (Rangefinder, Glyph Press) may spend.
 *
 * From `lg` up the arena's stage is definite and `useStageRoom` reads it. Below
 * `lg` an arena whose flanks are panels (as every owner lab's are) stacks and
 * its stage is CONTENT-sized, so measuring it is circular: the primitive would
 * be handed its own collapsed height. There the room is what the viewport
 * leaves under the stage's top edge, never less than a usable floor.
 */
export function useOwnerStageRoom(ref: RefObject<HTMLElement | null>, phoneReservePx = 0): number | undefined {
  const measured = useStageRoom(ref);
  const [phoneRoom, setPhoneRoom] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const read = () => {
      const stage = ref.current?.closest<HTMLElement>(".ranked-question-stage");
      if (desktop.matches || !stage) { setPhoneRoom(undefined); return; }
      const cs = getComputedStyle(stage);
      const top = stage.getBoundingClientRect().top + window.scrollY;
      // PGM2: a host whose dock tabs float at the foot of a phone (Report,
      // Rules) reserves that band, so the instrument's own controls stay clear.
      const room = Math.floor(window.innerHeight - top - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 12 - phoneReservePx);
      setPhoneRoom(Math.max(PHONE_ROOM_FLOOR_PX, room));
    };
    read();
    window.addEventListener("resize", read);
    desktop.addEventListener?.("change", read);
    return () => {
      window.removeEventListener("resize", read);
      desktop.removeEventListener?.("change", read);
    };
  }, [ref, phoneReservePx]);
  return phoneRoom ?? measured;
}

/**
 * The chrome row's lead: back to Playtests, then the mode's name. `bare` (PT4.4,
 * the fixed-screen Perfect Timing) is the way back alone.
 */
export function PlaytestLead({ mode, bare = false }: { mode: LabModeId; bare?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-2" data-testid="playtest-lead">
      <Link
        to={PLAYTESTS_HUB_ROUTE}
        data-testid="playtest-back"
        className="inline-flex min-h-[28px] items-center gap-1 rounded border border-[#d5b66f]/40 px-2 py-0.5 text-[11px] text-[#f6e6bb] hover:border-[#d5b66f]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> Playtests
      </Link>
      {bare ? null : <span className="ranked-eyebrow shrink-0" data-testid="playtest-mode-title">{LAB_MODES[mode].title}</span>}
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
