/**
 * HUB4 — the one client for `GET /api/history/v1`.
 *
 * Account-bound and self-scoped on the server; authenticated here the way
 * every other account read on `/quiz` is (`authedRequest`, which never mints
 * a guest identity for a read). The response is parsed and schema-checked by
 * `readHistoryPage` before anything renders it.
 *
 * Paging is the server's cursor, passed back verbatim. The client never builds
 * or decodes one.
 */
import { authedRequest } from "@/lib/quiz/api";
import { readHistoryPage, type HistoryPage } from "@/lib/history/contracts";

/** First render asks for a bounded page, never the whole record. The server
 *  clamps to 1..50 and defaults to 20; ten Daily runs is fifty stages, which
 *  is already fifty question timelines to fill. */
export const HISTORY_PAGE_SIZE = 10;

export interface HistoryPageRequest {
  cursor: string | null;
  limit: number;
}

/**
 * Where History pages come from. The real one is `historyApi`; a frozen host
 * (`/dev/lobby-preview`) supplies its own so it never reaches the network.
 */
export interface HistorySource {
  page: (request: HistoryPageRequest) => Promise<HistoryPage>;
}

export function historyPath({ cursor, limit }: HistoryPageRequest): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return `/api/history/v1?${params.toString()}`;
}

export const historyApi: HistorySource = {
  page: async (request) => readHistoryPage(await authedRequest<unknown>(historyPath(request))),
};

/** An offline source with no records, for hosts that must not fetch. */
export const EMPTY_HISTORY_SOURCE: HistorySource = {
  page: async () => ({ schemaVersion: 1, asOf: "", items: [], nextCursor: null }),
};

/**
 * Whether a failure means "this caller has no account-bound History", which
 * is a state rather than an error: no session at all, a 401, or the 403 the
 * server gives an anonymous guest session (`ACCOUNT_REQUIRED`).
 */
export function isHistorySignedOut(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "QuizAuthRequiredError") return true;
  return /\b401\b|ACCOUNT_REQUIRED|AUTH_REQUIRED/.test(error.message);
}
