/**
 * Proof that Quiz Builder and Ranked Duel Review are RETIRED, not hidden.
 *
 * Hiding a tab is a one-line change that any later edit can undo. These
 * assertions are about the tree itself: the modules are gone, nothing imports
 * them, and the one capability worth keeping was moved somewhere neutral
 * rather than left behind a dark route.
 *
 * If a future change re-adds either subsystem, this file is where it fails.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../..");

/** Every .ts/.tsx file under src, so "nothing imports it" means nothing. */
function allSourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      allSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// This file necessarily NAMES the retired modules in order to assert their
// absence, so it must not scan itself.
const SELF = path.resolve(fileURLToPath(import.meta.url));
const FILES = allSourceFiles().filter((f) => path.resolve(f) !== SELF);
const rel = (f: string) => path.relative(SRC, f);

/** Source with comments stripped — a doc note is not a dependency. */
const codeOf = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const REMOVED_PATHS = [
  "pages/admin/QuizBuilderPro.tsx",
  "components/admin/quiz-builder",
  "lib/quiz-builder",
  "components/admin/ranked-duel-review",
  "lib/ranked-duel-review",
];

describe("Quiz Builder and Ranked Duel Review are gone from the tree", () => {
  it.each(REMOVED_PATHS)("%s no longer exists", (p) => {
    expect(existsSync(path.join(SRC, p)), `${p} still exists`).toBe(false);
  });

  it("nothing imports either retired module", () => {
    const offenders = FILES.filter((f) =>
      /from\s+["'][^"']*(quiz-builder|ranked-duel-review)[^"']*["']|import\(\s*["'][^"']*(quiz-builder|ranked-duel-review)[^"']*["']\s*\)/.test(
        codeOf(f),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no component named for either retired surface survives", () => {
    const offenders = FILES.filter((f) =>
      /\b(QuizBuilderPro|RankedDuelReviewPanel|QuizCandidateEditor|QuizDraftList)\b/.test(
        codeOf(f),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("the quiz API client exposes no builder endpoint", () => {
    const api = codeOf(path.join(SRC, "lib/quiz/api.ts"));
    expect(api).not.toMatch(/QuizBuilder/);
    expect(api).not.toMatch(/admin\/builder/);
  });

  it("the route-prefetch registry lazy-loads no deleted page", () => {
    const prefetch = codeOf(path.join(SRC, "lib/route-prefetch.ts"));
    // A stale lazy import here is a build-time break, not a dead link.
    expect(prefetch).not.toMatch(/QuizBuilderPro/);
    for (const m of prefetch.matchAll(/import\(\s*["']@\/([^"']+)["']\s*\)/g)) {
      const target = path.join(SRC, m[1]);
      const exists =
        existsSync(target) ||
        existsSync(`${target}.ts`) ||
        existsSync(`${target}.tsx`);
      expect(exists, `route-prefetch points at missing ${m[1]}`).toBe(true);
    }
  });
});

describe("the preview capability was kept, in a neutral home", () => {
  it("the neutral preview panel and its client exist", () => {
    expect(existsSync(path.join(SRC, "components/question-preview/QuestionPreviewPanel.tsx"))).toBe(true);
    expect(existsSync(path.join(SRC, "lib/question-preview/questionPreviewApi.ts"))).toBe(true);
  });

  it("Quiz Review is the consumer that replaced the retired panel", () => {
    const review = codeOf(path.join(SRC, "pages/admin/AdminQuizReview.tsx"));
    expect(review).toMatch(/QuestionPreviewPanel/);
    expect(review).toMatch(/rankedCandidateIdOf/);
  });

  it("the surviving client is read-only by construction", () => {
    const api = codeOf(path.join(SRC, "lib/question-preview/questionPreviewApi.ts"));
    // No `method` parameter exists at all, so no caller can ask for a write.
    expect(api).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)["']/);
    expect(api).toMatch(/method:\s*["']GET["']/);
  });
});
