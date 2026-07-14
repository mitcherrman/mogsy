// ---------------------------------------------------------------------------
// Phase 1 of the ranked-duel cross-surface composition plan: a PURE,
// React-free, read-only state container for the three server projection
// surfaces (public current round, private owning player, resolved rounds).
//
// It accepts already-ADAPTED values (AdaptedPublicRound /
// AdaptedPrivatePlayer / AdaptedSettlement) plus request bookkeeping — it
// performs no HTTP, no validation duplication, and no combat math. Surfaces
// stay strictly separate (never merged into one player object). Resolved
// history is immutable; precedence and stale-response rules are explicit in
// the reducer below.
//
// This container does NOT dispatch APPLY_BACKEND_SETTLEMENT and is not wired
// into duelMachine or any UI — `pendingSettlementToCommit` exposes what a
// future caller should dispatch, keeping that action the only settlement
// commit path.
//
// Generations are FRONTEND request bookkeeping only (the backend envelopes
// carry no revision metadata, and none is invented here): a response may
// apply only when its generation equals the latest started generation for
// its surface.
// ---------------------------------------------------------------------------

import { AdaptedSettlement } from "../backend-adapter/adaptBackendSettlement";
import { AdaptedPublicRound } from "../transport-adapter/adaptPublicRound";
import { AdaptedPrivatePlayer } from "../transport-adapter/adaptPrivatePlayer";

export class ReadCompositionError extends Error {
  constructor(message: string) {
    super(`Ranked-duel read composition: ${message}`);
    this.name = "ReadCompositionError";
  }
}

/** Established once per match; immutable afterwards. Explicit ids only. */
export interface RankedDuelIdentity {
  matchId: string;
  p1PlayerId: string;
  p2PlayerId: string;
  ownerPlayerId: string;
}

/** Safe error representation — kind + message, never a stack trace. */
export interface SurfaceError {
  kind: string;
  message: string;
}

export interface SurfaceRequestStatus {
  phase: "idle" | "loading" | "success" | "error";
  /** Latest STARTED request generation for this surface. */
  generation: number;
  error: SurfaceError | null;
}

const idleStatus = (): SurfaceRequestStatus => ({ phase: "idle", generation: 0, error: null });

export interface RankedDuelReadCompositionState {
  identity: RankedDuelIdentity | null;
  /** Current shared state (server-authoritative, public). */
  publicRound: AdaptedPublicRound | null;
  /** High-water marks used to reject older public responses. */
  publicHighWater: { roundNumber: number; completedRounds: number } | null;
  /** Current owner-only state (server-authoritative, private). */
  privatePlayer: AdaptedPrivatePlayer | null;
  /** IMMUTABLE historical settlements, keyed by round number. */
  resolvedRounds: Record<number, AdaptedSettlement>;
  lastResolvedRoundNumber: number | null;
  /** Terminal flag from resolved settlements ONLY — never inferred from HP. */
  matchTerminal: boolean;
  requestStatus: {
    public: SurfaceRequestStatus;
    private: SurfaceRequestStatus;
    resolved: SurfaceRequestStatus;
  };
  /** Frontend-local presentation bookkeeping. */
  presentation: {
    activeResolvedRoundNumber: number | null;
  };
}

export const initialReadCompositionState: RankedDuelReadCompositionState = {
  identity: null,
  publicRound: null,
  publicHighWater: null,
  privatePlayer: null,
  resolvedRounds: {},
  lastResolvedRoundNumber: null,
  matchTerminal: false,
  requestStatus: { public: idleStatus(), private: idleStatus(), resolved: idleStatus() },
  presentation: { activeResolvedRoundNumber: null },
};

export type ReadCompositionAction =
  | { type: "INITIALIZE_IDENTITY"; identity: RankedDuelIdentity }
  | { type: "PUBLIC_REQUEST_STARTED" }
  | { type: "PUBLIC_REQUEST_SUCCEEDED"; generation: number; publicRound: AdaptedPublicRound }
  | { type: "PUBLIC_REQUEST_FAILED"; generation: number; error: SurfaceError }
  | { type: "PRIVATE_REQUEST_STARTED" }
  | { type: "PRIVATE_REQUEST_SUCCEEDED"; generation: number; privatePlayer: AdaptedPrivatePlayer }
  | { type: "PRIVATE_REQUEST_FAILED"; generation: number; error: SurfaceError }
  | { type: "RESOLVED_REQUEST_STARTED"; roundNumber: number }
  | { type: "RESOLVED_REQUEST_SUCCEEDED"; generation: number; settlement: AdaptedSettlement }
  | { type: "RESOLVED_REQUEST_FAILED"; generation: number; error: SurfaceError }
  | { type: "ACTIVATE_RESOLVED_REVEAL"; roundNumber: number }
  | { type: "CLEAR_RESOLVED_PRESENTATION" }
  | { type: "RESET" };

// --- helpers ---------------------------------------------------------------

type SurfaceKey = "public" | "private" | "resolved";

const startSurface = (
  state: RankedDuelReadCompositionState,
  surface: SurfaceKey,
): RankedDuelReadCompositionState => ({
  ...state,
  requestStatus: {
    ...state.requestStatus,
    [surface]: {
      phase: "loading",
      generation: state.requestStatus[surface].generation + 1,
      error: null,
    },
  },
});

const isCurrentGeneration = (
  state: RankedDuelReadCompositionState,
  surface: SurfaceKey,
  generation: number,
): boolean => state.requestStatus[surface].generation === generation;

const surfaceSuccess = (
  state: RankedDuelReadCompositionState,
  surface: SurfaceKey,
): RankedDuelReadCompositionState["requestStatus"] => ({
  ...state.requestStatus,
  [surface]: { ...state.requestStatus[surface], phase: "success", error: null },
});

const surfaceError = (
  state: RankedDuelReadCompositionState,
  surface: SurfaceKey,
  error: SurfaceError,
): RankedDuelReadCompositionState["requestStatus"] => ({
  ...state.requestStatus,
  [surface]: {
    ...state.requestStatus[surface],
    phase: "error",
    error: { kind: error.kind, message: error.message },
  },
});

const validateIdentity = (identity: RankedDuelIdentity): void => {
  const { matchId, p1PlayerId, p2PlayerId, ownerPlayerId } = identity;
  for (const [name, value] of [
    ["matchId", matchId],
    ["p1PlayerId", p1PlayerId],
    ["p2PlayerId", p2PlayerId],
    ["ownerPlayerId", ownerPlayerId],
  ] as const) {
    if (!value || !value.trim()) throw new ReadCompositionError(`${name} must be non-empty`);
  }
  if (p1PlayerId === p2PlayerId) {
    throw new ReadCompositionError("p1PlayerId and p2PlayerId must differ");
  }
  if (ownerPlayerId !== p1PlayerId && ownerPlayerId !== p2PlayerId) {
    throw new ReadCompositionError("ownerPlayerId must equal p1PlayerId or p2PlayerId");
  }
};

const sameIdentity = (a: RankedDuelIdentity, b: RankedDuelIdentity): boolean =>
  a.matchId === b.matchId &&
  a.p1PlayerId === b.p1PlayerId &&
  a.p2PlayerId === b.p2PlayerId &&
  a.ownerPlayerId === b.ownerPlayerId;

/**
 * The settlement the caller should later commit via the duel reducer's
 * APPLY_BACKEND_SETTLEMENT (kept as the ONLY settlement commit path). This
 * container never dispatches it.
 */
export const pendingSettlementToCommit = (
  state: RankedDuelReadCompositionState,
): AdaptedSettlement | null =>
  state.presentation.activeResolvedRoundNumber === null
    ? null
    : (state.resolvedRounds[state.presentation.activeResolvedRoundNumber] ?? null);

// --- reducer -----------------------------------------------------------------

export function readCompositionReducer(
  state: RankedDuelReadCompositionState,
  action: ReadCompositionAction,
): RankedDuelReadCompositionState {
  switch (action.type) {
    case "INITIALIZE_IDENTITY": {
      validateIdentity(action.identity);
      if (state.identity !== null) {
        // Identity is per-match and immutable. Re-initializing with the SAME
        // values is a harmless no-op; anything else must go through RESET.
        if (sameIdentity(state.identity, action.identity)) return state;
        throw new ReadCompositionError(
          "identity cannot change after initialization — RESET first",
        );
      }
      return { ...initialReadCompositionState, identity: { ...action.identity } };
    }

    case "RESET":
      return initialReadCompositionState;

    // ----- public surface -------------------------------------------------
    case "PUBLIC_REQUEST_STARTED":
      return startSurface(state, "public");

    case "PUBLIC_REQUEST_SUCCEEDED": {
      if (!isCurrentGeneration(state, "public", action.generation)) return state; // stale request
      if (!state.identity) return state;
      const incoming = action.publicRound;
      if (incoming.matchId !== state.identity.matchId) return state; // wrong match
      // Never regress below already-accepted public state.
      if (state.publicHighWater) {
        if (incoming.roundNumber < state.publicHighWater.roundNumber) return state;
        if (incoming.completedRounds < state.publicHighWater.completedRounds) return state;
      }
      // A settled round can never be (re)active: reject public state whose
      // active round is at or below the resolved high-water mark.
      if (
        state.lastResolvedRoundNumber !== null &&
        incoming.activeRound !== null &&
        incoming.activeRound.roundNumber <= state.lastResolvedRoundNumber
      ) {
        return state;
      }
      // A terminal settlement beats any stale "still active" public claim.
      if (state.matchTerminal && incoming.matchStatus === "active") return state;
      return {
        ...state,
        publicRound: incoming,
        publicHighWater: {
          roundNumber: incoming.roundNumber,
          completedRounds: incoming.completedRounds,
        },
        requestStatus: surfaceSuccess(state, "public"),
      };
    }

    case "PUBLIC_REQUEST_FAILED": {
      if (!isCurrentGeneration(state, "public", action.generation)) return state;
      // Failure never erases already-accepted public (or any other) state.
      return { ...state, requestStatus: surfaceError(state, "public", action.error) };
    }

    // ----- private surface ------------------------------------------------
    case "PRIVATE_REQUEST_STARTED":
      return startSurface(state, "private");

    case "PRIVATE_REQUEST_SUCCEEDED": {
      if (!isCurrentGeneration(state, "private", action.generation)) return state;
      if (!state.identity) return state;
      const incoming = action.privatePlayer;
      if (incoming.matchId !== state.identity.matchId) return state;
      // Owner-scoped only: the projection's owner must be OUR owner.
      if (incoming.ownerPlayerId !== state.identity.ownerPlayerId) return state;
      // Never regress to an older round's private state.
      if (state.privatePlayer && incoming.roundNumber < state.privatePlayer.roundNumber) {
        return state;
      }
      // Private "current round" state for an already-settled round is stale.
      if (
        state.lastResolvedRoundNumber !== null &&
        incoming.roundNumber <= state.lastResolvedRoundNumber
      ) {
        return state;
      }
      if (state.matchTerminal) return state; // no current-round state after terminal
      return {
        ...state,
        privatePlayer: incoming,
        requestStatus: surfaceSuccess(state, "private"),
      };
    }

    case "PRIVATE_REQUEST_FAILED": {
      if (!isCurrentGeneration(state, "private", action.generation)) return state;
      return { ...state, requestStatus: surfaceError(state, "private", action.error) };
    }

    // ----- resolved surface -------------------------------------------------
    case "RESOLVED_REQUEST_STARTED":
      return startSurface(state, "resolved");

    case "RESOLVED_REQUEST_SUCCEEDED": {
      if (!isCurrentGeneration(state, "resolved", action.generation)) return state;
      if (!state.identity) return state;
      const settlement = action.settlement;
      if (settlement.matchId !== state.identity.matchId) return state;
      const n = settlement.roundNumber;
      // Monotonic history: only strictly newer rounds commit; duplicates and
      // older rounds are ignored without touching existing history.
      if (state.lastResolvedRoundNumber !== null && n <= state.lastResolvedRoundNumber) {
        return state;
      }
      if (state.resolvedRounds[n]) return state;
      return {
        ...state,
        resolvedRounds: { ...state.resolvedRounds, [n]: settlement },
        lastResolvedRoundNumber: n,
        // Terminal state comes from the settlement fields ONLY (supports the
        // simultaneous-knockout draw: matchOver with winner null).
        matchTerminal: state.matchTerminal || settlement.matchOver,
        presentation: { ...state.presentation, activeResolvedRoundNumber: n },
        requestStatus: surfaceSuccess(state, "resolved"),
      };
    }

    case "RESOLVED_REQUEST_FAILED": {
      if (!isCurrentGeneration(state, "resolved", action.generation)) return state;
      // e.g. a 409 round-not-resolved: waiting state; public/private/history
      // all remain intact.
      return { ...state, requestStatus: surfaceError(state, "resolved", action.error) };
    }

    // ----- presentation -----------------------------------------------------
    case "ACTIVATE_RESOLVED_REVEAL": {
      if (!state.resolvedRounds[action.roundNumber]) return state;
      return {
        ...state,
        presentation: { ...state.presentation, activeResolvedRoundNumber: action.roundNumber },
      };
    }

    case "CLEAR_RESOLVED_PRESENTATION":
      return { ...state, presentation: { ...state.presentation, activeResolvedRoundNumber: null } };

    default:
      return state;
  }
}
