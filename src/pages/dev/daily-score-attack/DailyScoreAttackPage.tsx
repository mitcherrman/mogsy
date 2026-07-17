/**
 * /dev/daily-score-attack — development-only Daily Score Attack prototype.
 *
 * Not linked from any navigation. Consumes the E1.4 backend contracts
 * (commit c771e736) and renders server-authoritative state only. No ads,
 * no sharing, no leaderboard, no classes, no production Daily integration.
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import AdSlot from "@/components/ads/AdSlot";
import { trackFunnelEvent } from "@/lib/funnel-analytics";
import {
  DsaApiError,
  fetchCurrentRun,
  fetchHistory,
  fetchResults,
  fetchToday,
  finalizeRun,
  startOfficialRun,
  startPracticeRun,
  submitAnswer,
} from "./dailyScoreAttackClient";
import DailyScoreAttackGame from "./DailyScoreAttackGame";
import DailyScoreAttackResults from "./DailyScoreAttackResults";
import {
  DailyScoreAttackCountdown,
  DailyScoreAttackEntry,
} from "./DailyScoreAttackEntry";
import {
  DsaAction,
  DsaSession,
  INITIAL_STATE,
  dsaReducer,
} from "./dailyScoreAttackMachine";

const REVEAL_MS = 1400;
const REVEAL_MS_REDUCED = 400;
const RECOVERY_BACKOFF_MS = [1000, 2000, 4000, 8000];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.("change", listener);
    return () => query.removeEventListener?.("change", listener);
  }, []);
  return reduced;
}

async function resolveSession(): Promise<DsaSession> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return "none";
    return user.is_anonymous ? "anonymous" : "account";
  } catch {
    return "none";
  }
}

type PageProps = {
  /** Production surface: no prototype banner, entry/results ads, analytics.
   * The dev route (/dev/daily-score-attack) renders with the default. */
  production?: boolean;
};

export default function DailyScoreAttackPage({ production = false }: PageProps) {
  const [state, dispatch] = useReducer(dsaReducer, INITIAL_STATE);
  const reducedMotion = usePrefersReducedMotion();
  const [announcement, setAnnouncement] = useState("");
  const recoveryAttempt = useRef(0);
  const recoveryInFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback((action: DsaAction) => dispatch(action), []);

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  // Production analytics only; the dev prototype stays silent. Payloads
  // carry no question, choice, or answer content.
  const track = useCallback(
    (event: Parameters<typeof trackFunnelEvent>[0], payload?: Record<string, unknown>) => {
      if (!production) return;
      if (payload === undefined) trackFunnelEvent(event);
      else trackFunnelEvent(event, payload);
    },
    [production],
  );

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof DsaApiError) {
        switch (error.code) {
          case "FEATURE_DISABLED":
            send({ type: "FEATURE_UNAVAILABLE" });
            return;
          case "AUTH_REQUIRED":
          case "ACCOUNT_REQUIRED":
            send({ type: "SIGNED_OUT_GATE" });
            return;
          case "NO_RUN":
            send({ type: "NO_RUN" });
            return;
          case "RUN_EXPIRED":
            if (error.run) {
              send({ type: "RUN_SYNCED", run: error.run });
              return;
            }
            void resync();
            return;
          case "STALE_QUESTION":
          case "OFFICIAL_RUN_ACTIVE":
          case "RUN_TERMINAL":
          case "RUN_ACTIVE":
          case "OFFICIAL_RUN_TERMINAL":
            void resync();
            return;
          case "OFFICIAL_REQUIRED_FIRST":
            send({
              type: "RECOVERABLE_ERROR",
              code: error.code,
              message: "Finish today's official run before practicing.",
            });
            return;
          case "CHALLENGE_UNAVAILABLE":
            send({
              type: "RECOVERABLE_ERROR",
              code: error.code,
              message: "Today's challenge is not available right now.",
            });
            return;
          case "NETWORK":
            send({
              type: "RECOVERABLE_ERROR",
              code: error.code,
              message: "Connection problem. Your run keeps counting down on the server.",
            });
            return;
          default:
            send({
              type: "TERMINAL_ERROR",
              code: error.code,
              message: "Something went wrong with this run.",
            });
            return;
        }
      }
      send({
        type: "TERMINAL_ERROR",
        code: "MALFORMED_RESPONSE",
        message: "Received an unexpected response.",
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send],
  );

  const loadTerminalResults = useCallback(
    async (runId: string, official: boolean) => {
      try {
        const results = await fetchResults(runId);
        send({ type: "RESULTS_LOADED", results });
        track("dsa_results_viewed", { official });
        announce(official ? "Official run finished" : "Practice run finished");
        if (official) {
          try {
            send({ type: "HISTORY_LOADED", history: await fetchHistory() });
          } catch {
            // History is optional; results remain usable without it.
          }
        }
      } catch (error) {
        handleError(error);
      }
    },
    [send, announce, handleError],
  );

  const resync = useCallback(async () => {
    if (recoveryInFlight.current) return;
    recoveryInFlight.current = true;
    send({ type: "RECONCILE_REQUESTED" });
    try {
      const official = stateRef.current.run ? stateRef.current.run.official : true;
      const run = await fetchCurrentRun(official);
      recoveryAttempt.current = 0;
      send({ type: "RUN_SYNCED", run });
      if (run.status !== "active") void loadTerminalResults(run.run_id, run.official);
    } catch (error) {
      if (error instanceof DsaApiError && error.code === "NETWORK") {
        const delay =
          RECOVERY_BACKOFF_MS[
            Math.min(recoveryAttempt.current, RECOVERY_BACKOFF_MS.length - 1)
          ];
        recoveryAttempt.current += 1;
        window.setTimeout(() => {
          recoveryInFlight.current = false;
          void resync();
        }, delay);
        return;
      }
      handleError(error);
    } finally {
      recoveryInFlight.current = false;
    }
  }, [send, handleError, loadTerminalResults]);

  // Initial load: session + metadata (+ current official run when active).
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => {
      const session = await resolveSession();
      send({ type: "SESSION_RESOLVED", session });
      try {
        const meta = await fetchToday(controller.signal);
        send({ type: "METADATA_LOADED", meta });
        if (meta.enabled && meta.official_run?.status === "active" && session === "account") {
          const run = await fetchCurrentRun(true, controller.signal);
          send({ type: "RUN_SYNCED", run });
        } else if (meta.enabled && session !== "none") {
          // Resume an in-progress practice run across refreshes too. Only
          // an ACTIVE run is adopted — terminal practice runs must not
          // hijack the entry screen with stale results.
          try {
            const practice = await fetchCurrentRun(false, controller.signal);
            if (practice.status === "active") send({ type: "RUN_SYNCED", run: practice });
          } catch (error) {
            if (!(error instanceof DsaApiError && error.code === "NO_RUN")) throw error;
          }
        }
      } catch (error) {
        if (error instanceof DsaApiError && error.code === "FEATURE_DISABLED") {
          send({ type: "FEATURE_UNAVAILABLE" });
          return;
        }
        handleError(error);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cosmetic countdown before the run-creation request.
  useEffect(() => {
    if (state.phase !== "pre-run-countdown") return undefined;
    const interval = window.setInterval(
      () => send({ type: "COUNTDOWN_TICK" }),
      reducedMotion ? 300 : 800,
    );
    return () => window.clearInterval(interval);
  }, [state.phase, reducedMotion, send]);

  // "starting" phase performs the actual creation request.
  useEffect(() => {
    if (state.phase !== "starting") return;
    (async () => {
      try {
        const run =
          state.intent === "official" ? await startOfficialRun() : await startPracticeRun();
        send({ type: "RUN_STARTED", run });
        if (state.intent === "official") {
          track(run.resumed ? "dsa_official_resumed" : "dsa_official_started");
        } else {
          track("dsa_practice_started");
        }
        if (run.status !== "active") {
          void loadTerminalResults(run.run_id, run.official);
        } else if (run.resumed) {
          send({ type: "RUN_SYNCED", run });
        }
      } catch (error) {
        handleError(error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Reveal auto-advance.
  useEffect(() => {
    if (state.phase !== "reveal") return undefined;
    const timeout = window.setTimeout(
      () => send({ type: "REVEAL_DONE" }),
      reducedMotion ? REVEAL_MS_REDUCED : REVEAL_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [state.phase, reducedMotion, send]);

  useEffect(() => {
    if (state.phase !== "transitioning") return undefined;
    const timeout = window.setTimeout(() => send({ type: "TRANSITION_DONE" }), 50);
    return () => window.clearTimeout(timeout);
  }, [state.phase, send]);

  // Terminal phases fetch results.
  useEffect(() => {
    if ((state.phase === "expired" || state.phase === "completed") && state.run) {
      track(state.phase === "expired" ? "dsa_run_expired" : "dsa_run_completed", {
        official: state.run.official,
      });
      void loadTerminalResults(state.run.run_id, state.run.official);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Visibility return → resync active runs.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const phase = stateRef.current.phase;
      if (phase === "active-question" || phase === "reconnecting") void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resync]);

  useEffect(() => {
    if (state.phase === "reconnecting" && !recoveryInFlight.current) void resync();
    if (state.phase === "ready" || state.phase === "signed-out-entry") {
      track("dsa_entry_viewed", { session: state.session });
    }
    if (state.phase === "signed-out-entry") track("dsa_signin_gate_shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const handleSelect = useCallback(
    async (index: number) => {
      const current = stateRef.current;
      if (current.phase !== "active-question" || !current.run?.sequence) return;
      send({ type: "ANSWER_SELECTED", selectedIndex: index });
      try {
        const resolution = await submitAnswer(current.run.run_id, current.run.sequence, index);
        send({ type: "RESOLUTION_RECEIVED", resolution });
        track("dsa_answer_resolved", {
          sequence: resolution.sequence,
          is_correct: resolution.is_correct,
          official: resolution.run.official,
        });
        announce(
          resolution.is_correct
            ? `Correct. Plus ${resolution.awarded_score} points. Combo ${resolution.combo_after}.`
            : "Incorrect. Combo reset.",
        );
      } catch (error) {
        handleError(error);
      }
    },
    [send, announce, handleError],
  );

  const handleTimerZero = useCallback(async () => {
    const run = stateRef.current.run;
    if (!run || run.status !== "active") return;
    try {
      const fresh = await finalizeRun(run.run_id);
      send({ type: "RUN_SYNCED", run: fresh });
      if (fresh.status !== "active") {
        announce("Time expired");
        void loadTerminalResults(fresh.run_id, fresh.official);
      }
    } catch (error) {
      handleError(error);
    }
  }, [send, announce, handleError, loadTerminalResults]);

  const startOfficial = useCallback(() => {
    track("dsa_official_cta_clicked");
    const official = stateRef.current.meta?.official_run;
    if (official && official.status !== "active") {
      void loadTerminalResults(official.run_id, true);
      return;
    }
    send({ type: "START_REQUESTED", intent: "official" });
  }, [send, loadTerminalResults]);

  const startPractice = useCallback(() => {
    if (stateRef.current.phase === "official-results" || stateRef.current.phase === "practice-results") {
      track("dsa_practice_replay_clicked");
    }
    send({ type: "START_REQUESTED", intent: "practice" });
  }, [send, track]);

  const inGame =
    state.phase === "active-question" ||
    state.phase === "submitting-answer" ||
    state.phase === "reveal" ||
    state.phase === "transitioning";

  return (
    <main className="min-h-screen bg-background pb-10 pt-4 text-foreground">
      <div className="mx-auto mb-4 flex w-full max-w-xl items-center justify-between px-3">
        <h1 className="text-base font-bold">Daily Score Attack</h1>
        {!production && (
          <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
            dev prototype
          </span>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="dsa-live-region">
        {announcement}
      </p>

      {state.phase === "loading-metadata" && (
        <p className="px-3 text-center text-sm text-muted-foreground">Loading today's challenge…</p>
      )}

      {state.phase === "unavailable" && (
        <div className="mx-auto max-w-xl px-3 text-center" data-testid="dsa-unavailable">
          <p className="font-medium">Daily Score Attack is not available right now.</p>
          <button
            type="button"
            onClick={() => send({ type: "RETRY" })}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent"
          >
            Check again
          </button>
        </div>
      )}

      {(state.phase === "ready" || state.phase === "signed-out-entry") && state.meta && (
        <>
          <DailyScoreAttackEntry
            meta={state.meta}
            session={state.phase === "signed-out-entry" ? "none" : state.session}
            onStartOfficial={startOfficial}
            onStartPractice={startPractice}
          />
          {production && (
            <div className="mx-auto mt-4 w-full max-w-xl px-3">
              <AdSlot placement="daily_score_attack_entry" isActiveQuizQuestion={false} />
            </div>
          )}
        </>
      )}

      {state.phase === "pre-run-countdown" && (
        <DailyScoreAttackCountdown value={state.countdown} reducedMotion={reducedMotion} />
      )}

      {state.phase === "starting" && (
        <p className="px-3 text-center text-sm text-muted-foreground" role="status">
          Starting run…
        </p>
      )}

      {state.phase === "reconnecting" && (
        <p className="px-3 text-center text-sm text-muted-foreground" role="status" data-testid="dsa-reconnecting">
          Syncing with the server…
        </p>
      )}

      {inGame && state.run && (
        <DailyScoreAttackGame
          run={state.run}
          phase={state.phase as "active-question" | "submitting-answer" | "reveal" | "transitioning"}
          resolution={state.resolution}
          selectedIndex={state.selectedIndex}
          reducedMotion={reducedMotion}
          onSelect={(index) => void handleSelect(index)}
          onTimerZero={() => void handleTimerZero()}
          onAnnounce={announce}
        />
      )}

      {(state.phase === "expired" || state.phase === "completed") && (
        <p className="px-3 text-center text-sm text-muted-foreground" role="status">
          Run finished — loading results…
        </p>
      )}

      {(state.phase === "official-results" || state.phase === "practice-results") &&
        state.results && (
          <>
            <DailyScoreAttackResults
              results={state.results}
              history={state.history}
              practiceAllowed={state.session !== "none" || !state.results.official}
              onPracticeAgain={startPractice}
            />
            {production && (
              <div className="mx-auto mt-4 w-full max-w-xl px-3">
                <AdSlot placement="daily_score_attack_results" isActiveQuizQuestion={false} />
              </div>
            )}
          </>
        )}

      {state.phase === "recoverable-error" && (
        <div className="mx-auto max-w-xl px-3 text-center" data-testid="dsa-recoverable-error">
          <p className="font-medium">{state.error?.message ?? "Something went wrong."}</p>
          <button
            type="button"
            onClick={() => void resync()}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent"
          >
            Reconnect
          </button>
        </div>
      )}

      {state.phase === "terminal-error" && (
        <div className="mx-auto max-w-xl px-3 text-center" data-testid="dsa-terminal-error">
          <p className="font-medium">This run hit an unrecoverable problem.</p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary>Developer detail</summary>
            <code>{state.error?.code}</code>
          </details>
          <button
            type="button"
            onClick={() => send({ type: "RETRY" })}
            className="mt-3 min-h-11 rounded-lg border border-border px-4 text-sm hover:bg-accent"
          >
            Back to start
          </button>
        </div>
      )}
    </main>
  );
}
