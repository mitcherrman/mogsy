/**
 * Academy Pulse — PULSE-2A: the viewer's own record as Pulse scenes.
 *
 * Pure projections from server payloads to existing scene items. Every figure
 * is one the server sent, formatted the way History and the Practice record
 * already format it; nothing is summed, compared, ranked or inferred here.
 *
 *   dailyRecordItem      Free   newest Daily: its headline score and C/A,
 *                               exactly `dailyHeadline` (History's own rule)
 *   dailyTrendItem       Prem.  the server's FITTED accuracy trajectory, sent
 *                               only to an entitled caller with enough runs
 *   practiceItem         Free   the server's snapshot of recent answers
 *                        Prem.  the server's window, series and movement
 *
 * A Free caller never gets a line, a direction or a delta: the server
 * withholds them and this file does not rebuild them from Free facts.
 *
 * IDs are fixed strings. They reach the DOM (a scene's gradient id), so they
 * never carry a user id, run id or any other server identity.
 */
import { dailyHeadline } from "@/components/quiz/workspace/dailyHeadline";
import { planDateLabel, signedPoints } from "@/components/quiz/workspace/historyFormat";
import type { DailyHistoryRecord, HistoryPage } from "@/lib/history/contracts";
import { recentSpanLabel, windowLabel, type TrendReport } from "@/lib/quiz/analyticsApi";

import type { InsightItem, NewsItem, PulseCatalogue } from "../../model/pulse-types";

export const PULSE_HISTORY_HREF = "/quiz#history";
export const PULSE_TRENDS_HREF = "/quiz#trends";
/** The Practice record's own name for what the trends read counts. */
export const PRACTICE_SCOPE_LABEL = "Practice & Time Trial";

export const LIVE_ITEM_IDS = {
  dailyRecord: "live-daily-record",
  dailyTrend: "live-daily-trend",
  practice: "live-practice",
} as const;

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

function newest(page: HistoryPage): DailyHistoryRecord | null {
  // The server orders newest first; only settled Dailies are on the page.
  return page.items.find((r) => r.recordType === "daily" && (r.main !== null || r.status === "completed")) ?? null;
}

/** The viewer's newest Daily, as a broadcast card. Free facts only. */
export function dailyRecordItem(page: HistoryPage): NewsItem | null {
  const record = newest(page);
  if (!record) return null;
  const head = dailyHeadline(record);
  const date = planDateLabel(record.planDate);
  const result = head.correct !== null && head.answered !== null && head.answered > 0
    ? `${head.correct} of ${head.answered} correct`
    : null;
  const headline = `${whole(head.score)} points in your last Daily`;
  return {
    id: LIVE_ITEM_IDS.dailyRecord,
    kind: "news",
    category: "player-activity",
    provenance: "live",
    title: `Your last Daily Challenge (${date}): ${whole(head.score)} points${result ? `, ${result}` : ""}`,
    variant: "announcement",
    kicker: "Your Daily record",
    headline,
    summary: result ? `${result} in the Daily for ${date}.` : `Your Daily for ${date}.`,
    body: [
      `You scored ${whole(head.score)} points in the Daily Challenge for ${date}${result ? `, with ${result}` : ""}.`,
      "Every question you played, and how you answered it, is in your History.",
    ],
    dateLabel: date,
    href: PULSE_HISTORY_HREF,
    ctaLabel: "See your record",
  };
}

/**
 * The server's fitted Daily accuracy trajectory. Present only when the
 * server attached analytics (an entitled caller), marked them available and
 * found enough compatible runs; otherwise there is no item at all.
 */
export function dailyTrendItem(page: HistoryPage): InsightItem | null {
  const record = page.items.find((r) => r.capability.state === "available" && r.analytics !== null) ?? null;
  const metric = record?.analytics?.trajectory;
  const t = metric?.value;
  if (!record || !metric || metric.sufficiency.status !== "sufficient" || !t || t.values.length < 2) return null;
  const head = dailyHeadline(record);
  if (head.correct === null || head.answered === null || head.answered <= 0) return null;
  const n = t.values.length;
  const headline = t.direction === "up"
    ? "Your Daily accuracy is rising"
    : t.direction === "down"
      ? "Your Daily accuracy has dipped"
      : "Your Daily accuracy is holding steady";
  return {
    id: LIVE_ITEM_IDS.dailyTrend,
    kind: "insight",
    category: "personal-insight",
    provenance: "live",
    title: `${headline}: ${signedPoints(t.fittedChangePp)} over your last ${n} Dailies`,
    headline,
    seriesLabel: `Daily accuracy, last ${n} runs`,
    // The server's run accuracies (0–1), shown as the whole percents History prints.
    series: t.values.map((v) => Math.round(v * 100)),
    deltaLabel: signedPoints(t.fittedChangePp),
    milestone: { label: "Correct in your latest Daily", current: head.correct, target: head.answered },
    href: PULSE_HISTORY_HREF,
  };
}

/**
 * The viewer's Practice & Time Trial figures. Free: the server's snapshot of
 * recent answers, as a card. Premium: the server's window and day series,
 * as a reading, with the movement only when the server says it is comparable.
 */
export function practiceItem(report: TrendReport): NewsItem | InsightItem | null {
  const { current, sufficiency } = report;
  if (!sufficiency.has_data || current.attempts <= 0) return null;
  const accuracy = `${Math.round(current.accuracy)}%`;

  if (report.tier === "premium" && report.window_days) {
    const series = (report.series ?? []).flatMap((p) => (p.accuracy === null ? [] : [Math.round(p.accuracy)]));
    if (series.length >= 2) {
      const delta = report.delta;
      const moved = delta && delta.comparable && delta.accuracy_points !== null && delta.direction !== "insufficient";
      const span = windowLabel(report.window_days);
      return {
        id: LIVE_ITEM_IDS.practice,
        kind: "insight",
        category: "personal-insight",
        provenance: "live",
        title: `${accuracy} correct in ${PRACTICE_SCOPE_LABEL} over the last ${span}`,
        headline: `${accuracy} in ${PRACTICE_SCOPE_LABEL}`,
        seriesLabel: `Accuracy on the days you studied, last ${span}`,
        series,
        deltaLabel: moved ? `${signedPoints(delta.accuracy_points as number)} vs the previous ${span}` : `${current.attempts} answers`,
        milestone: { label: `Days studied in the last ${span}`, current: current.active_days, target: report.window_days },
        href: PULSE_TRENDS_HREF,
      };
    }
  }

  const span = recentSpanLabel(report);
  return {
    id: LIVE_ITEM_IDS.practice,
    kind: "news",
    category: "personal-insight",
    provenance: "live",
    title: `${accuracy} correct in ${PRACTICE_SCOPE_LABEL}. ${span}.`,
    variant: "announcement",
    kicker: `Your ${PRACTICE_SCOPE_LABEL}`,
    headline: `${accuracy} correct in ${PRACTICE_SCOPE_LABEL}`,
    summary: `${span}.`,
    body: [
      `${span}: ${current.correct} of ${current.attempts} correct.`,
      "Your figures for each category are in your Practice record.",
    ],
    dateLabel: span,
    href: PULSE_TRENDS_HREF,
    ctaLabel: "See your figures",
  };
}

/** Whether a payload shows the SERVER treating this viewer as Premium. */
export function serverSaysPremium(page: HistoryPage | null, report: TrendReport | null): boolean {
  if (report?.tier === "premium") return true;
  return !!page?.items.some((r) => r.capability.state === "available");
}

/** The editorial catalogue with the viewer's own scenes added, by category. */
export function withLiveItems(
  base: PulseCatalogue,
  items: readonly (NewsItem | InsightItem | null)[],
  opts: { dropPremiumPromo: boolean },
): PulseCatalogue {
  const out: PulseCatalogue = { ...base };
  if (opts.dropPremiumPromo) delete out.premium;
  for (const item of items) {
    if (!item) continue;
    out[item.category] = [...(out[item.category] ?? []), item];
  }
  return out;
}
