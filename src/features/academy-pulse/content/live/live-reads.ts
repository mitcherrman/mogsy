/**
 * Academy Pulse — PULSE-2A live reads.
 *
 * The only network Pulse does, and only for a signed-in ACCOUNT (never a
 * guest, never an anonymous session: both endpoints answer those with 401/403
 * and a read must not mint an identity). Each read reuses the client the
 * product already ships, so the identity, the entitlement projection and the
 * parse are the same ones History and the Practice record use:
 *
 *   history   GET /api/history/v1?limit=5        self-scoped Daily record,
 *             Premium analytics only when the server attached them
 *   practice  GET /api/quiz/analytics/trends     self-scoped figures; the
 *             server projects Free to a snapshot (no comparison at all)
 *
 * Both take the caller's AbortSignal, so a provider that is torn down (or runs
 * out of time) leaves no request whose answer could land later.
 *
 * Never used here: owner analytics, Admin routes, `/api/daily-run/admin/*`,
 * population refresh, or any endpoint keyed by a user id in the path.
 */
import { readHistoryPage, type HistoryPage } from "@/lib/history/contracts";
import { historyPath } from "@/lib/history/historyApi";
import type { TrendReport } from "@/lib/quiz/analyticsApi";
import { authedRequest } from "@/lib/quiz/api";

/** The newest few Daily records are all Pulse ever says anything about. */
export const PULSE_HISTORY_LIMIT = 5;

export const PULSE_PRACTICE_PATH = "/api/quiz/analytics/trends";

export interface PulseLiveReads {
  history(signal: AbortSignal): Promise<HistoryPage>;
  practice(signal: AbortSignal): Promise<TrendReport>;
}

export class PulseLiveContractError extends Error {
  constructor(message: string) {
    super(`Pulse practice contract: ${message}`);
    this.name = "PulseLiveContractError";
  }
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks the parts of a trends payload Pulse reads, and nothing more. The
 * tier is the SERVER's; a payload without a known tier is not read at all.
 */
export function readPracticeReport(body: unknown): TrendReport {
  if (!isRec(body)) throw new PulseLiveContractError("payload must be an object");
  if (body.tier !== "free" && body.tier !== "premium") throw new PulseLiveContractError("unknown tier");
  const current = body.current;
  if (!isRec(current) || !isNum(current.attempts) || !isNum(current.correct) || !isNum(current.accuracy) || !isNum(current.active_days)) {
    throw new PulseLiveContractError("current must carry attempts, correct, accuracy and active_days");
  }
  if (!isRec(body.sufficiency) || typeof body.sufficiency.has_data !== "boolean") {
    throw new PulseLiveContractError("sufficiency.has_data must be a boolean");
  }
  if (body.window_days !== null && body.window_days !== undefined && !isNum(body.window_days)) {
    throw new PulseLiveContractError("window_days must be a number or null");
  }
  if (body.series !== undefined) {
    if (!Array.isArray(body.series)) throw new PulseLiveContractError("series must be an array");
    for (const p of body.series) {
      if (!isRec(p) || (p.accuracy !== null && !isNum(p.accuracy))) throw new PulseLiveContractError("series point accuracy must be a number or null");
    }
  }
  if (body.delta !== undefined && !isRec(body.delta)) throw new PulseLiveContractError("delta must be an object");
  return body as unknown as TrendReport;
}

export const httpPulseLiveReads: PulseLiveReads = {
  history: async (signal) =>
    readHistoryPage(await authedRequest<unknown>(historyPath({ cursor: null, limit: PULSE_HISTORY_LIMIT }), { signal })),
  practice: async (signal) => readPracticeReport(await authedRequest<unknown>(PULSE_PRACTICE_PATH, { signal })),
};
