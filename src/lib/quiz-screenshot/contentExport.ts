/**
 * CC2 — one call from a plan to a finished, downloadable content package.
 *
 *   plan (./exportPlan.ts)  →  runBrowserExport per run  →  buildBrowserRunReport
 *                           →  one ZIP (buildRunArchive), daily package included
 *
 * This is the engine the CC3 Admin Content Creator drives. It adds no rendering,
 * QA or naming of its own; it sequences the modules that own those. A daily
 * package's three runs share one stylesheet bundle (the expensive part of a
 * capture) exactly as `runDailyPackage` shares one render server.
 */
import { buildCaptureStyleBundle, type CaptureStyleBundle } from "./browserCapture";
import {
  buildBrowserRunReport,
  buildDailyPackageManifest,
  buildRunArchive,
  type BrowserRunReport,
  type BrowserRunStatus,
  type RunArchive,
} from "./browserRun";
import type { BrowserExportSupport } from "./browserSupport";
import type { DailyPackagePlan, ExportCard, ExportPlan } from "./exportPlan";
import type { ExportRunResult } from "./runBrowserExport";
import type { RenderQuestion } from "./types";

export type ContentExportRequest =
  | { kind: "run"; plan: ExportPlan }
  | { kind: "daily"; plan: DailyPackagePlan };

export type ContentExportProgress = {
  /** Run being captured (its run directory). */
  runId: string;
  /** Cards finished across the whole request, and the total planned. */
  done: number;
  total: number;
  card: ExportCard;
};

export type ContentExportRun = {
  /** Daily-package post key, or null for a single run. */
  key: string | null;
  plan: ExportPlan;
  result: ExportRunResult;
  report: BrowserRunReport;
};

export type ContentExportResult = {
  kind: ContentExportRequest["kind"];
  status: BrowserRunStatus;
  runs: ContentExportRun[];
  packageManifest: ReturnType<typeof buildDailyPackageManifest> | null;
  archive: RunArchive;
  support: BrowserExportSupport;
};

export async function runContentExport(args: {
  request: ContentExportRequest;
  /** Every adapted question any run references. */
  questions: readonly RenderQuestion[];
  onProgress?: (progress: ContentExportProgress) => void;
  signal?: AbortSignal;
  /** Injected in tests; production builds it from the live document. */
  styleBundle?: CaptureStyleBundle;
  support?: BrowserExportSupport;
  platform?: string;
  sourceDescription?: string;
}): Promise<ContentExportResult> {
  const { request } = args;
  const errors = request.plan.errors;
  if (errors.length > 0) throw new Error(`The export plan is not runnable: ${errors.join(" ")}`);

  const runsToDo: Array<{ key: string | null; plan: ExportPlan }> =
    request.kind === "daily"
      ? request.plan.posts.map((p) => ({ key: p.key, plan: p.plan }))
      : [{ key: null, plan: request.plan }];
  const total = runsToDo.reduce((n, r) => n + r.plan.cards.length, 0);

  const { runBrowserExport } = await import("./runBrowserExport");
  const styleBundle = args.styleBundle ?? (await buildCaptureStyleBundle());

  const runs: ContentExportRun[] = [];
  let doneBefore = 0;
  let support: BrowserExportSupport | null = args.support ?? null;
  for (const { key, plan } of runsToDo) {
    const result = await runBrowserExport({
      plan,
      questions: args.questions,
      styleBundle,
      signal: args.signal,
      support: support ?? undefined,
      onProgress: (p) =>
        args.onProgress?.({ runId: plan.runDir, done: doneBefore + p.done, total, card: p.card }),
    });
    support = result.support;
    doneBefore += plan.cards.length;
    const report = await buildBrowserRunReport({
      plan,
      run: result,
      questions: args.questions,
      platform: args.platform,
      sourceDescription: args.sourceDescription,
    });
    runs.push({ key, plan, result, report });
  }

  const packageManifest =
    request.kind === "daily"
      ? buildDailyPackageManifest({
          prefix: request.plan.prefix,
          featuredQuestionId: request.plan.featuredQuestionId,
          reuseFeaturedAsOpener: request.plan.reuseFeaturedAsOpener,
          createdAt: runs[0]?.result.startedAt ?? new Date(),
          posts: runs.map((r) => ({ key: r.key!, report: r.report })),
        })
      : null;

  const archive = await buildRunArchive({
    runs: runs.map((r) => r.report),
    fileName: request.plan.zipFileName,
    packageManifest: packageManifest ?? undefined,
  });

  const statuses = runs.map((r) => r.report.status);
  const status: BrowserRunStatus = statuses.includes("failed")
    ? "failed"
    : statuses.includes("succeeded-with-warnings")
      ? "succeeded-with-warnings"
      : "succeeded";

  return { kind: request.kind, status, runs, packageManifest, archive, support: support! };
}
