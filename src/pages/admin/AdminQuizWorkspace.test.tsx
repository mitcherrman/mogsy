// ---------------------------------------------------------------------------
// Admin Quiz Review — the consolidated two-tab workspace.
//
// What is worth pinning here is the consolidation itself:
//   * exactly two tabs are visible, and the retired two are not;
//   * Ranked questions remain reachable through Quiz Review;
//   * a Diagnostics card is a DESTINATION — clicking it switches tab and
//     arrives with the affected rows already filtered.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AdminQuizWorkspace from "./AdminQuizWorkspace";
import type { QuizAuditReport, ReviewFilters } from "@/lib/quiz/api";

// --- the gate is not under test here ---------------------------------------
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// --- Quiz Review: a stub that reports the filters it was handed ------------
const reviewProps = vi.fn();
vi.mock("./AdminQuizReview", () => ({
  default: (props: {
    selectedQuestionId?: number | null;
    onSelectQuestion?: (id: number | null) => void;
    focusFilters?: ReviewFilters;
    focusLabel?: string;
  }) => {
    reviewProps(props);
    return (
      <div data-testid="quiz-review-tab">
        <div data-testid="review-focus">{JSON.stringify(props.focusFilters ?? null)}</div>
        <div data-testid="review-focus-label">{props.focusLabel ?? ""}</div>
        <div data-testid="review-selected">{String(props.selectedQuestionId ?? "")}</div>
        {/* Ranked provenance is reviewable here — the surface that replaced
            the retired Ranked Duel Review tab. */}
        <button onClick={() => props.onSelectQuestion?.(77)}>open question 77</button>
        <div>source: ranked_candidate</div>
      </div>
    );
  },
}));

// --- the audit report the Diagnostics tab renders --------------------------
const getQuizAudit = vi.fn();
const downloadAuditFlaggedCsv = vi.fn();
const getDbDrift = vi.fn();
vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getQuizAudit: (...a: unknown[]) => getQuizAudit(...a),
      downloadAuditFlaggedCsv: () => downloadAuditFlaggedCsv(),
      getDbDrift: () => getDbDrift(),
    },
  };
});

const AUDIT: QuizAuditReport = {
  ok: true,
  cached: false,
  status: "REVIEW NEEDED",
  generated_at: "2026-08-27T10:00:00Z",
  elapsed_seconds: 2.1,
  revision: "abcdef1234567890",
  database: { path: "/srv/lol_calc.db", name: "lol_calc.db" },
  tests_ran: false,
  baseline_ran: false,
  summary: {
    status: "REVIEW NEEDED",
    // Roster is COMPLETE here: the default fixture mirrors the database's
    // current state (173/173, nothing missing). The incomplete case is a
    // separate, explicitly historical test below.
    database_roster_count: 173,
    expected_roster_count: 173,
    roster_complete: true,
    roster_missing_from_database: [],
    expected_roster_source: "champion_item_builds_validation.json",
    questions_audited: 4959,
    suspicious_questions: 21,
    invalid_items: 22,
    retired_item_references: 44,
    realism_violations: 277,
    refresh_reconstruction_failures: 10,
    new_regressions: null,
    families_needing_review: ["combat_cooldown"],
    review_backlog: 1143,
    critical_findings: 31,
  },
  findings_total: 3567,
  groups: [
    {
      id: "bank:live_answer_defects",
      section: "bank",
      label: "Live answer defects",
      count: 10,
      severity: "critical",
      detail: "a live question whose stored answer fails an answer gate",
      chips: [],
      target: { kind: "ids", ids: [101, 102, 103], matched: 3, unmatched: 0, truncated: false },
    },
    {
      id: "realism:unrealistic_champion_item_state",
      section: "realism",
      label: "Realism: unrealistic champion item state",
      count: 134,
      severity: "warn",
      detail: "",
      chips: [],
      target: { kind: "ids", ids: [201, 202], matched: 2, unmatched: 0, truncated: false },
    },
    {
      id: "reconstruct:question_key_drift",
      section: "reconstruction",
      label: "Reconstruction: question key drift",
      count: 3,
      severity: "critical",
      detail: "",
      chips: [],
      target: { kind: "ids", ids: [301, 302, 303], matched: 3, unmatched: 0, truncated: false },
    },
    {
      id: "family:retired_but_active:old_family",
      section: "families",
      label: "Family old_family — retired but active",
      count: 648,
      severity: "critical",
      detail: "648 active row(s) in a RETIRED family",
      chips: [],
      target: { kind: "family", family: "old_family", ids: [], matched: 0, unmatched: 0, truncated: false },
    },
    {
      id: "items:invalid",
      section: "items",
      label: "Invalid item references (no canonical row)",
      count: 1,
      severity: "critical",
      detail: "",
      chips: [
        {
          label: "Ohmwrecker",
          detail: "no canonical row at all; referenced by 2 active question(s)",
          target: { kind: "search", search: "Ohmwrecker", ids: [], matched: 0, unmatched: 0, truncated: false },
        },
      ],
      target: { kind: "none", ids: [], matched: 0, unmatched: 0, truncated: false },
    },
  ],
  sections: {
    families: { families: 40, active_families: 12, unregenerable: [] },
    champions: { unresolved: [] },
    items: { items_referenced: 300, invalid_items: ["Ohmwrecker"], retired_items: [], questions_referencing_retired_items: 44, authority_findings: {} },
    bank: { questions: 4837, gates: { duplicate_options: 4 }, live_answer_defects: 10 },
    realism: { checked_family: "combat_cooldown", violations: { unrealistic_champion_item_state: 134 }, total: 134 },
    reconstruction: { checked: 900, reconstructed: 897, failures: { question_key_drift: 3 }, total_failures: 3 },
    refresh: { affected: 7, by_reason: { "stale:combat_cooldown": 7 } },
    generator: { ran: true, would_create: 5, already_present: 900, skipped_total: 12, skipped_by_reason: { no_build: 12 } },
    tests: { ran: false, reason: "--no-tests" },
  },
  baseline: null,
};

function Loc() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

function renderAt(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/admin/quiz-content"
            element={
              <>
                <AdminQuizWorkspace />
                <Loc />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const loc = () => screen.getByTestId("loc").textContent ?? "";

/** Radix TabsTrigger activates on mouseDown; a bare click does nothing. */
function selectTab(name: RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}
const focus = () => JSON.parse(screen.getByTestId("review-focus").textContent || "null");

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  getQuizAudit.mockResolvedValue(AUDIT);
  getDbDrift.mockResolvedValue({
    ok: true, status: "MATCH", differences: [],
    local_source: "lol_calc.db", remote_source: "https://prod.example",
    local_roster: 173, remote_roster: 173,
  });
  downloadAuditFlaggedCsv.mockResolvedValue({ blob: new Blob(["a"]), filename: "flagged.csv" });
  URL.createObjectURL = vi.fn(() => "blob:flagged");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------------- */

describe("two-tab navigation", () => {
  it("shows exactly Quiz Review and Diagnostics", () => {
    renderAt("/admin/quiz-content");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(tabs).toEqual(["Quiz Review", "Diagnostics"]);
  });

  it("no longer offers Quiz Builder or Ranked Duel Review", () => {
    renderAt("/admin/quiz-content");
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent ?? "");
    expect(tabs.some((t) => /Quiz Builder/i.test(t))).toBe(false);
    expect(tabs.some((t) => /Ranked Duel/i.test(t))).toBe(false);
    expect(screen.queryByText(/Quiz Builder/i)).toBeNull();
    expect(screen.queryByText(/Ranked Duel Review/i)).toBeNull();
  });

  it("opens on Quiz Review by default — review, not authoring, is the job", () => {
    renderAt("/admin/quiz-content");
    expect(screen.getByTestId("quiz-review-tab")).toBeTruthy();
  });

  it("falls back to Quiz Review for a retired tab in the URL", () => {
    renderAt("/admin/quiz-content?tab=ranked-duel");
    expect(screen.getByTestId("quiz-review-tab")).toBeTruthy();
  });

  it("mounts Diagnostics on ?tab=diagnostics and mirrors a tab switch in the URL", async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    expect(await screen.findByTestId("quiz-diagnostics")).toBeTruthy();

    selectTab(/Quiz Review/i);
    await waitFor(() => expect(loc()).toContain("tab=review"));
  });
});

describe("Ranked questions stay reviewable without a Ranked tab", () => {
  it("reviews Ranked provenance inside Quiz Review", () => {
    renderAt("/admin/quiz-content?tab=review");
    expect(within(screen.getByTestId("quiz-review-tab")).getByText(/ranked_candidate/)).toBeTruthy();
  });

  it("keeps the by-id question deep link working", () => {
    renderAt("/admin/quiz-content?tab=review&questionId=42");
    expect(screen.getByTestId("review-selected").textContent).toBe("42");
  });

  it("pushes a clicked question into the URL", async () => {
    renderAt("/admin/quiz-content?tab=review");
    fireEvent.click(screen.getByText("open question 77"));
    await waitFor(() => expect(loc()).toContain("questionId=77"));
  });
});

describe("Diagnostics → Quiz Review deep linking", () => {
  const openDiagnostics = async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    return screen.findByTestId("quiz-diagnostics");
  };

  const clickReviewOn = (testId: string) => {
    const card = screen.getByTestId(testId);
    fireEvent.click(within(card).getByRole("button", { name: /Review/i }));
  };

  it("opens the 10 live answer defects as those exact rows", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-bank:live_answer_defects");
    await waitFor(() => expect(screen.getByTestId("quiz-review-tab")).toBeTruthy());
    expect(loc()).toContain("tab=review");
    expect(loc()).toContain("ids=101%2C102%2C103");
    expect(focus()).toEqual({ ids: [101, 102, 103], page: 1 });
  });

  it("opens the 134 unrealistic champion/item states", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-realism:unrealistic_champion_item_state");
    await waitFor(() => expect(screen.getByTestId("quiz-review-tab")).toBeTruthy());
    expect(focus()).toEqual({ ids: [201, 202], page: 1 });
  });

  it("opens the 3 question-key drift issues", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-reconstruct:question_key_drift");
    await waitFor(() => expect(screen.getByTestId("quiz-review-tab")).toBeTruthy());
    expect(focus()).toEqual({ ids: [301, 302, 303], page: 1 });
  });

  it("opens a family as a family filter, not a row list", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-family:retired_but_active:old_family");
    await waitFor(() => expect(screen.getByTestId("quiz-review-tab")).toBeTruthy());
    expect(focus()).toEqual({ family: "old_family", page: 1 });
  });

  it("turns an item finding into a searchable destination rather than a dead end", async () => {
    await openDiagnostics();
    fireEvent.click(screen.getByRole("button", { name: "Ohmwrecker" }));
    await waitFor(() => expect(screen.getByTestId("quiz-review-tab")).toBeTruthy());
    expect(focus()).toEqual({ search: "Ohmwrecker", page: 1 });
  });

  it("labels the focus so Quiz Review can say why the list is short", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-bank:live_answer_defects");
    await waitFor(() =>
      expect(screen.getByTestId("review-focus-label").textContent).toBe("Live answer defects"),
    );
  });

  it("leaves no diagnostic card without a destination", async () => {
    await openDiagnostics();
    for (const group of AUDIT.groups) {
      const card = screen.getByTestId(`diag-group-${group.id}`);
      const clickable =
        within(card).queryByRole("button", { name: /Review/i }) ?? within(card).queryAllByRole("button")[0];
      expect(clickable, `${group.id} has no way to act on it`).toBeTruthy();
    }
  });

  it("drops a previous focus instead of intersecting two diagnostics", async () => {
    await openDiagnostics();
    clickReviewOn("diag-group-bank:live_answer_defects");
    await waitFor(() => expect(focus()).toEqual({ ids: [101, 102, 103], page: 1 }));

    selectTab(/Diagnostics/i);
    await screen.findByTestId("quiz-diagnostics");
    clickReviewOn("diag-group-family:retired_but_active:old_family");
    await waitFor(() => expect(focus()).toEqual({ family: "old_family", page: 1 }));
    expect(loc()).not.toContain("ids=");
  });
});

describe("Diagnostics surface", () => {
  it("leads with the status, the database and the revision", async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    expect(screen.getByTestId("audit-status").textContent).toBe("REVIEW NEEDED");
    expect(screen.getByText("lol_calc.db")).toBeTruthy();
    expect(screen.getByText("abcdef123456")).toBeTruthy();
  });

  it("reports the roster as DB/expected, never as a self-referential ratio", async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    // Current state: complete. The ratio is still rendered as DB/expected,
    // because a self-referential ratio reads full even when it is not.
    expect(screen.getByText("173/173")).toBeTruthy();
    expect(screen.queryByText(/^Missing: /)).toBeNull();
  });

  it("names the shortfall when the roster is NOT complete", async () => {
    // HISTORICAL SHAPE, not current state: local sat at 172 with Locke absent
    // before the onboarding was applied. Kept because a renderer that only
    // ever sees a healthy roster is not proven to show an unhealthy one.
    getQuizAudit.mockResolvedValue({
      ...AUDIT,
      summary: {
        ...AUDIT.summary,
        database_roster_count: 172,
        roster_complete: false,
        roster_missing_from_database: ["Locke"],
      },
    });
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    expect(screen.getByText("172/173")).toBeTruthy();
    expect(screen.getByText(/Missing: Locke/)).toBeTruthy();
  });

  it("re-runs the harness on Run Audit rather than serving the cache", async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    fireEvent.click(screen.getByRole("button", { name: /Run Audit/i }));
    await waitFor(() =>
      expect(getQuizAudit).toHaveBeenCalledWith({ refresh: true, tests: false, baseline: false }),
    );
  });

  it("exports the flagged CSV", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    fireEvent.click(screen.getByRole("button", { name: /Export Flagged CSV/i }));
    await waitFor(() => expect(downloadAuditFlaggedCsv).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it("never presents an unavailable baseline as 'no regressions'", async () => {
    getQuizAudit.mockResolvedValue({
      ...AUDIT,
      baseline_ran: false,
      baseline_error: "worktree unavailable",
    });
    renderAt("/admin/quiz-content?tab=diagnostics");
    await screen.findByTestId("quiz-diagnostics");
    expect(screen.getByText(/Baseline unavailable/)).toBeTruthy();
  });
});

describe("local vs production alignment", () => {
  const openDiagnostics = async () => {
    renderAt("/admin/quiz-content?tab=diagnostics");
    return screen.findByTestId("quiz-diagnostics");
  };

  it("states alignment in the operator's own words", async () => {
    await openDiagnostics();
    await waitFor(() =>
      expect(screen.getByTestId("db-drift-status").textContent).toBe(
        "LOCAL vs PRODUCTION: MATCH",
      ),
    );
  });

  it("names the champion that is missing locally, not just a count", async () => {
    // HISTORICAL SHAPE, not current state: local and production are both at
    // 173 today. This is the drift that actually occurred, kept as the
    // regression fixture for how a difference must be rendered.
    getDbDrift.mockResolvedValue({
      ok: true,
      status: "DRIFT DETECTED",
      local_roster: 172,
      remote_roster: 173,
      differences: [
        {
          area: "roster",
          detail: "LOCAL 172, PRODUCTION 173",
          missing_locally: ["Locke"],
          missing_remotely: [],
        },
        {
          area: "questions",
          detail: "bank differs (LOCAL 4958 rows, PRODUCTION 4990)",
          families: [{ family: "combat_cooldown", local: 291, remote: 323 }],
        },
      ],
    });
    await openDiagnostics();
    await waitFor(() =>
      expect(screen.getByTestId("db-drift-status").textContent).toContain("DRIFT DETECTED"),
    );
    const diffs = screen.getByTestId("db-drift-differences");
    expect(diffs.textContent).toContain("missing locally: Locke");
    expect(diffs.textContent).toContain("combat_cooldown");
  });

  it("never renders a gated check as aligned", async () => {
    // The failure that would matter: no credential, so nothing was compared —
    // and the card must not read like a pass.
    getDbDrift.mockResolvedValue({
      ok: true,
      status: "gated",
      reason: "No admin credential available to read the remote deployment.",
      differences: [],
    });
    await openDiagnostics();
    await waitFor(() => {
      const text = screen.getByTestId("db-drift-status").textContent ?? "";
      expect(text).toContain("gated");
      expect(text).not.toContain("MATCH");
    });
    expect(screen.getByText(/db_drift\.sh --local-only/)).toBeTruthy();
  });

  it("does not read an unreachable production as aligned either", async () => {
    getDbDrift.mockResolvedValue({
      ok: true,
      status: "unreachable",
      reason: "Could not read https://prod.example: HTTPError: 404",
      differences: [],
    });
    await openDiagnostics();
    await waitFor(() => {
      const text = screen.getByTestId("db-drift-status").textContent ?? "";
      expect(text).toContain("unreachable");
      expect(text).not.toContain("MATCH");
    });
  });
});
