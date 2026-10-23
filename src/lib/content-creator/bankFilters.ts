/**
 * Content Creator — question-bank filters and what the bank panel should say.
 *
 * The backend's review statuses are not a fixed vocabulary: `filter-options`
 * returns `SELECT DISTINCT review_status FROM quiz_questions`, and the list
 * endpoint filters `review_status = ?` exactly. The first release defaulted to
 * `approved` and built the dropdown only from the backend's values; on a bank
 * with no `approved` row the browser showed the select's FIRST option ("Any
 * review status") while the request still sent `review_status=approved`, so
 * the owner saw "Any" and `0 matches`. This module keeps the label and the
 * request the same thing, and names every reason the list can be empty.
 * Pure: no React, no fetch.
 */
import { QuizAdminAuthError, QuizAuthRequiredError, type ReviewFilters } from "@/lib/quiz/api";

export const BANK_PAGE_SIZE = 20;

export type BankFilters = {
  search: string;
  category: string;
  reviewStatus: string;
  difficulty: string;
  pack: string;
  activeOnly: boolean;
  withImage: boolean;
};

/** Same scope Quiz Review opens with: every review status, live questions. */
export const DEFAULT_BANK_FILTERS: BankFilters = {
  search: "",
  category: "",
  reviewStatus: "",
  difficulty: "",
  pack: "",
  activeOnly: true,
  withImage: false,
};

export function toReviewFilters(f: BankFilters, page: number): ReviewFilters {
  const difficulty = f.difficulty ? Number(f.difficulty) : undefined;
  return {
    search: f.search.trim() || undefined,
    category: f.category || undefined,
    review_status: f.reviewStatus || undefined,
    difficulty_min: difficulty,
    difficulty_max: difficulty,
    pack_key: f.pack || undefined,
    is_active: f.activeOnly ? 1 : undefined,
    has_image: f.withImage ? 1 : undefined,
    page,
    page_size: BANK_PAGE_SIZE,
  };
}

/**
 * Dropdown options that always contain the selected value, so the visible
 * label can never disagree with the filter being sent. A selected value the
 * bank does not have is shown as such, not hidden behind another label.
 */
export function selectOptions(available: readonly string[] | undefined, selected: string): Array<{ value: string; label: string; absent: boolean }> {
  const list = [...(available ?? [])];
  const out = list.map((v) => ({ value: v, label: v.replace(/_/g, " "), absent: false }));
  if (selected && !list.includes(selected)) {
    out.unshift({ value: selected, label: `${selected.replace(/_/g, " ")} (none in bank)`, absent: true });
  }
  return out;
}

/** The filters that are narrowing the list, in the operator's words. */
export function activeFilterSummary(f: BankFilters): string[] {
  const parts: string[] = [];
  if (f.search.trim()) parts.push(`search "${f.search.trim()}"`);
  if (f.category) parts.push(`category ${f.category}`);
  if (f.difficulty) parts.push(`difficulty ${f.difficulty}`);
  if (f.reviewStatus) parts.push(`review status ${f.reviewStatus.replace(/_/g, " ")}`);
  if (f.pack) parts.push(`pack ${f.pack}`);
  if (f.activeOnly) parts.push("live questions only");
  if (f.withImage) parts.push("with artwork");
  return parts;
}

export type BankState =
  | { kind: "loading" }
  | { kind: "unauthorized"; message: string }
  | { kind: "error"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "results"; total: number };

/**
 * One truthful answer for the panel. `options` are the backend's filter
 * options when they have loaded.
 */
export function bankState(args: {
  loading: boolean;
  error: unknown;
  total: number | undefined;
  filters: BankFilters;
  options?: { categories?: string[]; review_statuses?: string[] } | null;
}): BankState {
  const { error, filters, options } = args;
  if (error) {
    if (error instanceof QuizAdminAuthError || error instanceof QuizAuthRequiredError) {
      return { kind: "unauthorized", message: "This account is not authorized to read the question bank. Sign in again as the owner." };
    }
    const text = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: `The question bank could not be read: ${text}` };
  }
  if (args.loading || args.total === undefined) return { kind: "loading" };
  if (args.total > 0) return { kind: "results", total: args.total };

  if (options?.review_statuses && filters.reviewStatus && !options.review_statuses.includes(filters.reviewStatus)) {
    return { kind: "invalid", message: `No question in the bank has review status "${filters.reviewStatus.replace(/_/g, " ")}".` };
  }
  if (options?.categories && filters.category && !options.categories.includes(filters.category)) {
    return { kind: "invalid", message: `No question in the bank is in category "${filters.category}".` };
  }
  const narrowing = activeFilterSummary(filters);
  return {
    kind: "empty",
    message: narrowing.length
      ? `No questions match: ${narrowing.join(", ")}.`
      : "The question bank returned no questions.",
  };
}
