/**
 * HUB6.3D — the HUB6.3B additive fields, read leniently and backwards-
 * compatibly: a HUB2.3 payload still parses (with honest fallbacks), a
 * HUB6.3B payload parses every new block, and a malformed new block is
 * dropped rather than failing the page.
 */
import { describe, expect, it } from "vitest";
import { readHistoryPage, type DailyHistoryRecord } from "@/lib/history/contracts";
import { readRunPersonal, readStagePersonalFacts } from "@/lib/history/personal";
import { ANALYTICS_LAB_GOLDEN } from "@/pages/dev/lobby-preview/history/analyticsLabSource";
import { TIMMY_HISTORY_GOLDEN } from "@/pages/dev/lobby-preview/history/timmyHistorySource";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a wire page, mutated to break it
const labPage = () => clone(ANALYTICS_LAB_GOLDEN.scenarios.lab_premium[0]) as Record<string, any>;

describe("HUB6.3B fields — backwards compatible", () => {
  it("every HUB2.3 golden page still parses; new fields fall back honestly", () => {
    for (const pages of Object.values(TIMMY_HISTORY_GOLDEN.scenarios) as unknown[][]) {
      for (const page of pages) {
        const parsed = readHistoryPage(page);
        for (const r of parsed.items as DailyHistoryRecord[]) {
          expect(r.basic.questionsPlayed).toBe(r.basic.answered);
          for (const s of r.stages) {
            expect(s.basic.questionsPlayed).toBe(s.basic.answered);
            expect(s.basic.timeout).toBe(s.questions.filter((q) => q.outcome === "timeout").length);
            expect(s.basic.completionReason).toBeNull();
            expect(s.modules).toBeNull();
            expect(s.status).toBeNull();
            for (const q of s.questions) {
              expect(q.publicCategory).toBeNull();
              expect(q.unit).toBeNull();
            }
            if (s.analytics) {
              expect(s.analytics.personalFacts.current).toBeNull();
              expect(s.analytics.personalFacts.categories).toEqual([]);
            }
          }
          if (r.analytics) expect(r.analytics.personal).toBeNull();
        }
      }
    }
  });

  it("a HUB6.3B page parses every additive block", () => {
    const r = readHistoryPage(labPage()).items[0] as DailyHistoryRecord;
    expect(r.analytics!.personal!.core!.eligible).toBe(true);
    expect(r.analytics!.personal!.previousDaily!.previous).not.toBeNull();
    const s = r.stages[0];
    expect(s.status).toBe("completed");
    expect(s.modules!.length).toBeGreaterThan(0);
    expect(s.basic.completionReason).toBeTruthy();
    const f = s.analytics!.personalFacts;
    expect(f.current!.questionsPlayed).toBe(s.basic.questionsPlayed);
    expect(f.outcomes!.correct.count).toBe(s.basic.correct);
    expect(f.categories.length).toBeGreaterThan(0);
    expect(f.questionHistory.length).toBe(s.questions.length);
    expect(f.personal!.records.length).toBeGreaterThan(0);
    expect(f.personal!.series.at(-1)!.isCurrent).toBe(true);
  });

  it("a malformed personal block is dropped, not fatal", () => {
    const page = labPage();
    page.items[0].analytics.personal = "nonsense";
    page.items[0].stages[0].analytics.current = 42;
    page.items[0].stages[0].analytics.categories = [{ public_category: null }];
    page.items[0].stages[0].questions[0].public_category = { key: 3 };
    const r = readHistoryPage(page).items[0] as DailyHistoryRecord;
    expect(r.analytics!.personal).toBeNull();
    expect(r.stages[0].analytics!.personalFacts.current).toBeNull();
    expect(r.stages[0].analytics!.personalFacts.categories).toEqual([]);
    expect(r.stages[0].questions[0].publicCategory).toBeNull();
  });

  it("readers tolerate absence", () => {
    expect(readRunPersonal(undefined)).toBeNull();
    const empty = readStagePersonalFacts({});
    expect(empty.current).toBeNull();
    expect(empty.strikes).toBeNull();
    expect(empty.reviewSources).toEqual([]);
    expect(empty.selection).toBeNull();
  });
});
