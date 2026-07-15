// ---------------------------------------------------------------------------
// Participant session for the playable staff duel: one non-overlapping polling
// loop plus the two gameplay commands.
//
// The BACKEND is authoritative for everything — round numbers, deadline,
// resolution, correctness, damage, HP, XP, levels, charges, progression gates,
// winner, and match-over. This hook only sequences requests and holds the last
// projections it was given. It never computes combat values and never assumes
// which option is correct.
//
// Loop invariants (enforced by the single-flight coordinator below):
//   * at most one poll cycle in flight, and at most one scheduled timeout —
//     a command-triggered immediate refresh that arrives while a cycle is
//     running is QUEUED (rerunRequested), never started concurrently, so no
//     second polling loop can ever come into existence;
//   * every request shares one AbortController, aborted on unmount / leave;
//   * transient failures back off (1.5s → 8s) instead of spamming;
//   * fatal states (match gone, credentials rejected) stop polling entirely;
//   * polling stops once the backend reports the match over.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { AdaptedSettlement, adaptBackendSettlement } from "../backend-adapter/adaptBackendSettlement";
import { fetchResolvedRound } from "../transport-client/fetchResolvedRound";
import {
  RankedDuelApiError,
  describeError,
  fetchPrivatePlayerLive,
  fetchPublicRoundLive,
  isCredentialError,
  isMatchGone,
  isNoActiveRound,
  pendingPlayersFromError,
  submitLevelTwoChoice,
  submitRound,
} from "./rankedDuelClient";
import { PrivatePlayerView, PublicRoundView } from "./rankedDuelTypes";

export interface StaffDuelCredentials {
  baseUrl: string;
  matchId: string;
  playerId: string;
  /** Raw participant token — held in memory only; never stored or logged. */
  playerToken: string;
}

export interface StaffDuelSessionState {
  publicRound: PublicRoundView | null;
  privatePlayer: PrivatePlayerView | null;
  /** Most recent resolved round, adapted for the reveal panel. */
  lastResolved: AdaptedSettlement | null;
  /** Player ids the backend says still owe a Level 2 choice. */
  pendingProgression: string[];
  matchOver: boolean;
  winnerId: string | null;
  /**
   * Highest HP observed per player. The backend does not project a max-HP
   * field; this is an observed high-water mark used only for the HP bar.
   */
  observedMaxHp: Record<string, number>;
  /** Recoverable problem (kept visible, no toast loop). */
  error: string | null;
  /** Unrecoverable for this session: polling has stopped. */
  fatal: string | null;
  loading: boolean;
  submitting: boolean;
  actionError: string | null;
}

const INITIAL: StaffDuelSessionState = {
  publicRound: null,
  privatePlayer: null,
  lastResolved: null,
  pendingProgression: [],
  matchOver: false,
  winnerId: null,
  observedMaxHp: {},
  error: null,
  fatal: null,
  loading: true,
  submitting: false,
  actionError: null,
};

export const POLL_INTERVAL_MS = 1500;
export const MAX_BACKOFF_MS = 8000;
/** Bound on the cold-rejoin scan for a completed match's final round. */
const MAX_ROUND_PROBE = 30;

/** p1 is always the owner; p2 is "the other player id", never an array index. */
const mappingFor = (players: { player_id: string }[], ownerId: string) => {
  const ids = players.map((p) => p.player_id);
  const opponent = ids.find((id) => id !== ownerId);
  if (!ids.includes(ownerId) || !opponent) {
    throw new RankedDuelApiError(
      "invalid_response",
      "resolved round does not include the joined player",
    );
  }
  return { p1PlayerId: ownerId, p2PlayerId: opponent };
};

export function useStaffDuelSession(credentials: StaffDuelCredentials | null) {
  const [state, setState] = useState<StaffDuelSessionState>(INITIAL);

  const abortRef = useRef<AbortController | null>(null);
  const activeRoundRef = useRef<number | null>(null);
  const resolvedRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const pokeRef = useRef<(() => void) | null>(null);

  const patch = useCallback((next: Partial<StaffDuelSessionState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const fetchResolved = useCallback(
    async (
      creds: StaffDuelCredentials,
      roundNumber: number,
      signal: AbortSignal,
    ): Promise<AdaptedSettlement> => {
      const envelope = await fetchResolvedRound({
        baseUrl: creds.baseUrl,
        matchId: creds.matchId,
        roundNumber,
        signal,
      });
      return adaptBackendSettlement(
        envelope.payload,
        mappingFor(envelope.payload.players, creds.playerId),
      );
    },
    [],
  );

  useEffect(() => {
    if (!credentials) {
      setState(INITIAL);
      return;
    }
    const creds = credentials;
    const controller = new AbortController();
    abortRef.current = controller;
    stoppedRef.current = false;
    activeRoundRef.current = null;
    resolvedRef.current = null;
    setState({ ...INITIAL });

    let timer: number | undefined;
    let failures = 0;
    let disposed = false;
    // Single-flight state: at most one cycle running, at most one queued.
    let inFlight = false;
    let rerunRequested = false;

    const stop = (fatal: string) => {
      stoppedRef.current = true;
      patch({ fatal, loading: false });
    };

    /** Resolve + reveal the round that just ended, once. */
    const captureResolved = async (roundNumber: number) => {
      if (resolvedRef.current === roundNumber) return null;
      const settlement = await fetchResolved(creds, roundNumber, controller.signal);
      resolvedRef.current = roundNumber;
      patch({
        lastResolved: settlement,
        matchOver: settlement.matchOver,
        winnerId:
          settlement.winner === null
            ? null
            : settlement.winner === "p1"
              ? creds.playerId
              : (settlement.players.p2.playerId ?? null),
      });
      if (settlement.matchOver) stoppedRef.current = true;
      return settlement;
    };

    /** Cold rejoin with no active round and no history: find the last round. */
    const probeFinalRound = async () => {
      for (let n = 1; n <= MAX_ROUND_PROBE; n += 1) {
        try {
          await fetchResolved(creds, n, controller.signal);
        } catch {
          if (n === 1) return; // nothing resolved yet
          await captureResolved(n - 1);
          return;
        }
      }
    };

    const poll = async () => {
      let pub: PublicRoundView | null = null;
      try {
        pub = await fetchPublicRoundLive(creds.baseUrl, creds.matchId, controller.signal);
      } catch (err) {
        if ((err as RankedDuelApiError).kind === "aborted") return;
        if (isMatchGone(err)) return stop(describeError(err));
        if (!isNoActiveRound(err)) throw err;

        // No active round: either a Level 2 gate, or the match is over.
        const pending = pendingPlayersFromError(err);
        patch({ pendingProgression: pending, loading: false, error: null });
        const lastActive = activeRoundRef.current;
        if (lastActive !== null) {
          await captureResolved(lastActive);
        } else if (resolvedRef.current === null) {
          await probeFinalRound();
        }
        return;
      }

      // A new active round means the previous one resolved: reveal it first.
      const active = pub.activeRound?.roundNumber ?? null;
      const previous = activeRoundRef.current;
      if (previous !== null && active !== null && active !== previous) {
        await captureResolved(previous);
      }
      if (active !== null) activeRoundRef.current = active;

      setState((prev) => {
        const observedMaxHp = { ...prev.observedMaxHp };
        for (const p of pub!.players) {
          observedMaxHp[p.playerId] = Math.max(observedMaxHp[p.playerId] ?? 0, p.hp);
        }
        return {
          ...prev,
          publicRound: pub,
          pendingProgression: pub!.progressionPendingPlayers,
          observedMaxHp,
          loading: false,
          error: null,
        };
      });

      if (pub.matchOver) {
        stoppedRef.current = true;
        patch({ matchOver: true, winnerId: pub.winnerId });
        return;
      }

      // Private state only exists while a round is active.
      if (active !== null) {
        try {
          const priv = await fetchPrivatePlayerLive(
            creds.baseUrl,
            creds.matchId,
            creds.playerId,
            creds.playerToken,
            controller.signal,
          );
          patch({ privatePlayer: priv });
        } catch (err) {
          if ((err as RankedDuelApiError).kind === "aborted") return;
          if (isCredentialError(err) || isMatchGone(err)) return stop(describeError(err));
          if (!isNoActiveRound(err)) throw err;
        }
      }
    };

    // ---- single-flight polling coordinator --------------------------------
    // Exactly one cycle may be in flight and exactly one future timeout may
    // exist. A refresh requested while a cycle is running is queued (never
    // dropped, never started concurrently) and runs as soon as that cycle
    // settles. `timer` is only ever assigned through schedule(), which clears
    // any previous timeout first, so no timeout can be orphaned.
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (disposed || stoppedRef.current) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        void run();
      }, delay);
    };

    const run = async () => {
      if (disposed || stoppedRef.current) return;
      if (inFlight) {
        // A cycle is already running: queue one rerun instead of starting a
        // second loop. This is the poke-during-in-flight-poll case.
        rerunRequested = true;
        return;
      }
      inFlight = true;
      try {
        await poll();
        failures = 0;
        if (!disposed && !stoppedRef.current) patch({ error: null });
      } catch (err) {
        if ((err as RankedDuelApiError)?.kind !== "aborted" && !disposed) {
          failures += 1;
          // One persistent inline message; never a toast per failed tick.
          patch({ error: describeError(err), loading: false });
        }
      } finally {
        inFlight = false;
        if (disposed || stoppedRef.current) {
          // Unmounted, left, or the backend ended the session: no rerun.
          rerunRequested = false;
          clearTimer();
        } else if (rerunRequested) {
          rerunRequested = false;
          schedule(0); // the queued immediate refresh — still one loop
        } else {
          schedule(Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS));
        }
      }
    };

    // Immediate refresh requested by a command (submission / Level 2 choice).
    pokeRef.current = () => {
      if (disposed || stoppedRef.current) return;
      if (inFlight) {
        rerunRequested = true;
        return;
      }
      schedule(0);
    };

    void run();

    return () => {
      disposed = true;
      rerunRequested = false;
      clearTimer();
      controller.abort();
      abortRef.current = null;
      pokeRef.current = null;
    };
  }, [credentials, fetchResolved, patch]);

  const submit = useCallback(
    async (answerIndex: number, abilityId: string | null) => {
      if (!credentials) return;
      const roundNumber = state.publicRound?.activeRound?.roundNumber;
      if (roundNumber === undefined) {
        patch({ actionError: "No active round to submit to." });
        return;
      }
      patch({ submitting: true, actionError: null });
      try {
        await submitRound({
          baseUrl: credentials.baseUrl,
          matchId: credentials.matchId,
          playerToken: credentials.playerToken,
          roundNumber, // backend's number, never a local counter
          answerIndex,
          abilityId,
        });
        patch({ submitting: false });
        pokeRef.current?.();
      } catch (err) {
        patch({ submitting: false, actionError: describeError(err) });
        pokeRef.current?.();
      }
    },
    [credentials, patch, state.publicRound],
  );

  const chooseLevelTwo = useCallback(
    async (abilityId: string) => {
      if (!credentials) return;
      patch({ submitting: true, actionError: null });
      try {
        await submitLevelTwoChoice({
          baseUrl: credentials.baseUrl,
          matchId: credentials.matchId,
          playerToken: credentials.playerToken,
          abilityId,
        });
        patch({ submitting: false });
        pokeRef.current?.();
      } catch (err) {
        patch({ submitting: false, actionError: describeError(err) });
        pokeRef.current?.();
      }
    },
    [credentials, patch],
  );

  return { state, submit, chooseLevelTwo };
}
