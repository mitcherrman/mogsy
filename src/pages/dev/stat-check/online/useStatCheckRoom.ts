import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAborted,
  isFatal,
  statCheckOnlineApi,
  StatCheckApiError,
  type StatCheckOnlineApi,
} from "@/lib/stat-check-online/client";
import type { RoomView } from "@/lib/stat-check-online/contracts";

const POLL_MS = 1_500;
const MAX_BACKOFF_MS = 8_000;

export type RoomPhase =
  | "recovering"
  | "creating"
  | "joining"
  | "lobby"
  | "started"
  | "cancelled"
  | "error";

export type StatCheckRoomState = {
  phase: RoomPhase;
  room: RoomView | null;
  errorCode: string | null;
  busy: boolean;
};

/**
 * Room/lobby session hook. Discipline mirrors useRankedMatch: single-flight
 * polling with exponential backoff, fatal errors stop the loop, actions are
 * guarded against double-submit. When the room reports status "active" the
 * phase becomes "started" and polling stops (the match hook takes over).
 */
export function useStatCheckRoom(
  inviteCode: string | null,
  api: StatCheckOnlineApi = statCheckOnlineApi,
) {
  const [state, setState] = useState<StatCheckRoomState>({
    phase: "recovering",
    room: null,
    errorCode: null,
    busy: false,
  });
  const roomIdRef = useRef<string | null>(null);
  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);
  const disposedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const applyRoom = useCallback((room: RoomView) => {
    roomIdRef.current = room.roomId;
    setState((current) => ({
      ...current,
      room,
      errorCode: null,
      phase:
        room.status === "active"
          ? "started"
          : room.status === "cancelled"
            ? "cancelled"
            : "lobby",
    }));
  }, []);

  const fail = useCallback((error: unknown) => {
    if (isAborted(error)) return;
    const code = error instanceof StatCheckApiError ? error.code : null;
    setState((current) => ({ ...current, phase: "error", errorCode: code }));
  }, []);

  const schedule = useCallback((delay: number) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void poll(), delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const poll = useCallback(async () => {
    const roomId = roomIdRef.current;
    if (disposedRef.current || !roomId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const room = await api.getRoom(roomId);
      failuresRef.current = 0;
      if (!disposedRef.current) {
        applyRoom(room);
        if (room.status === "open") schedule(POLL_MS);
      }
    } catch (error) {
      if (disposedRef.current || isAborted(error)) return;
      if (isFatal(error)) {
        fail(error);
        return;
      }
      failuresRef.current += 1;
      schedule(Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** failuresRef.current));
    } finally {
      inFlightRef.current = false;
    }
  }, [api, applyRoom, fail, schedule]);

  // Entry: with a code, join it; without one, look for an existing live room.
  useEffect(() => {
    disposedRef.current = false;
    (async () => {
      try {
        if (inviteCode) {
          setState((current) => ({ ...current, phase: "joining" }));
          const joined = await api.joinRoom(inviteCode);
          roomIdRef.current = joined.roomId;
        } else {
          const active = await api.getActiveRoom();
          if (!active.roomId) {
            setState((current) => ({ ...current, phase: "creating", room: null }));
            return;
          }
          roomIdRef.current = active.roomId;
        }
        await poll();
      } catch (error) {
        fail(error);
      }
    })();
    return () => {
      disposedRef.current = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  const createRoom = useCallback(async () => {
    setState((current) => ({ ...current, busy: true }));
    try {
      const created = await api.createRoom();
      roomIdRef.current = created.roomId;
      await poll();
      return created;
    } catch (error) {
      fail(error);
      return null;
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }, [api, fail, poll]);

  const setReady = useCallback(
    async (ready: boolean) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      setState((current) => ({ ...current, busy: true }));
      try {
        const room = await api.setReady(roomId, ready);
        applyRoom(room);
        if (room.status === "open") schedule(POLL_MS);
      } catch (error) {
        if (!isAborted(error) && isFatal(error)) fail(error);
      } finally {
        setState((current) => ({ ...current, busy: false }));
      }
    },
    [api, applyRoom, fail, schedule],
  );

  const cancelRoom = useCallback(async () => {
    const roomId = roomIdRef.current;
    if (!roomId) return;
    try {
      await api.cancelRoom(roomId);
      setState((current) => ({ ...current, phase: "cancelled" }));
    } catch (error) {
      if (isFatal(error)) fail(error);
    }
  }, [api, fail]);

  return { state, createRoom, setReady, cancelRoom };
}
