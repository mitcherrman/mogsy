import { describe, expect, it } from "vitest";
import { QuizAdminAuthError } from "@/lib/quiz/api";
import { bankState, DEFAULT_BANK_FILTERS, selectOptions, toReviewFilters } from "./bankFilters";

describe("question bank defaults", () => {
  it("opens on every review status, like Quiz Review (regression: forced 'approved' showed 0 matches)", () => {
    expect(DEFAULT_BANK_FILTERS.reviewStatus).toBe("");
    const sent = toReviewFilters(DEFAULT_BANK_FILTERS, 1);
    expect(sent.review_status).toBeUndefined();
    expect(sent.is_active).toBe(1);
    expect(sent.page_size).toBe(20);
  });
});

describe("selectOptions — the label always matches the value sent", () => {
  it("lists the backend's values when the selection is among them", () => {
    expect(selectOptions(["approved", "needs_fix"], "approved").map((o) => o.value)).toEqual(["approved", "needs_fix"]);
  });

  it("shows a selected value the bank does not have, instead of falling back to another label", () => {
    const opts = selectOptions(["unreviewed"], "approved");
    expect(opts[0]).toEqual({ value: "approved", label: "approved (none in bank)", absent: true });
    expect(opts.map((o) => o.value)).toContain("unreviewed");
  });

  it("adds nothing for the 'any' choice", () => {
    expect(selectOptions(["unreviewed"], "")).toEqual([{ value: "unreviewed", label: "unreviewed", absent: false }]);
  });
});

describe("bankState — every empty list says why", () => {
  const base = { loading: false, error: null, filters: DEFAULT_BANK_FILTERS };

  it("loading", () => {
    expect(bankState({ ...base, loading: true, total: undefined }).kind).toBe("loading");
  });

  it("missing authorization is not a request failure", () => {
    expect(bankState({ ...base, error: new QuizAdminAuthError("Not authorized"), total: undefined }).kind).toBe("unauthorized");
    const failed = bankState({ ...base, error: new Error("HTTP 502"), total: undefined });
    expect(failed).toEqual({ kind: "error", message: "The question bank could not be read: HTTP 502" });
  });

  it("a review status the bank does not contain is an invalid filter, not 'no matches'", () => {
    const s = bankState({
      ...base,
      total: 0,
      filters: { ...DEFAULT_BANK_FILTERS, reviewStatus: "approved" },
      options: { review_statuses: ["unreviewed"], categories: ["items"] },
    });
    expect(s).toEqual({ kind: "invalid", message: 'No question in the bank has review status "approved".' });
  });

  it("an empty result names the filters that produced it", () => {
    const s = bankState({ ...base, total: 0, filters: { ...DEFAULT_BANK_FILTERS, category: "items" }, options: { categories: ["items"] } });
    expect(s).toEqual({ kind: "empty", message: "No questions match: category items, live questions only." });
  });

  it("results carry the backend's total", () => {
    expect(bankState({ ...base, total: 1234 })).toEqual({ kind: "results", total: 1234 });
  });
});
