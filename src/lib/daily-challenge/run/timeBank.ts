/**
 * DCMOD-E — THE TIME TRIAL BANK, as a picture of the server's number.
 *
 * The bank is SERVER-AUTHORITATIVE (DCMOD-A's `StageLedger`): it is derived
 * from immutable per-question instants and spends only while a question is
 * answerable. The browser never decides what is left and never ends a stage.
 *
 * What this does is project the last authoritative reading forward for a
 * smooth display — and only when BOTH sides agree a question is answerable
 * right now:
 *
 *   * the server said `draining` at `asOf` (a question was answerable then);
 *   * the arena is presenting that question as answerable (`answering`).
 *
 * Through a reveal, a module title, a stage transition or media preparation
 * the display holds the server's reading still. It is never projected past
 * zero, and a fresher reading always replaces the projection outright.
 */
import type { DailyTimeBank } from "./contracts";

export function projectTimeBank(args: {
  bank: DailyTimeBank;
  /** Device clock, ms. */
  nowMs: number;
  /** Server minus device, ms. */
  skewMs: number;
  /** Is the arena presenting an answerable question right now? */
  answerable: boolean;
}): number {
  const { bank, nowMs, skewMs, answerable } = args;
  if (!bank.draining || !answerable) return bank.remainingMs;
  const asOf = Date.parse(bank.asOf);
  if (Number.isNaN(asOf)) return bank.remainingMs;
  const elapsed = Math.max(0, nowMs + skewMs - asOf);
  return Math.max(0, bank.remainingMs - elapsed);
}

/** "1:05", "0:09". Whole seconds, rounded up so 0:00 means empty. */
export function formatBank(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Server minus device clock, from a projection's `server_now`. 0 if unknown. */
export function runSkewMs(serverNow: string | null, deviceNowMs: number): number {
  if (!serverNow) return 0;
  const t = Date.parse(serverNow);
  return Number.isNaN(t) ? 0 : t - deviceNowMs;
}
