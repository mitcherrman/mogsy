import type { EngineSnapshot } from "./types";

/**
 * Studio <-> Broadcast Window bridge. The Studio owns the engine and
 * publishes snapshots; the Window subscribes and only renders.
 */
const CHANNEL_NAME = "mogsy-quiz-broadcast";
const REQUEST_KEY = "mogsy.quizBroadcast.request.v1";

type Message =
  | { kind: "snapshot"; snapshot: EngineSnapshot }
  | { kind: "request_snapshot" };

export function createPublisher() {
  if (typeof BroadcastChannel === "undefined") return { post: () => {}, close: () => {}, onRequest: () => () => {} };
  const ch = new BroadcastChannel(CHANNEL_NAME);
  return {
    post(snapshot: EngineSnapshot) {
      ch.postMessage({ kind: "snapshot", snapshot } satisfies Message);
    },
    onRequest(fn: () => void) {
      const handler = (e: MessageEvent<Message>) => {
        if (e.data?.kind === "request_snapshot") fn();
      };
      ch.addEventListener("message", handler);
      return () => ch.removeEventListener("message", handler);
    },
    close() {
      ch.close();
    },
  };
}

export function createSubscriber(onSnapshot: (s: EngineSnapshot) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(CHANNEL_NAME);
  const handler = (e: MessageEvent<Message>) => {
    if (e.data?.kind === "snapshot") onSnapshot(e.data.snapshot);
  };
  ch.addEventListener("message", handler);
  ch.postMessage({ kind: "request_snapshot" } satisfies Message);
  return () => {
    ch.removeEventListener("message", handler);
    ch.close();
  };
}

export const BROADCAST_REQUEST_KEY = REQUEST_KEY;