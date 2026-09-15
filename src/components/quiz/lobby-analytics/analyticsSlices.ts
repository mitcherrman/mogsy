/**
 * RL2 — the two Academy slides, derived from ONE `TrendReport`.
 *
 * Pure functions, no React, so the honesty rules below are testable on their
 * own rather than through a chart.
 *
 * WHAT THE PAYLOAD ACTUALLY CARRIES
 * ─────────────────────────────────
 * `categories[]` is accuracy and attempts per category, for the whole window.
 * `modes[]` is accuracy and attempts per mode, for the whole window. There is
 * NO cross-tab: the payload cannot say "my Item accuracy in Daily". So the
 * Mode control is not a filter that narrows the category bars — it could only
 * do that by inventing the cross-tab — it CHOOSES THE DIMENSION:
 *
 *   All modes      → the bars and the slices are CATEGORIES
 *   a single mode  → the bars and the slices are MODES, with that one marked
 *
 * Every figure drawn either way is a figure the server sent. Narrowing
 * categories by mode is listed as a backend contract, not faked here.
 *
 * THE DONUT IS PART-TO-WHOLE ONLY
 * ───────────────────────────────
 * `donutSlices` returns ATTEMPT COUNTS, which sum to the total drawn in the
 * centre. Accuracy percentages never reach it: they do not sum to anything and
 * a ring of unrelated rates is a lie told with geometry. `barSeries` is the
 * only place accuracy is drawn, and it is drawn on an axis.
 */
import type { TrendReport, TrendCategory, TrendMode } from "@/lib/quiz/analyticsApi";

/** `"all"`, or one `TrendMode.mode`. */
export type ModeFilter = string;
export const ALL_MODES: ModeFilter = "all";

export type SliceDimension = "category" | "mode";

export interface AccuracyBar {
  key: string;
  label: string;
  /** 0-100, as the server computed it. Never re-derived here. */
  accuracy: number;
  attempts: number;
  /** The server's own evidence floor. The bar keeps its true value either way. */
  lowSample: boolean;
  /** The mode the reader selected, when the dimension is mode. */
  selected: boolean;
}

export interface DistributionSlice {
  key: string;
  label: string;
  /** Attempts. A COUNT, so the ring is a true part-to-whole. */
  attempts: number;
  selected: boolean;
}

/** Which dimension a given mode selection implies. */
export function dimensionFor(mode: ModeFilter): SliceDimension {
  return mode === ALL_MODES ? "category" : "mode";
}

/** Mode options for the control: "All modes" plus every mode the server sent,
 *  INCLUDING the `known: false` bucket, which is real attempts whose mode could
 *  not be placed and must not be quietly dropped from a distribution. */
export function modeOptions(report: TrendReport | null): { value: ModeFilter; label: string }[] {
  const modes = report?.modes ?? [];
  return [
    { value: ALL_MODES, label: "All modes" },
    ...modes.map((m) => ({ value: m.mode, label: m.label || m.mode })),
  ];
}

function categoryBars(categories: readonly TrendCategory[]): AccuracyBar[] {
  return [...categories]
    .filter((c) => c.attempts > 0)
    .sort((a, b) => b.accuracy - a.accuracy || a.category.localeCompare(b.category))
    .map((c) => ({
      key: c.category,
      label: c.category,
      accuracy: c.accuracy,
      attempts: c.attempts,
      lowSample: c.low_sample === true,
      selected: false,
    }));
}

function modeBars(modes: readonly TrendMode[], selectedMode: ModeFilter): AccuracyBar[] {
  return [...modes]
    .filter((m) => m.attempts > 0)
    .sort((a, b) => b.accuracy - a.accuracy || a.mode.localeCompare(b.mode))
    .map((m) => ({
      key: m.mode,
      label: m.label || m.mode,
      accuracy: m.accuracy,
      attempts: m.attempts,
      lowSample: false,
      selected: m.mode === selectedMode,
    }));
}

/** Slide 1. Accuracy, on an axis, in the dimension the mode control chose. */
export function barSeries(report: TrendReport | null, mode: ModeFilter): AccuracyBar[] {
  if (!report) return [];
  return dimensionFor(mode) === "category"
    ? categoryBars(report.categories ?? [])
    : modeBars(report.modes ?? [], mode);
}

/** Slide 2. Question distribution — attempt COUNTS that sum to the whole. */
export function donutSlices(report: TrendReport | null, mode: ModeFilter): DistributionSlice[] {
  if (!report) return [];
  if (dimensionFor(mode) === "category") {
    return [...(report.categories ?? [])]
      .filter((c) => c.attempts > 0)
      .sort((a, b) => b.attempts - a.attempts || a.category.localeCompare(b.category))
      .map((c) => ({ key: c.category, label: c.category, attempts: c.attempts, selected: false }));
  }
  return [...(report.modes ?? [])]
    .filter((m) => m.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts || a.mode.localeCompare(b.mode))
    .map((m) => ({
      key: m.mode,
      label: m.label || m.mode,
      attempts: m.attempts,
      selected: m.mode === mode,
    }));
}

/** The whole the ring is a part of. Summed from the slices actually drawn, so
 *  the centre figure can never disagree with the geometry around it. */
export function sliceTotal(slices: readonly DistributionSlice[]): number {
  return slices.reduce((sum, s) => sum + s.attempts, 0);
}

/** `window_days` is null on a Free snapshot, which is bounded by answers
 *  rather than by days and therefore has no window length to name. */
export function windowOptionLabel(days: number): string {
  if (days === 7) return "7d";
  if (days === 30) return "30d";
  if (days === 90) return "90d";
  return `${days}d`;
}
