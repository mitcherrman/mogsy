import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PatchOpsCard from "./PatchOpsCard";
import PatchOpsDetail from "./PatchOpsDetail";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type {
  PatchOpsOperation,
  PatchOpsOperationDetail,
} from "@/lib/knowledge-admin/types";

/**
 * The Patch Ops admin card.
 *
 * The behaviour under test is mostly RESTRAINT. The backend decides whether a
 * patch needs a person (`attention_required` / `admin_status`), and the single
 * most important assertion in this file is that a patch with dozens of
 * UNSUPPORTED changes still renders as a success — because that is the
 * ordinary shape of a real patch, and a card that cried wolf about it would be
 * ignored within two patches.
 */

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { email: "admin@test" } }),
}));

/* The Supabase singleton reaches for a browser auth store this jsdom setup does
   not provide, and its failure surfaces as an unhandled rejection that Vitest
   warns can cause false positives. Stubbing the bearer path leaves the explicit
   X-Admin-Key fallback — the credential these tests assert on — untouched. */
vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({}),
  ensureBackendAuthToken: async () => null,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const operation = (over: Partial<PatchOpsOperation> = {}): PatchOpsOperation => ({
  operation_id: "26.17#1",
  patch_version: "26.17",
  generation: 1,
  lifecycle_state: "CLOSED_SUCCESSFULLY",
  outcome: "COMPLETED",
  opened_at: "2026-08-19T00:00:00Z",
  updated_at: "2026-08-19T02:00:00Z",
  completed_at: "2026-08-19T02:00:00Z",
  actor: "patchops_automation",
  admin_status: "UPDATED",
  attention_required: false,
  attention_reasons: [],
  reconciliation: {
    available: true,
    unavailable_reason: null,
    status: "RECONCILED",
    stored_status: "RECONCILED",
    operator_attention: { required: false, reasons: [], quiet: true },
    outstanding: { review_required: 0, failed: 0, eligible_not_applied: 0, unsupported: 27 },
  },
  counts: {
    auto_applied: 14,
    already_reconciled: 3,
    review_required: 0,
    failed: 0,
    apply_failed: 0,
    blocked: 0,
    unsupported: 27,
    report_only: 2,
    ignored_non_sr: 5,
    pending_apply: 0,
    total_changes: 51,
  },
  undo_available: true,
  ...over,
});

const detail = (over: Partial<PatchOpsOperationDetail> = {}): PatchOpsOperationDetail => ({
  ...operation(),
  receipt: null,
  applied_history_ids: [101, 102],
  rows: { review_required: [], failed: [], applied: [] },
  row_limit: 50,
  ...over,
});

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PatchOpsCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderDetail(operationId = "26.17#1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/admin/knowledge/patch-ops/${encodeURIComponent(operationId)}`]}>
        <Routes>
          <Route path="/admin/knowledge/patch-ops/:operationId" element={<PatchOpsDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setAdminKey("test-key");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe("PatchOpsCard — success state", () => {
  it("shows the patch version, the success verdict and no action required", async () => {
    fetchMock.mockResolvedValue(json({ operation: operation() }));
    renderCard();

    expect(await screen.findByText("26.17")).toBeInTheDocument();
    expect(screen.getByText("Updated successfully")).toBeInTheDocument();
    expect(screen.getByText("No action required")).toBeInTheDocument();
  });

  it("renders the counts the backend supplied", async () => {
    fetchMock.mockResolvedValue(json({ operation: operation() }));
    renderCard();

    await screen.findByText("26.17");
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("auto-applied")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("already current")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("unsupported")).toBeInTheDocument();
  });

  it("states that undo is available without offering to perform one", async () => {
    fetchMock.mockResolvedValue(json({ operation: operation() }));
    renderCard();

    expect(await screen.findByText("Undo available")).toBeInTheDocument();
    // Visibility only. This phase adds no admin-triggered undo, so nothing
    // here may be clickable into a production write.
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("links to the operation's own detail route with the id encoded", async () => {
    fetchMock.mockResolvedValue(json({ operation: operation() }));
    renderCard();

    const link = await screen.findByRole("link", { name: "Inspect" });
    // `#` is a fragment delimiter: an unencoded href would navigate to
    // /patch-ops/26.17 and quietly address a different operation.
    expect(link).toHaveAttribute("href", "/admin/knowledge/patch-ops/26.17%231");
  });
});

describe("PatchOpsCard — UNSUPPORTED is not a failure", () => {
  it("renders a patch with heavy unsupported coverage as a success", async () => {
    fetchMock.mockResolvedValue(json({
      operation: operation({
        counts: { ...operation().counts, unsupported: 312, report_only: 40, ignored_non_sr: 88 },
      }),
    }));
    renderCard();

    expect(await screen.findByText("Updated successfully")).toBeInTheDocument();
    expect(screen.getByText("No action required")).toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).toBeNull();
    expect(screen.queryByText(/require review/)).toBeNull();
  });

  it("obeys the backend even when the counts look alarming", async () => {
    /* The inverse guard: the backend says attention IS required while every
       count a UI might key on is zero. The card must follow the backend, not
       the numbers — the rule lives on the server and only there. */
    fetchMock.mockResolvedValue(json({
      operation: operation({
        admin_status: "NEEDS_ATTENTION",
        attention_required: true,
        attention_reasons: ["bookkeeping errors occurred"],
        counts: {
          ...operation().counts,
          auto_applied: 0, unsupported: 0, review_required: 0, failed: 0,
        },
      }),
    }));
    renderCard();

    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("bookkeeping errors occurred")).toBeInTheDocument();
    expect(screen.queryByText("No action required")).toBeNull();
  });
});

describe("PatchOpsCard — attention state", () => {
  const attention = operation({
    admin_status: "NEEDS_ATTENTION",
    attention_required: true,
    attention_reasons: [
      "2 change(s) are REVIEW_REQUIRED — target ambiguity, live canonical drift, or a proposal/writer conflict that cannot resolve itself",
      "the publication did not fully close: Patch Ops recorded FAILED_ARCHIVE",
    ],
    outcome: "FAILED",
    lifecycle_state: "FAILED_ARCHIVE",
    // The backend writes completed_at only for a COMPLETED outcome
    // (patch_operations.row_for), so a failed operation genuinely has none.
    completed_at: null,
    counts: { ...operation().counts, auto_applied: 12, review_required: 2, failed: 1 },
  });

  it("does not say a failed publication 'completed'", async () => {
    fetchMock.mockResolvedValue(json({ operation: attention }));
    renderCard();

    await screen.findByText("Needs attention");
    expect(screen.queryByText(/^Completed /)).toBeNull();
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  it("shows the attention verdict and the backend's own reasons", async () => {
    fetchMock.mockResolvedValue(json({ operation: attention }));
    renderCard();

    expect(await screen.findByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/2 change\(s\) are REVIEW_REQUIRED/)).toBeInTheDocument();
    expect(screen.getByText(/the publication did not fully close/)).toBeInTheDocument();
  });

  it("surfaces only the non-zero actionable counts", async () => {
    fetchMock.mockResolvedValue(json({ operation: attention }));
    renderCard();

    await screen.findByText("Needs attention");
    expect(screen.getByText("2 require review · 1 failed")).toBeInTheDocument();
  });

  it("offers a strong inspection path", async () => {
    fetchMock.mockResolvedValue(json({ operation: attention }));
    renderCard();

    const link = await screen.findByRole("link", { name: "Review operation" });
    expect(link).toHaveAttribute("href", "/admin/knowledge/patch-ops/26.17%231");
  });
});

describe("PatchOpsCard — in progress, empty and historical", () => {
  it("renders an in-flight operation without inventing progress", async () => {
    fetchMock.mockResolvedValue(json({
      operation: operation({
        admin_status: "PROCESSING",
        outcome: "IN_PROGRESS",
        lifecycle_state: "AUTHORITY_APPLIED",
        completed_at: null,
      }),
    }));
    renderCard();

    expect(await screen.findByText("Processing")).toBeInTheDocument();
    expect(screen.getByText("In progress — nothing to do yet")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("renders an empty state when nothing has published", async () => {
    fetchMock.mockResolvedValue(json({ operation: null }));
    renderCard();

    expect(await screen.findByText("No patch operation recorded yet.")).toBeInTheDocument();
    expect(screen.queryByText("Needs attention")).toBeNull();
  });

  it("does not claim zero applied changes for an unreconciled historical patch", async () => {
    fetchMock.mockResolvedValue(json({
      operation: operation({
        patch_version: "26.14",
        operation_id: "26.14#1",
        reconciliation: {
          available: false,
          unavailable_reason: "no reconciliation was recorded for this operation",
          status: "NOT_STARTED",
          stored_status: "NOT_STARTED",
          operator_attention: { required: false, reasons: [], quiet: false },
          outstanding: null,
        },
        counts: {
          auto_applied: 0, already_reconciled: 0, review_required: 0, failed: 0,
          apply_failed: 0, blocked: 0, unsupported: 0, report_only: 0,
          ignored_non_sr: 0, pending_apply: 0, total_changes: 0,
        },
        undo_available: false,
      }),
    }));
    renderCard();

    expect(await screen.findByText("26.14")).toBeInTheDocument();
    expect(screen.getByText("no reconciliation was recorded for this operation")).toBeInTheDocument();
    expect(screen.queryByText("auto-applied")).toBeNull();
  });

  it("shows the attempt number when an operation is a retry", async () => {
    fetchMock.mockResolvedValue(json({
      operation: operation({ operation_id: "26.17#2", generation: 2 }),
    }));
    renderCard();

    expect(await screen.findByText("attempt 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inspect" }))
      .toHaveAttribute("href", "/admin/knowledge/patch-ops/26.17%232");
  });
});

describe("PatchOpsCard — backend failure", () => {
  it("renders the failure instead of an implied success", async () => {
    fetchMock.mockResolvedValue(json({ detail: "Admin authorization required" }, 403));
    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/Admin authorization required/)).toBeInTheDocument());
    // The dangerous failure mode is a broken card that looks calm.
    expect(screen.queryByText("Updated successfully")).toBeNull();
    expect(screen.queryByText("No action required")).toBeNull();
  });

  it("renders a network failure the same way", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderCard();

    await waitFor(() => expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument());
    expect(screen.queryByText("No action required")).toBeNull();
  });
});

describe("PatchOpsCard — request shape", () => {
  it("calls the admin patch-ops endpoint with the admin credential", async () => {
    fetchMock.mockResolvedValue(json({ operation: operation() }));
    renderCard();

    await screen.findByText("26.17");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/admin/knowledge/patch-ops/latest");
    expect(new Headers(init.headers).get("X-Admin-Key")).toBe("test-key");
    // Read-only surface: never a write verb.
    expect(init.method ?? "GET").toBe("GET");
  });
});

describe("PatchOpsDetail", () => {
  it("requests the operation with its generation encoded", async () => {
    fetchMock.mockResolvedValue(json(detail({ operation_id: "26.17#2", generation: 2 })));
    renderDetail("26.17#2");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0]))
      .toContain("/patch-ops/operations/26.17%232");
  });

  it("renders the counts and the review/failed/applied sections", async () => {
    fetchMock.mockResolvedValue(json(detail({
      counts: { ...operation().counts, review_required: 1 },
      rows: {
        review_required: [{
          entity_type: "champion", entity_name: "Camille", canonical_ref: null,
          ability_slot: "W", riot_property: "Cooldown", mogzy_property: "cooldown",
          mode_scope: "SUMMONERS_RIFT", section_id: null,
          before_raw: "15", after_raw: "12", mogzy_current_raw: "14",
          disposition: "REVIEW_REQUIRED",
          disposition_reason: "CANONICAL_VALUE_DRIFTED",
          apply_result: "NOT_APPLIED", resolver_status: "RESOLVED",
          updated_at: "2026-08-19T02:00:00Z",
        }],
        failed: [], applied: [],
      },
    })));
    renderDetail();

    expect(await screen.findByText("Require review (1)")).toBeInTheDocument();
    expect(screen.getByText("Camille W")).toBeInTheDocument();
    expect(screen.getByText("CANONICAL_VALUE_DRIFTED")).toBeInTheDocument();
    expect(screen.getByText("Failed (0)")).toBeInTheDocument();
    expect(screen.getByText("No change failed.")).toBeInTheDocument();
  });

  it("says how many rows it is showing when the list is short of the total", async () => {
    const row = {
      entity_type: "champion", entity_name: "Ahri", canonical_ref: null,
      ability_slot: "E", riot_property: "Cooldown", mogzy_property: "cooldown",
      mode_scope: "SUMMONERS_RIFT", section_id: null, before_raw: "14",
      after_raw: "12", mogzy_current_raw: "12", disposition: "AUTO_APPLY_ELIGIBLE",
      disposition_reason: "POLICY_ELIGIBLE", apply_result: "APPLIED",
      resolver_status: "RESOLVED", updated_at: "2026-08-19T02:00:00Z",
    };
    fetchMock.mockResolvedValue(json(detail({
      counts: { ...operation().counts, auto_applied: 12 },
      rows: { review_required: [], failed: [], applied: [row] },
    })));
    renderDetail();

    // The count is what was actually returned, not the cap — "first 50 of 12"
    // is nonsense and would make the reader distrust the whole page.
    expect(await screen.findByText("Showing 1 of 12.")).toBeInTheDocument();
    expect(screen.queryByText(/first 50/)).toBeNull();
  });

  it("names the undo path without exposing a control for it", async () => {
    fetchMock.mockResolvedValue(json(detail()));
    renderDetail();

    expect(await screen.findByText(/still\s+undoable through the existing apply-history undo/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("renders missing optional fields as em dashes, never as zeros", async () => {
    fetchMock.mockResolvedValue(json(detail({
      opened_at: null, completed_at: null, actor: null,
      applied_history_ids: [],
      reconciliation: {
        available: false,
        unavailable_reason: "the reconciliation schema on this database is MISSING",
        status: null, stored_status: null,
        operator_attention: { required: false, reasons: [], quiet: false },
        outstanding: null,
      },
    })));
    renderDetail();

    // Stated twice on purpose — once in the header summary, once in the
    // Reconciliation panel — so `findAllByText`, not `findByText`.
    expect((await screen.findAllByText(
      "the reconciliation schema on this database is MISSING")).length)
      .toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders a backend failure rather than an empty operation", async () => {
    fetchMock.mockResolvedValue(json({ detail: "No Patch Ops operation '99.9#1' is recorded" }, 404));
    renderDetail("99.9#1");

    await waitFor(() =>
      expect(screen.getByText(/No Patch Ops operation/)).toBeInTheDocument());
    expect(screen.queryByText("Updated successfully")).toBeNull();
  });
});
