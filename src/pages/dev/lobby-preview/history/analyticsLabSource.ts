/**
 * HUB6.3D/E — the Analytics Lab's History, served offline through the
 * production contract, exactly like Timmy's: every page is a real
 * `GET /api/history/v1` response — HUB6.3C's route (`00c794cd`: HUB6.3B
 * personal analytics + population + Free strike markers) run over the lab's
 * rows and population recipes by `scripts/hub63-generate-analytics-lab.py` —
 * handed to the SAME `readHistoryPage` production uses. Nothing here computes
 * a figure.
 */
import goldenText from "./analyticsLab.golden.json?raw";
import { readHistoryPage } from "@/lib/history/contracts";
import type { HistorySource } from "@/lib/history/historyApi";
import { GOLDEN_PAGE_SIZE } from "./goldenPageSize";

export type AnalyticsLabScenario = "lab_premium" | "lab_free" | "lab_unavailable";

interface WirePage {
  next_cursor: string | null;
  [key: string]: unknown;
}

export interface AnalyticsLabGolden {
  generated_by: string;
  /** The backend commit whose route produced every page. */
  backend_commit: string;
  input_sha256: string;
  scenarios: Record<AnalyticsLabScenario, WirePage[]>;
}

export const ANALYTICS_LAB_GOLDEN: AnalyticsLabGolden = JSON.parse(goldenText);

function sourceFor(scenario: AnalyticsLabScenario): HistorySource {
  const pages = ANALYTICS_LAB_GOLDEN.scenarios[scenario];
  return {
    page: async ({ cursor, limit }) => {
      if (limit !== GOLDEN_PAGE_SIZE) {
        throw new Error(`the Analytics Lab was generated at ${GOLDEN_PAGE_SIZE} per page, not ${limit}`);
      }
      const index = cursor === null ? 0 : pages.findIndex((_, i) => i > 0 && pages[i - 1].next_cursor === cursor);
      if (index < 0) throw new Error("Analytics Lab: the server never issued this cursor");
      return readHistoryPage(pages[index]);
    },
  };
}

export const ANALYTICS_LAB_SOURCES: Readonly<Record<AnalyticsLabScenario, HistorySource>> = Object.freeze({
  lab_premium: sourceFor("lab_premium"),
  lab_free: sourceFor("lab_free"),
  lab_unavailable: sourceFor("lab_unavailable"),
});
