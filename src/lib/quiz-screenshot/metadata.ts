/**
 * Per-question metadata.json builder. Pure module.
 * Deliberately never receives credentials/env — nothing secret can leak in.
 */
import { questionSlug, screenshotFileName } from "./paths";
import type { RenderQuestion, RenderState } from "./types";

export type CaptureRecord = {
  format: string;
  state: RenderState;
  file: string;
  width: number;
  height: number;
};

export type QaFinding = {
  severity: "failure" | "warning" | "info";
  code: string;
  message: string;
  format?: string;
  state?: string;
};

export type QuestionMetadata = {
  question_id: number | string;
  stable_slug: string;
  question_type: string;
  category: string | null;
  difficulty: number | null;
  prompt_preview: string;
  source_mode: string;
  states_requested: string[];
  states_rendered: string[];
  states_skipped: Array<{ state: string; reason: string }>;
  formats_requested: string[];
  formats_rendered: string[];
  screenshots: CaptureRecord[];
  warnings: QaFinding[];
  console_errors: string[];
  page_errors: string[];
  failed_requests: string[];
  missing_assets: string[];
  overflow_findings: QaFinding[];
  generated_at: string;
};

export function promptPreview(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function buildQuestionMetadata(args: {
  question: RenderQuestion;
  sourceMode: string;
  statesRequested: string[];
  formatsRequested: string[];
  screenshots: CaptureRecord[];
  statesSkipped: Array<{ state: string; reason: string }>;
  warnings: QaFinding[];
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  missingAssets: string[];
  overflowFindings: QaFinding[];
  generatedAt: string;
}): QuestionMetadata {
  const { question } = args;
  return {
    question_id: question.id,
    stable_slug: questionSlug(question.id),
    question_type: "multiple_choice",
    category: question.category ?? null,
    difficulty: question.difficulty ?? null,
    prompt_preview: promptPreview(question.question_text),
    source_mode: args.sourceMode,
    states_requested: args.statesRequested,
    states_rendered: [...new Set(args.screenshots.map((s) => s.state))],
    states_skipped: args.statesSkipped,
    formats_requested: args.formatsRequested,
    formats_rendered: [...new Set(args.screenshots.map((s) => s.format))],
    screenshots: args.screenshots,
    warnings: args.warnings,
    console_errors: args.consoleErrors,
    page_errors: args.pageErrors,
    failed_requests: args.failedRequests,
    missing_assets: args.missingAssets,
    overflow_findings: args.overflowFindings,
    generated_at: args.generatedAt,
  };
}

export function expectedScreenshotFile(
  formatKey: string,
  state: string,
): string {
  return screenshotFileName(formatKey, state);
}
