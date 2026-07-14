/**
 * Static contact-sheet (index.html) builder for a screenshot run.
 * Pure string builder — works when opened directly from disk, relative
 * links only, all dynamic text HTML-escaped.
 */
import type { QuestionMetadata } from "./metadata";

export type RunSummaryForSheet = {
  runId: string;
  generatedAt: string;
  sourceDescription: string;
  statesRequested: string[];
  formatsRequested: string[];
  totalQuestions: number;
  captureCount: number;
  failureCount: number;
  warningCount: number;
};

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function findingList(title: string, items: string[]): string {
  if (!items.length) return "";
  return `<details><summary>${escapeHtml(title)} (${items.length})</summary><ul>${items
    .map((i) => `<li>${escapeHtml(i)}</li>`)
    .join("")}</ul></details>`;
}

export function buildContactSheet(
  summary: RunSummaryForSheet,
  questions: QuestionMetadata[],
): string {
  const rows = questions
    .map((q) => {
      const shots = q.screenshots
        .map(
          (s) =>
            `<figure><a href="${escapeHtml(`${q.stable_slug}/${s.file}`)}"><img loading="lazy" src="${escapeHtml(
              `${q.stable_slug}/${s.file}`,
            )}" alt="${escapeHtml(`${s.format} ${s.state}`)}"></a><figcaption>${escapeHtml(
              `${s.format} · ${s.state} · ${s.width}×${s.height}`,
            )}</figcaption></figure>`,
        )
        .join("");
      const findings = [
        findingList("Warnings", q.warnings.map((w) => `[${w.code}] ${w.message}`)),
        findingList("Overflow", q.overflow_findings.map((w) => `[${w.code}] ${w.message}`)),
        findingList("Console errors", q.console_errors),
        findingList("Page errors", q.page_errors),
        findingList("Failed requests", q.failed_requests),
        findingList("Missing assets", q.missing_assets),
        findingList(
          "Skipped states",
          q.states_skipped.map((s) => `${s.state}: ${s.reason}`),
        ),
      ].join("");
      return `<section class="q">
<h2>${escapeHtml(q.stable_slug)} <small>${escapeHtml(q.category ?? "uncategorized")}</small></h2>
<p class="prompt">${escapeHtml(q.prompt_preview)}</p>
<div class="shots">${shots || "<em>No captures</em>"}</div>
${findings}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quiz screenshots — ${escapeHtml(summary.runId)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:24px;}
h1{font-size:20px;} h2{font-size:15px;border-top:1px solid #30363d;padding-top:14px;}
h2 small{color:#8b949e;font-weight:normal;margin-left:8px;}
.meta{color:#8b949e;font-size:13px;line-height:1.6;}
.prompt{color:#c9d1d9;font-size:13px;max-width:900px;}
.shots{display:flex;flex-wrap:wrap;gap:12px;}
figure{margin:0;width:200px;} figure img{width:100%;height:auto;border:1px solid #30363d;border-radius:4px;background:#161b22;}
figcaption{font-size:11px;color:#8b949e;margin-top:2px;}
details{font-size:12px;color:#d29922;margin-top:6px;} details ul{margin:4px 0 8px 18px;padding:0;}
</style>
</head>
<body>
<h1>Quiz screenshot run ${escapeHtml(summary.runId)}</h1>
<p class="meta">
Generated: ${escapeHtml(summary.generatedAt)}<br>
Source: ${escapeHtml(summary.sourceDescription)}<br>
States: ${escapeHtml(summary.statesRequested.join(", "))} · Formats: ${escapeHtml(summary.formatsRequested.join(", "))}<br>
Questions: ${summary.totalQuestions} · Captures: ${summary.captureCount} · Failures: ${summary.failureCount} · Warnings: ${summary.warningCount}
</p>
${rows}
</body>
</html>
`;
}
