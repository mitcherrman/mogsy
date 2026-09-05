/**
 * PT1.7B — the Builder panel: paywall, pools, honest counts, saved sets.
 *
 * The panel is presentation over a server-resolved capability, so what these
 * tests assert is that it RENDERS the server's answer rather than inventing
 * one — including the two cases that are easy to get wrong: a lapsed
 * subscriber (locked, but their sets are still theirs) and a shortfall (told,
 * never silently substituted).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  preview: vi.fn(),
  session: vi.fn(),
  weakness: vi.fn(),
  listSets: vi.fn(),
  createSet: vi.fn(),
  patchSet: vi.fn(),
  deleteSet: vi.fn(),
  runSet: vi.fn(),
}));
vi.mock("@/lib/quiz/builderApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/quiz/builderApi")>();
  return { ...original, builderApi: api };
});

import PracticeBuilderPanel from "./PracticeBuilderPanel";
import { toast } from "sonner";

const PREMIUM_CAPABILITY = {
  can_build: true, can_save: true, max_saved_sets: 100,
  allowed_pools: ["bank", "owned", "missed", "weak"] as const,
  max_length: 30, allowed_lengths: [5, 10, 20, 30], reason: "premium",
};
const FREE_CAPABILITY = {
  can_build: false, can_save: false, max_saved_sets: 0,
  allowed_pools: [] as const, max_length: 0, allowed_lengths: [], reason: "free",
};

const CATALOG = (capability: unknown) => ({
  ok: true,
  capability,
  pools: [
    { value: "bank", label: "The whole question bank" },
    { value: "owned", label: "Questions I own",
      owned: { total_owned: 212, runnable: 48, namespace: "quiz" } },
    { value: "missed", label: "Questions I have missed" },
    { value: "weak", label: "My weakest categories" },
  ],
  categories: [
    { value: "Item Costs", label: "Item Costs", count: 197, opt_in: false },
    { value: "Pro Play", label: "Pro Play", count: 50615, opt_in: true },
  ],
  source_types: [{ value: "item", label: "item", count: 1591 }],
  difficulty: { min: 1, max: 5 },
  lengths: [5, 10, 20, 30],
  pro_play_category: "Pro Play",
  unsupported_filters: ["champion", "matchup", "item"],
});

const QUESTIONS = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, category: "Item Costs", question_text: `Q${i}?`,
  format: "multiple_choice", choices: ["a", "b"],
}));

function renderPanel(onStart = vi.fn()) {
  render(<PracticeBuilderPanel open onStartSession={onStart} />);
  return onStart;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.catalog.mockResolvedValue(CATALOG(PREMIUM_CAPABILITY));
  api.listSets.mockResolvedValue({ ok: true, sets: [], capability: PREMIUM_CAPABILITY });
  api.preview.mockResolvedValue({
    ok: true, status: "ready", config: { pool: "bank", length: 10 },
    requested: 10, available: 197,
  });
  api.session.mockResolvedValue({
    ok: true, status: "ready", config: { pool: "bank", length: 10 },
    requested: 10, available: 197, questions: QUESTIONS,
  });
});
afterEach(cleanup);

describe("Practice Builder — the paywall", () => {
  it("draws the locked state from the server's capability, not from a tier name", async () => {
    api.catalog.mockResolvedValue(CATALOG(FREE_CAPABILITY));
    api.listSets.mockResolvedValue({ ok: true, sets: [], capability: FREE_CAPABILITY });
    renderPanel();
    expect(await screen.findByTestId("practice-builder-locked")).toBeTruthy();
    // No controls at all — a Free reader is not shown a form that cannot run.
    expect(screen.queryByTestId("builder-build")).toBeNull();
    expect(screen.queryByTestId("builder-pool-missed")).toBeNull();
  });

  it("tells a lapsed subscriber their saved sets are still theirs", async () => {
    api.catalog.mockResolvedValue(CATALOG(FREE_CAPABILITY));
    api.listSets.mockResolvedValue({
      ok: true, capability: FREE_CAPABILITY,
      sets: [{ id: 1, name: "Kept", config: null, config_version: 1,
               created_at: "", updated_at: "", last_run_at: null, run_count: 0 }],
    });
    renderPanel();
    const note = await screen.findByTestId("builder-lapsed-note");
    expect(note.textContent).toMatch(/still here/i);
  });

  it("shows a FAILURE as a failure — never as a paywall", async () => {
    // The regression this exists for: with no capability resolved, a naive
    // `!can_build` check falls through to the upsell and tells a paying
    // subscriber to subscribe.
    api.catalog.mockRejectedValue(new Error("Quiz API 503: Entitlement lookup failed"));
    api.listSets.mockRejectedValue(new Error("Quiz API 503"));
    renderPanel();
    expect(await screen.findByTestId("practice-builder-error")).toBeTruthy();
    expect(screen.queryByTestId("practice-builder-locked")).toBeNull();
    expect(screen.getByTestId("builder-retry")).toBeTruthy();
  });

  it("only offers the pools the capability allows", async () => {
    api.catalog.mockResolvedValue(CATALOG({
      ...PREMIUM_CAPABILITY, allowed_pools: ["bank"],
    }));
    renderPanel();
    expect(await screen.findByTestId("builder-pool-bank")).toBeTruthy();
    // The seam for a future earned-Free slot: a narrower capability renders a
    // narrower panel, with no branch in this file.
    expect(screen.queryByTestId("builder-pool-missed")).toBeNull();
    expect(screen.queryByTestId("builder-pool-weak")).toBeNull();
  });
});

describe("Practice Builder — honest counts", () => {
  it("states how much of OWNED can actually be practised, and what the rest is", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("builder-pool-owned"));
    const note = await screen.findByTestId("builder-owned-compatibility");
    expect(note.textContent).toContain("48 of your 212");
    // The remainder must never read as lost or invalid.
    expect(note.textContent).toMatch(/still yours/i);
    expect(note.textContent).not.toMatch(/lost|invalid|expired/i);
  });

  it("names which modes weakness counts, and which it does not", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("builder-pool-weak"));
    const note = await screen.findByTestId("builder-weak-scope");
    expect(note.textContent).toMatch(/Practice and Time Trial/);
    expect(note.textContent).toMatch(/Ranked, the Daily Challenge and Mastery/);
  });

  it("says which filters the product does not have", async () => {
    renderPanel();
    const note = await screen.findByTestId("builder-unsupported");
    expect(note.textContent).toMatch(/champion or matchup/i);
  });

  it("shows Pro Play with its real size and marks it opt-in", async () => {
    renderPanel();
    const select = await screen.findByTestId("builder-category");
    const proPlay = within(select).getByText(/Pro Play \(50615\) — opt in/);
    expect(proPlay).toBeTruthy();
  });
});

describe("Practice Builder — building", () => {
  it("hands the built list to the host runner and never renders a question", async () => {
    const onStart = renderPanel();
    fireEvent.click(await screen.findByTestId("builder-build"));
    await waitFor(() => expect(onStart).toHaveBeenCalled());
    expect(onStart.mock.calls[0][0]).toHaveLength(10);
    // The panel is a selector: no question text of its own.
    expect(screen.queryByText("Q0?")).toBeNull();
  });

  it("refuses to build a short pool, and explains what narrowed it", async () => {
    api.preview.mockResolvedValue({
      ok: true, status: "insufficient_pool",
      config: { pool: "missed", length: 30, category: null, source_type: null,
                difficulty_min: 1, difficulty_max: 5, include_pro_play: false },
      requested: 30, available: 4, questions: [],
      narrowed_by: ["pool", "pro_play_excluded"],
    });
    const onStart = renderPanel();
    const preview = await screen.findByTestId("builder-preview");
    await waitFor(() => expect(preview.textContent).toMatch(/Only 4 of the 30/));
    expect(preview.textContent).toMatch(/missed pool/);
    // …and the build control is not offered as a way to get a padded set.
    expect((await screen.findByTestId("builder-build")).hasAttribute("disabled")).toBe(true);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("selecting Pro Play by name is the opt-in", async () => {
    renderPanel();
    const select = await screen.findByTestId("builder-category");
    fireEvent.change(select, { target: { value: "Pro Play" } });
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Pro Play", include_pro_play: true }),
      ));
  });

  it("leaves Pro Play out of a default build", async () => {
    renderPanel();
    await screen.findByTestId("builder-build");
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    const firstCall = api.preview.mock.calls[0][0];
    expect(firstCall.include_pro_play).toBe(false);
    expect(firstCall.category).toBeNull();
  });

  it("shows a refusal as a refusal, not as a failure to retry", async () => {
    api.session.mockRejectedValue(new Error("Quiz API 403: PREMIUM_REQUIRED"));
    renderPanel();
    fireEvent.click(await screen.findByTestId("builder-build"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Premium")));
  });
});

describe("Practice Builder — saved sets", () => {
  it("saves, lists and runs a named configuration", async () => {
    api.createSet.mockResolvedValue({
      ok: true, set: { id: 7, name: "Item drills", config: null, config_version: 1,
                       created_at: "", updated_at: "", last_run_at: null, run_count: 0 },
    });
    api.runSet.mockResolvedValue({
      ok: true, status: "ready", config: { pool: "bank", length: 10 },
      requested: 10, available: 50, questions: QUESTIONS,
    });
    const onStart = renderPanel();
    fireEvent.change(await screen.findByTestId("builder-save-name"),
                     { target: { value: "Item drills" } });
    fireEvent.click(screen.getByTestId("builder-save"));
    await waitFor(() => expect(api.createSet).toHaveBeenCalledWith(
      "Item drills", expect.objectContaining({ pool: "bank" })));
    fireEvent.click(await screen.findByTestId("builder-run-7"));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(QUESTIONS, "Item drills"));
  });

  it("deletes a set the reader owns", async () => {
    api.listSets.mockResolvedValue({
      ok: true, capability: PREMIUM_CAPABILITY,
      sets: [{ id: 3, name: "Gone", config: null, config_version: 1,
               created_at: "", updated_at: "", last_run_at: null, run_count: 0 }],
    });
    api.deleteSet.mockResolvedValue({ ok: true, deleted: 3 });
    renderPanel();
    fireEvent.click(await screen.findByTestId("builder-delete-3"));
    await waitFor(() => expect(api.deleteSet).toHaveBeenCalledWith(3));
    await waitFor(() => expect(screen.queryByTestId("builder-run-3")).toBeNull());
  });
});
