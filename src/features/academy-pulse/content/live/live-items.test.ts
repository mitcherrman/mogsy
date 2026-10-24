/**
 * PULSE-2A projections, on the backend-generated History wire pages
 * (`analyticsLab.golden.json`: a Free, a Premium and an analytics-unavailable
 * caller) and on trends payloads shaped by the server's own projection.
 */
import { describe, expect, it } from "vitest";

import { readHistoryPage, type HistoryPage } from "@/lib/history/contracts";
import type { TrendReport } from "@/lib/quiz/analyticsApi";
import golden from "@/pages/dev/lobby-preview/history/analyticsLab.golden.json";

import { isRenderable } from "../../model/pulse-cadence";
import type { PulseCatalogue } from "../../model/pulse-types";
import {
  LIVE_ITEM_IDS,
  PULSE_HISTORY_HREF,
  PULSE_TRENDS_HREF,
  dailyRecordItem,
  dailyTrendItem,
  practiceItem,
  pulseItemLabel,
  serverSaysPremium,
  withLiveItems,
} from "./live-items";

type Raw = Record<string, unknown> & { items: Record<string, unknown>[] };
const scenario = (name: "lab_free" | "lab_premium" | "lab_unavailable"): Raw =>
  structuredClone((golden as unknown as { scenarios: Record<string, Raw[]> }).scenarios[name][0]);
const page = (raw: Raw): HistoryPage => readHistoryPage(raw);

const FREE_REPORT: TrendReport = {
  ok: true,
  tier: "free",
  capability: {
    can_view_snapshot: true, snapshot_window_days: 7, can_view_trends: false, trend_windows: [],
    allowed_windows: [7], can_build: false, reason: "free",
  },
  windows: [],
  window_days: null,
  since: "2026-10-18T10:00:00Z",
  until: "2026-10-23T10:00:00Z",
  recent_answers: 50,
  span_days: 6,
  current: { attempts: 50, correct: 37, accuracy: 74, active_days: 4 },
  modes: [],
  categories: [{ category: "Items", attempts: 20, correct: 15, accuracy: 75, low_sample: false }],
  counts_modes: ["practice", "time_trial_official"],
  excludes_modes: ["ranked", "daily_challenge", "mastery"],
  sufficiency: { has_data: true },
};

const PREMIUM_REPORT: TrendReport = {
  ...FREE_REPORT,
  tier: "premium",
  capability: { ...FREE_REPORT.capability, can_view_trends: true, trend_windows: [7, 30, 90], allowed_windows: [7, 30, 90] },
  windows: [7, 30, 90],
  window_days: 7,
  recent_answers: undefined,
  span_days: undefined,
  current: { attempts: 40, correct: 31, accuracy: 77.5, active_days: 3 },
  previous: { attempts: 30, correct: 21, accuracy: 70, active_days: 2 },
  delta: { attempts: 10, accuracy_points: 7.5, active_days: 1, direction: "improving", comparable: true },
  series: [
    { date: "2026-10-17", attempts: 10, correct: 7, accuracy: 70 },
    { date: "2026-10-18", attempts: 0, correct: 0, accuracy: null },
    { date: "2026-10-19", attempts: 15, correct: 12, accuracy: 80 },
    { date: "2026-10-20", attempts: 15, correct: 12, accuracy: 80 },
  ],
  sufficiency: { has_data: true, min_attempts: 20, enough_for_trend: true, enough_for_comparison: true },
};

describe("the viewer's newest Daily", () => {
  it("is the server's headline for a legacy record: record.basic, verbatim", () => {
    const item = dailyRecordItem(page(scenario("lab_free")))!;
    expect(item).toMatchObject({
      id: LIVE_ITEM_IDS.dailyRecord,
      kind: "news",
      category: "player-activity",
      provenance: "live",
      kicker: "Your Daily",
      headline: "459 points in your last Daily",
      summary: "72 of 82 correct in the Daily for Sep 14.",
      dateLabel: "Sep 14",
      href: PULSE_HISTORY_HREF,
    });
    expect(isRenderable(item)).toBe(true);
  });

  it("is the frozen main Daily score and its Standard stage for a v5 record, never the aggregate", () => {
    const raw = scenario("lab_free");
    raw.items[0].main = { completed_at: raw.items[0].completed_at, daily_score: 110 };
    const item = dailyRecordItem(page(raw))!;
    expect(item.headline).toBe("110 points in your last Daily");
    expect(item.summary).toBe("20 of 21 correct in the Daily for Sep 14.");
  });

  it("says nothing when there is no Daily on the page", () => {
    expect(dailyRecordItem({ schemaVersion: 1, asOf: "", items: [], nextCursor: null })).toBeNull();
  });

  it("carries no server identity (run ids, refs) into anything it renders", () => {
    const raw = scenario("lab_premium");
    const text = JSON.stringify([dailyRecordItem(page(raw)), dailyTrendItem(page(raw))]);
    for (const r of raw.items) expect(text).not.toContain(String(r.run_id));
    expect(text).not.toMatch(/canonical|question_result|user_id/i);
  });
});

describe("the Daily trend (Premium, server-fitted)", () => {
  it("is never built for a Free caller: the server sent no analytics and nothing is rebuilt", () => {
    const free = page(scenario("lab_free"));
    expect(free.items.every((r) => r.analytics === null)).toBe(true);
    expect(dailyTrendItem(free)).toBeNull();
  });

  it("is never built when the server could not compute analytics", () => {
    expect(dailyTrendItem(page(scenario("lab_unavailable")))).toBeNull();
  });

  it("draws exactly the server's run accuracies and its fitted change", () => {
    const premium = page(scenario("lab_premium"));
    const t = premium.items[0].analytics!.trajectory.value!;
    const item = dailyTrendItem(premium)!;
    expect(item.kind).toBe("insight");
    expect(item.category).toBe("personal-insight");
    expect(item.series).toEqual(t.values.map((v) => Math.round(v * 100)));
    expect(item.deltaLabel).toBe("−3 points"); // fitted_change_pp −2.505…, as History words it
    expect(item.headline).toBe("Your Daily accuracy is holding steady"); // the server's "stable"
    expect(item.milestone).toEqual({ label: "Correct in your latest Daily", current: 72, target: 82 });
    expect(isRenderable(item)).toBe(true);
  });

  it("waits for the server's evidence floor", () => {
    const raw = scenario("lab_premium");
    const analytics = raw.items[0].analytics as { trajectory: { sufficiency: { status: string }; value: unknown } };
    analytics.trajectory = { ...analytics.trajectory, sufficiency: { ...analytics.trajectory.sufficiency, status: "insufficient" }, value: null };
    for (const r of raw.items.slice(1)) r.analytics_capability = { state: "upgrade_required", reason_code: "premium_required" };
    expect(dailyTrendItem(page(raw))).toBeNull();
  });
});

describe("Practice & Time Trial figures", () => {
  it("Free: the server's snapshot as a card, with no line, direction or delta", () => {
    const item = practiceItem(FREE_REPORT)!;
    expect(item).toMatchObject({
      id: LIVE_ITEM_IDS.practice,
      kind: "news",
      category: "personal-insight",
      headline: "74% correct in Practice & Time Trial",
      summary: "Your last 50 answers, over 6 days.",
      href: PULSE_TRENDS_HREF,
    });
    const { href: _href, ...copy } = item;
    expect(JSON.stringify(copy)).not.toMatch(/improv|declin|steady|vs the previous|trend|rising|dipped/i);
  });

  it("Premium: the server's window, its active-day series and its comparable movement", () => {
    const item = practiceItem(PREMIUM_REPORT)!;
    expect(item).toMatchObject({
      kind: "insight",
      headline: "78% in Practice & Time Trial",
      series: [70, 80, 80],
      deltaLabel: "+8 points vs the previous 7 days",
      milestone: { label: "Days studied in the last 7 days", current: 3, target: 7 },
    });
    expect(isRenderable(item)).toBe(true);
  });

  it("Premium without a comparable previous window states no movement", () => {
    const item = practiceItem({ ...PREMIUM_REPORT, delta: { ...PREMIUM_REPORT.delta!, comparable: false, accuracy_points: null } })!;
    expect(item.kind === "insight" && item.deltaLabel).toBe("40 answers");
  });

  it("says nothing without answers", () => {
    expect(practiceItem({ ...FREE_REPORT, sufficiency: { has_data: false } })).toBeNull();
    expect(practiceItem({ ...FREE_REPORT, current: { attempts: 0, correct: 0, accuracy: 0, active_days: 0 } })).toBeNull();
  });
});

describe("labels", () => {
  it("the viewer's own Daily is announced as Your Daily, never as community activity", () => {
    const record = dailyRecordItem(page(scenario("lab_free")))!;
    expect(record.category).toBe("player-activity");
    expect(pulseItemLabel(record)).toBe("Your Daily");
  });

  it("every other item keeps its category label, and a non-live item cannot borrow the live label", () => {
    expect(pulseItemLabel(practiceItem(FREE_REPORT)!)).toBe("Your insight");
    const record = dailyRecordItem(page(scenario("lab_free")))!;
    expect(pulseItemLabel({ ...record, provenance: "fixture" })).toBe("Player activity");
  });
});

describe("composition", () => {
  const base: PulseCatalogue = { premium: [], news: [] };
  it("adds items by their category and drops the Premium promotion only when told", () => {
    const record = dailyRecordItem(page(scenario("lab_free")));
    expect(withLiveItems(base, [record, null], { dropPremiumPromo: false })).toEqual({ premium: [], news: [], "player-activity": [record] });
    expect(withLiveItems(base, [record], { dropPremiumPromo: true })).not.toHaveProperty("premium");
  });

  it("reads Premium from the server's own payloads", () => {
    expect(serverSaysPremium(page(scenario("lab_premium")), null)).toBe(true);
    expect(serverSaysPremium(page(scenario("lab_free")), FREE_REPORT)).toBe(false);
    expect(serverSaysPremium(null, PREMIUM_REPORT)).toBe(true);
  });
});
