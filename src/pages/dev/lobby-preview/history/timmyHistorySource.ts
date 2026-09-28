/**
 * HUB5 — Timmy's History, served offline through the production contract.
 *
 * Every page here is a real `GET /api/history/v1` response: HUB2.1's route,
 * run over Timmy's persistence rows by `scripts/hub5-generate-timmy-history.py`
 * and frozen in `timmyHistory.golden.json`. This source hands those WIRE pages
 * to the SAME `readHistoryPage` production uses, so the History UI receives
 * exactly the normalized records it would receive from the backend — nothing
 * is hand-built for the preview, and nothing here computes a figure.
 *
 * Paging follows the server's own cursors verbatim. A page size other than
 * the one the golden was cut at, or a cursor the server never issued, is an
 * error rather than a silently different page.
 */
import goldenText from "./timmyHistory.golden.json?raw";
import { readHistoryPage } from "@/lib/history/contracts";
import type { HistorySource } from "@/lib/history/historyApi";
import { GOLDEN_PAGE_SIZE } from "./goldenPageSize";

export type TimmyHistoryScenario =
  | "timmy_premium"
  | "timmy_free"
  | "timmy_unavailable"
  | "first_daily"
  | "newcomer"
  | "full_daily";

interface WirePage {
  next_cursor: string | null;
  [key: string]: unknown;
}

export interface TimmyHistoryGolden {
  generated_by: string;
  hub2_commit: string;
  input_sha256: string;
  scenarios: Record<TimmyHistoryScenario, WirePage[]>;
}

export const TIMMY_HISTORY_GOLDEN: TimmyHistoryGolden = JSON.parse(goldenText);

function sourceFor(scenario: TimmyHistoryScenario): HistorySource {
  const pages = TIMMY_HISTORY_GOLDEN.scenarios[scenario];
  if (!pages?.length) throw new Error(`no History golden for ${scenario}`);
  return {
    page: async ({ cursor, limit }) => {
      if (limit !== GOLDEN_PAGE_SIZE) {
        throw new Error(`Timmy History was generated at ${GOLDEN_PAGE_SIZE} per page, not ${limit}`);
      }
      const index = cursor === null ? 0 : pages.findIndex((_, i) => i > 0 && pages[i - 1].next_cursor === cursor);
      if (index < 0) throw new Error("Timmy History: the server never issued this cursor");
      return readHistoryPage(pages[index]);
    },
  };
}

/** One stable source per scenario — the History hook re-reads when its
 *  source changes identity, so these are built once. */
export const TIMMY_HISTORY_SOURCES: Readonly<Record<TimmyHistoryScenario, HistorySource>> = Object.freeze({
  timmy_premium: sourceFor("timmy_premium"),
  timmy_free: sourceFor("timmy_free"),
  timmy_unavailable: sourceFor("timmy_unavailable"),
  first_daily: sourceFor("first_daily"),
  newcomer: sourceFor("newcomer"),
  full_daily: sourceFor("full_daily"),
});
