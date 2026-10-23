/**
 * CC2 — the cross-slide geometry-stability gates, shared by Playwright and the
 * browser export. Moved verbatim from `scripts/quiz-screenshots/generate.ts`.
 *
 *   carousel (post / challenge) — the composition chrome (ground, rail, QR,
 *       scan) is identical across every slide of a format; the CTA is gated
 *       within its family (quiz strip vs end-slide brand lockup).
 *   classic — the `question` and `correct` cards of one question are
 *       pixel-identical (≤1px) everywhere: the core anti-drift guarantee.
 *
 * Pure: geometry in, failures out.
 */
import { END_SLIDES } from "./captureJobs";
import type { SlideKind } from "./content-posts";
import type { CaptureLayout } from "./domQa";
import type { RunFailure } from "./finalize";

/** format key → job slug → captured layout, in capture order. */
export type LayoutsByFormat = Map<string, Map<string, { layout: CaptureLayout; slide: SlideKind }>>;

export type LayoutStabilityResult = {
  failures: RunFailure[];
  /** One progress line per format, as the generator logs it. */
  notes: string[];
};

export function evaluateLayoutStability(args: {
  layoutsByFormat: LayoutsByFormat;
  /** Post or challenge carousel (true) vs classic state set (false). */
  carousel: boolean;
  questionId: number | string;
}): LayoutStabilityResult {
  const failures: RunFailure[] = [];
  const notes: string[] = [];
  for (const [formatKey, byJob] of args.layoutsByFormat) {
    const cmp = (
      a: CaptureLayout,
      b: CaptureLayout,
      parts: readonly string[],
      label: string,
    ) => {
      for (const part of parts) {
        const ra = (a as Record<string, CaptureLayout[keyof CaptureLayout]>)[part] ?? null;
        const rb = (b as Record<string, CaptureLayout[keyof CaptureLayout]>)[part] ?? null;
        if (ra === null && rb === null) continue;
        const same =
          !!ra && !!rb &&
          Math.abs(ra.x - rb.x) <= 1 && Math.abs(ra.y - rb.y) <= 1 &&
          Math.abs(ra.w - rb.w) <= 1 && Math.abs(ra.h - rb.h) <= 1;
        if (!same) {
          failures.push({
            question_id: args.questionId,
            format: formatKey,
            state: label,
            classification: "layout-shift",
            message: `${part} geometry differs (${label}): ${JSON.stringify(ra)} vs ${JSON.stringify(rb)}`,
          });
        }
      }
    };

    if (args.carousel) {
      // Carousel: the composition chrome (deterministic per format) must
      // be identical across every slide; card/result vary with content.
      // The top CTA has two deliberate variants — full strip on
      // quiz-family slides, larger brand wordmark on end slides — so CTA
      // geometry is gated WITHIN each family, not across them.
      const entries = [...byJob.entries()];
      const [firstSlug, first] = entries[0] ?? [];
      const ctaRefByFamily = new Map<string, CaptureLayout>();
      if (firstSlug && first) {
        ctaRefByFamily.set(END_SLIDES.has(first.slide) ? "end" : "quiz", first.layout);
      }
      for (let i = 1; i < entries.length; i++) {
        const [slugB, b] = entries[i];
        if (first) {
          cmp(first.layout, b.layout, ["ground", "rail", "qr", "scan"], `frame:${slugB}`);
        }
        const family = END_SLIDES.has(b.slide) ? "end" : "quiz";
        const ctaRef = ctaRefByFamily.get(family);
        if (ctaRef) cmp(ctaRef, b.layout, ["cta"], `cta:${slugB}`);
        else ctaRefByFamily.set(family, b.layout);
      }
      notes.push(`  ◻ ${formatKey} post frame parity across ${entries.length} slide(s)`);
    } else {
      // Classic: the question and correct states of the SAME card must be
      // pixel-identical everywhere (≤1px) — the core anti-drift guarantee.
      const a = byJob.get("question");
      const b = byJob.get("correct");
      if (a && b) {
        cmp(
          a.layout,
          b.layout,
          ["card", "cta", "qr", "ground", "rail", "scan", "resultArea"],
          "correct",
        );
        notes.push(
          `  ◻ ${formatKey} layout parity — ground ${JSON.stringify(a.layout.ground)} | ` +
            `rail ${JSON.stringify(a.layout.rail)} | ` +
            `cta ${JSON.stringify(a.layout.cta)} | card ${JSON.stringify(a.layout.card)} | ` +
            `result ${JSON.stringify(a.layout.resultArea)} | qr ${JSON.stringify(a.layout.qr)} | ` +
            `scan ${JSON.stringify(a.layout.scan)}`,
        );
      }
    }
  }
  return { failures, notes };
}
