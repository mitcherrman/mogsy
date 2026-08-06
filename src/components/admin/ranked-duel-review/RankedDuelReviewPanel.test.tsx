import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RankedDuelReviewPanel } from "./RankedDuelReviewPanel";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import { setReviewer } from "./reviewerIdentity";
import type { CandidateDetail, CandidateSummary, ReviewStatus } from "@/lib/ranked-duel-review/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const errBody = (status: number, error_code: string, message = "err") =>
  json({ detail: { error_code, message } }, status);

const STATUS: ReviewStatus = {
  total_source_candidates: 30,
  unreviewed: 29,
  accepted: 1,
  revised: 0,
  rejected: 0,
  stale_source_changed: 0,
  invalid_revised_records: 0,
  exportable: 1,
  orphaned_review_records: 0,
  orphaned_ids: [],
  counts_by_family: { tank_hp: { unreviewed: 29, accepted: 1 } },
  accepted_correct_index_distribution: { "0": 1, "1": 0, "2": 0, "3": 0 },
  minimum_required_count: 30,
  all_indices_represented: false,
  distribution_warning: false,
  distribution_warning_detail: null,
  structural_validation_ok: true,
  structural_problems: [],
  external_alpha_ready: false,
  external_alpha_blockers: ["Only 1 of 30 exportable", "indices 1,2,3 missing"],
};

const ROWS: CandidateSummary[] = [
  {
    candidate_id: "tank_hp:seed1:f1",
    family: "tank_hp",
    difficulty: "medium",
    prompt_summary: "How much effective HP does 170 base grant…",
    decision: "unreviewed",
    derived_status: "unreviewed",
    stale: false,
    exportable: false,
    source_hash: "sha256:aaa",
    reviewed_at: null,
    reviewer: null,
  },
  {
    candidate_id: "tank_hp:seed2:f2",
    family: "tank_hp",
    difficulty: "hard",
    prompt_summary: "Second candidate prompt…",
    decision: "accepted",
    derived_status: "accepted",
    stale: false,
    exportable: true,
    source_hash: "sha256:bbb",
    reviewed_at: "2026-07-15T00:00:00Z",
    reviewer: "prior",
  },
];

const DETAIL = (id: string, over: Partial<CandidateDetail> = {}): CandidateDetail => ({
  candidate_id: id,
  source_hash: id === "tank_hp:seed2:f2" ? "sha256:bbb" : "sha256:aaa",
  candidate_version: 1,
  family: "tank_hp",
  difficulty_target: "medium",
  difficulty_features: null,
  question_text: "How much effective HP does 170 base grant against 100 armor?",
  options: ["340", "170", "255", "425"],
  correct_answer: "340",
  correct_answer_index: 0,
  scenario: null,
  formula_id: "f1",
  inputs: {},
  calculation_steps: null,
  distractor_derivations: null,
  data_version: "1",
  plausibility_validation: null,
  generation_safety: null,
  derived_status: id === "tank_hp:seed2:f2" ? "accepted" : "unreviewed",
  review: {
    decision: id === "tank_hp:seed2:f2" ? "accepted" : "unreviewed",
    reviewer: id === "tank_hp:seed2:f2" ? "prior" : null,
    reviewed_at: null,
    notes: "",
    revised_candidate: null,
    source_hash: id === "tank_hp:seed2:f2" ? "sha256:bbb" : null,
    history: [],
  },
  validation_warnings: [],
  ...over,
});

interface Backend {
  status: ReviewStatus;
  rows: CandidateSummary[];
  detailOverride: Partial<CandidateDetail>;
  errors: Record<string, Response | undefined>; // keyed by "accept"|"reject"|"revise"|...
  calls: { accept: unknown[]; reject: unknown[]; revise: unknown[]; export: number; validate: number; preview: string[]; detail: string[] };
  lastListUrl: string | null;
}
let backend: Backend;

const install = () => {
  const impl = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = String(url);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body as string) : undefined;

    if (u.includes("/questions/status")) return json(backend.status);
    if (u.match(/\/questions\/candidates\?/) || u.endsWith("/questions/candidates")) {
      backend.lastListUrl = u;
      return json(backend.rows);
    }
    // RA9 operator preview projection (read-only, no correct answer).
    const previewMatch = u.match(/\/questions\/candidates\/([^/?]+)\/public-view$/);
    if (previewMatch && method === "GET") {
      const id = decodeURIComponent(previewMatch[1]);
      backend.calls.preview.push(id);
      if (backend.errors.preview) return backend.errors.preview;
      return json({
        question_id: id,
        prompt: "How much effective HP does 170 base grant against 100 armor?",
        options: ["340", "170", "255", "425"],
        category: "tank_hp",
        module_id: "quiz",
        derived_status: "unreviewed",
      });
    }
    const detailMatch = u.match(/\/questions\/candidates\/([^/?]+)$/);
    if (detailMatch && method === "GET") {
      const id = decodeURIComponent(detailMatch[1]);
      backend.calls.detail.push(id);
      if (backend.errors.detail) return backend.errors.detail;
      return json(DETAIL(id, backend.detailOverride));
    }
    if (u.includes("/accept")) {
      if (backend.errors.accept) return backend.errors.accept;
      backend.calls.accept.push(body);
      return json({ candidate_id: "x", decision: "accepted", reviewer: body.reviewer, reviewed_at: "now", notes: body.notes ?? "", source_hash: body.source_hash });
    }
    if (u.includes("/reject")) {
      if (backend.errors.reject) return backend.errors.reject;
      backend.calls.reject.push(body);
      return json({ candidate_id: "x", decision: "rejected", reviewer: body.reviewer, reviewed_at: "now", notes: "", source_hash: body.source_hash });
    }
    if (u.includes("/revise")) {
      if (backend.errors.revise) return backend.errors.revise;
      backend.calls.revise.push(body);
      return json({ candidate_id: "x", decision: "revised", reviewer: body.reviewer, reviewed_at: "now", notes: "", source_hash: body.source_hash });
    }
    if (u.includes("/validate")) {
      backend.calls.validate += 1;
      return json({ source_candidates: 30, review_records: 1, stale: 0, stale_ids: [], problems: [], structural_valid: true, export: {}, external_alpha_ready: false });
    }
    if (u.includes("/export")) {
      backend.calls.export += 1;
      return json({ export_path: "reports/ranked_candidates_accepted.json", counts: { exported: 1, accepted: 1, revised: 0, source_total: 30 }, excluded: { unreviewed: 29 } });
    }
    return json({ detail: "unexpected route" }, 500);
  };
  vi.stubGlobal("fetch", vi.fn(impl) as unknown as typeof fetch);
};

beforeEach(() => {
  setAdminKey("secret-admin");
  backend = {
    status: STATUS,
    rows: ROWS,
    detailOverride: {},
    errors: {},
    calls: { accept: [], reject: [], revise: [], export: 0, validate: 0, preview: [], detail: [] },
    lastListUrl: null,
  };
  install();
});
afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.unstubAllGlobals();
  try {
    sessionStorage.clear();
  } catch {
    /* noop */
  }
});

const selectFirst = async () => {
  fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed1:f1"));
  await screen.findByTestId("rd-correct-answer");
};

describe("RankedDuelReviewPanel — status & list", () => {
  it("renders readiness, exportable/min, index distribution and blockers", async () => {
    render(<RankedDuelReviewPanel />);
    await screen.findByTestId("rd-status");
    expect(screen.getByTestId("rd-readiness").textContent).toContain("Not alpha-ready");
    expect(screen.getByTestId("rd-exportable-count").textContent).toContain("1");
    expect(screen.getByTestId("rd-exportable-count").textContent).toContain("30");
    expect(screen.getByTestId("rd-index-dist").textContent).toContain("0:1");
    expect(screen.getByTestId("rd-blockers").textContent).toContain("missing");
  });

  it("lists candidates WITHOUT exposing any correct answer", async () => {
    render(<RankedDuelReviewPanel />);
    const list = await screen.findByTestId("rd-candidate-list");
    expect(within(list).getByTestId("rd-cand-tank_hp:seed1:f1")).toBeTruthy();
    // The correct answer "340" must not appear anywhere in the list column.
    expect(list.textContent).not.toContain("340");
  });

  it("shows the correct answer/index ONLY in candidate detail (admin-only)", async () => {
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    expect(screen.getByTestId("rd-correct-answer").textContent).toContain("340");
    expect(screen.getByTestId("rd-correct-answer").textContent).toContain("index 0");
  });

  it("refetches the list when a filter changes", async () => {
    render(<RankedDuelReviewPanel />);
    await screen.findByTestId("rd-status");
    fireEvent.change(screen.getByTestId("rd-filter-decision"), { target: { value: "unreviewed" } });
    await waitFor(() => expect(backend.lastListUrl).toContain("decision=unreviewed"));
  });
});

describe("RankedDuelReviewPanel — decisions", () => {
  it("requires a reviewer identity before any decision", async () => {
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    expect(screen.getByTestId("rd-reviewer-required")).toBeTruthy();
    expect((screen.getByTestId("rd-mode-accept") as HTMLButtonElement).disabled).toBe(true);
  });

  it("accepts with source_hash + reviewer (single explicit call)", async () => {
    setReviewer("mitchell");
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    fireEvent.click(screen.getByTestId("rd-mode-accept"));
    fireEvent.change(screen.getByTestId("rd-accept-notes"), { target: { value: "verified" } });
    fireEvent.click(screen.getByTestId("rd-accept-submit"));
    await waitFor(() => expect(backend.calls.accept).toHaveLength(1));
    expect(backend.calls.accept[0]).toMatchObject({
      source_hash: "sha256:aaa",
      reviewer: "mitchell",
      notes: "verified",
      overwrite: false,
    });
  });

  it("blocks reject until a reason is entered, then sends it", async () => {
    setReviewer("m");
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    fireEvent.click(screen.getByTestId("rd-mode-reject"));
    expect((screen.getByTestId("rd-reject-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("rd-reject-reason"), { target: { value: "bad math" } });
    fireEvent.click(screen.getByTestId("rd-reject-submit"));
    await waitFor(() => expect(backend.calls.reject).toHaveLength(1));
    expect(backend.calls.reject[0]).toMatchObject({ reason: "bad math", reviewer: "m" });
  });

  it("sends only editable fields on revise", async () => {
    setReviewer("m");
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    fireEvent.click(screen.getByTestId("rd-mode-revise"));
    fireEvent.change(screen.getByTestId("rd-revise-question"), { target: { value: "Clearer prompt?" } });
    fireEvent.click(screen.getByTestId("rd-revise-submit"));
    await waitFor(() => expect(backend.calls.revise).toHaveLength(1));
    const body = backend.calls.revise[0] as { patch: Record<string, unknown> };
    expect(body.patch.question_text).toBe("Clearer prompt?");
    // Only editable keys present.
    expect(Object.keys(body.patch).sort()).toEqual(
      ["correct_answer", "difficulty_target", "options", "question_text"].sort(),
    );
  });

  it("surfaces a stale conflict with a reload affordance and does not silently proceed", async () => {
    setReviewer("m");
    backend.errors.accept = errBody(409, "stale_candidate", "reload before reviewing");
    render(<RankedDuelReviewPanel />);
    await selectFirst();
    fireEvent.click(screen.getByTestId("rd-mode-accept"));
    fireEvent.click(screen.getByTestId("rd-accept-submit"));
    await waitFor(() => expect(screen.getByTestId("rd-action-error")).toBeTruthy());
    expect(screen.getByTestId("rd-action-error").textContent).toContain("Reload");
    expect(screen.getByTestId("rd-reload-detail")).toBeTruthy();
    expect(backend.calls.accept).toHaveLength(0);
  });

  it("surfaces a decision conflict and keeps the overwrite toggle checked", async () => {
    setReviewer("m");
    // A conflict only arises on an already-decided candidate (seed2 = accepted).
    backend.errors.accept = errBody(409, "decision_conflict", "already decided");
    render(<RankedDuelReviewPanel />);
    fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed2:f2"));
    await screen.findByTestId("rd-correct-answer");
    fireEvent.click(screen.getByTestId("rd-mode-accept"));
    fireEvent.click(screen.getByTestId("rd-accept-submit"));
    await waitFor(() => expect(screen.getByTestId("rd-action-error").textContent).toContain("overwrite"));
    expect((screen.getByTestId("rd-overwrite") as HTMLInputElement).checked).toBe(true);
  });

  it("defaults overwrite ON when acting on an already-decided candidate", async () => {
    setReviewer("m");
    render(<RankedDuelReviewPanel />);
    fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed2:f2"));
    await screen.findByTestId("rd-correct-answer");
    fireEvent.click(screen.getByTestId("rd-mode-accept"));
    expect((screen.getByTestId("rd-overwrite") as HTMLInputElement).checked).toBe(true);
  });
});

describe("RankedDuelReviewPanel — validate & export", () => {
  it("runs validate and shows the report", async () => {
    render(<RankedDuelReviewPanel />);
    await screen.findByTestId("rd-status");
    fireEvent.click(screen.getByTestId("rd-validate"));
    await waitFor(() => expect(screen.getByTestId("rd-validate-report")).toBeTruthy());
    expect(backend.calls.validate).toBe(1);
  });

  it("exports only behind an explicit confirm and shows the result", async () => {
    render(<RankedDuelReviewPanel />);
    await screen.findByTestId("rd-status");
    fireEvent.click(screen.getByTestId("rd-export-open"));
    // Not exported just by opening the dialog.
    expect(backend.calls.export).toBe(0);
    fireEvent.click(await screen.findByTestId("rd-export-confirm"));
    await waitFor(() => expect(backend.calls.export).toBe(1));
    expect((await screen.findByTestId("rd-export-result")).textContent).toContain("Exported 1");
  });
});

describe("RankedDuelReviewPanel — auth", () => {
  it("shows an auth-required state on 403 and loads no candidates", async () => {
    backend = { ...backend };
    vi.stubGlobal("fetch", vi.fn(async () => errBody(403, "x", "Invalid or missing X-Admin-Key")) as unknown as typeof fetch);
    render(<RankedDuelReviewPanel />);
    await waitFor(() => expect(screen.getByText(/Admin key missing or invalid/i)).toBeTruthy());
    expect(screen.queryByTestId("rd-cand-tank_hp:seed1:f1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RA9 — Data/Preview sub-tabs and URL-controlled selection
// ---------------------------------------------------------------------------

describe("RankedDuelReviewPanel — Data/Preview sub-tabs", () => {
  const openCandidate = async () => {
    render(<RankedDuelReviewPanel />);
    fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed1:f1"));
    await screen.findByTestId("rd-correct-answer");
  };

  it("opens on Data with every review action present", async () => {
    await openCandidate();
    expect(screen.getByTestId("rd-subtab-data").dataset.active).toBe("true");
    expect(screen.getByTestId("rd-correct-answer")).toBeInTheDocument();
    expect(screen.getByTestId("rd-mode-accept")).toBeInTheDocument();
    expect(screen.getByTestId("rd-mode-reject")).toBeInTheDocument();
    expect(screen.getByTestId("rd-mode-revise")).toBeInTheDocument();
  });

  it("does not load the preview until the operator opens it", async () => {
    await openCandidate();
    expect(backend.calls.preview).toEqual([]);
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await waitFor(() => expect(backend.calls.preview).toEqual(["tank_hp:seed1:f1"]));
  });

  it("hides Data while Preview is shown, and restores it", async () => {
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    expect(screen.getByTestId("rd-data-region")).toHaveAttribute("hidden");
    expect(screen.getByTestId("rd-preview-region")).not.toHaveAttribute("hidden");

    fireEvent.click(screen.getByTestId("rd-subtab-data"));
    expect(screen.getByTestId("rd-data-region")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("rd-preview-region")).toHaveAttribute("hidden");
  });

  it("keeps an in-progress revision draft across a trip to Preview", async () => {
    setReviewer("m");
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-mode-revise"));
    fireEvent.change(screen.getByTestId("rd-revise-question"), {
      target: { value: "edited prompt in progress" },
    });

    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    fireEvent.click(screen.getByTestId("rd-subtab-data"));

    expect((screen.getByTestId("rd-revise-question") as HTMLTextAreaElement).value).toBe(
      "edited prompt in progress",
    );
  });

  it("does not refetch the projection when toggling back to Preview", async () => {
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await waitFor(() => expect(backend.calls.preview).toHaveLength(1));
    fireEvent.click(screen.getByTestId("rd-subtab-data"));
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    expect(backend.calls.preview).toHaveLength(1);
  });

  it("still accepts a candidate while the Preview tab exists", async () => {
    setReviewer("m");
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    fireEvent.click(screen.getByTestId("rd-subtab-data"));

    fireEvent.click(screen.getByTestId("rd-mode-accept"));
    fireEvent.click(screen.getByTestId("rd-accept-submit"));
    await waitFor(() => expect(backend.calls.accept).toHaveLength(1));
    expect(backend.calls.accept[0]).toMatchObject({
      reviewer: "m",
      source_hash: "sha256:aaa",
    });
  });

  it("still rejects a candidate while the Preview tab exists", async () => {
    setReviewer("m");
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    fireEvent.click(screen.getByTestId("rd-subtab-data"));

    fireEvent.click(screen.getByTestId("rd-mode-reject"));
    fireEvent.change(screen.getByTestId("rd-reject-reason"), {
      target: { value: "wrong numbers" },
    });
    fireEvent.click(screen.getByTestId("rd-reject-submit"));
    await waitFor(() => expect(backend.calls.reject).toHaveLength(1));
  });

  it("never lets a preview write a review decision", async () => {
    await openCandidate();
    fireEvent.click(screen.getByTestId("rd-subtab-preview"));
    await screen.findByTestId("rd-preview");
    await waitFor(() => expect(screen.getByTestId("answer-grid")).toBeInTheDocument());

    // Scoped to the grid: the hidden Data region lists the same option text.
    fireEvent.click(within(screen.getByTestId("answer-grid")).getByText("255"));
    fireEvent.click(screen.getByTestId("preview-state-locked"));
    fireEvent.click(screen.getByTestId("preview-state-reveal"));

    expect(backend.calls.accept).toEqual([]);
    expect(backend.calls.reject).toEqual([]);
    expect(backend.calls.revise).toEqual([]);
    expect(backend.calls.export).toBe(0);
  });
});

describe("RankedDuelReviewPanel — URL-controlled selection", () => {
  it("loads the candidate given by the controlled prop", async () => {
    render(<RankedDuelReviewPanel selectedCandidateId="tank_hp:seed2:f2" onSelectCandidate={vi.fn()} />);
    await screen.findByTestId("rd-correct-answer");
    expect(backend.calls.detail).toEqual(["tank_hp:seed2:f2"]);
  });

  it("asks the owner to change selection rather than selecting itself", async () => {
    const onSelectCandidate = vi.fn();
    render(<RankedDuelReviewPanel selectedCandidateId={null} onSelectCandidate={onSelectCandidate} />);
    fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed1:f1"));
    expect(onSelectCandidate).toHaveBeenCalledWith("tank_hp:seed1:f1");
    // Controlled: nothing opened, because the prop did not change.
    expect(backend.calls.detail).toEqual([]);
  });

  it("follows the controlled prop when it changes (Back/Forward)", async () => {
    const { rerender } = render(
      <RankedDuelReviewPanel selectedCandidateId="tank_hp:seed1:f1" onSelectCandidate={vi.fn()} />,
    );
    await screen.findByTestId("rd-correct-answer");

    rerender(<RankedDuelReviewPanel selectedCandidateId="tank_hp:seed2:f2" onSelectCandidate={vi.fn()} />);
    await waitFor(() => expect(backend.calls.detail).toEqual(["tank_hp:seed1:f1", "tank_hp:seed2:f2"]));

    rerender(<RankedDuelReviewPanel selectedCandidateId={null} onSelectCandidate={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/Select a candidate to review/i)).toBeInTheDocument(),
    );
  });

  it("reports an unknown candidate id from the URL instead of showing nothing", async () => {
    backend.errors.detail = errBody(404, "candidate_not_found", "Unknown candidate ID: nope");
    render(<RankedDuelReviewPanel selectedCandidateId="nope" onSelectCandidate={vi.fn()} />);
    const err = await screen.findByTestId("rd-detail-error");
    expect(err.textContent).toMatch(/no longer exists/i);
    expect(err.textContent).toContain("nope");
  });

  it("keeps its own selection when used uncontrolled", async () => {
    render(<RankedDuelReviewPanel />);
    fireEvent.click(await screen.findByTestId("rd-cand-tank_hp:seed1:f1"));
    await screen.findByTestId("rd-correct-answer");
    expect(backend.calls.detail).toEqual(["tank_hp:seed1:f1"]);
  });
});
