/**
 * PT1.8 — the Trends → Builder handoff, on the Builder's side.
 *
 * The claim being tested is that the handoff REUSES the Builder rather than
 * duplicating it: a preset goes through the same configuration path a reader's
 * own click goes through, so the preview, the pool rules and the build request
 * are one behaviour. And that it never lands on a panel that cannot run it —
 * a preset applied to a Free panel would rewrite a configuration nobody can
 * use and then show that reader their own choice behind a paywall.
 *
 * Kept in its own file so PT1.7B's suite stays the record of PT1.7B.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

const CAPABILITY = (canBuild: boolean) => ({
  can_build: canBuild,
  can_save: canBuild,
  max_saved_sets: canBuild ? 100 : 0,
  allowed_pools: canBuild ? ["bank", "owned", "missed", "weak"] : [],
  max_length: canBuild ? 30 : 0,
  allowed_lengths: canBuild ? [5, 10, 20, 30] : [],
  can_view_trends: canBuild,
  trend_windows: canBuild ? [7, 30, 90] : [],
  reason: canBuild ? "premium" : "free",
});

const CATALOG = (canBuild: boolean) => ({
  ok: true,
  capability: CAPABILITY(canBuild),
  pools: [
    { value: "bank", label: "The whole question bank" },
    { value: "weak", label: "My weakest categories" },
  ],
  categories: [
    { value: "Runes", label: "Runes", count: 210, opt_in: false },
    { value: "Pro Play", label: "Pro Play", count: 0, opt_in: true },
  ],
  source_types: [{ value: "item", label: "item", count: 1591 }],
  difficulty: { min: 1, max: 5 },
  lengths: [5, 10, 20, 30],
  pro_play_category: "Pro Play",
  unsupported_filters: ["champion", "matchup", "item"],
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.catalog.mockResolvedValue(CATALOG(true));
  api.listSets.mockResolvedValue({ ok: true, sets: [], capability: CAPABILITY(true) });
  api.preview.mockResolvedValue({
    ok: true, status: "ready", requested: 10, available: 42,
    config: { pool: "bank", category: null, source_type: null, difficulty_min: 1, difficulty_max: 5, length: 10, include_pro_play: false },
  });
});

afterEach(cleanup);

describe("PT1.8 — a preset handed to the Builder", () => {
  it("goes through the Builder's OWN preview, with the preset's shape", async () => {
    render(
      <PracticeBuilderPanel
        open
        onStartSession={vi.fn()}
        preset={{ pool: "bank", category: "Runes", nonce: 1 }}
      />,
    );
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith(
        expect.objectContaining({ pool: "bank", category: "Runes" }),
      ),
    );
  });

  it("passes the weak POOL through when that is what was asked for", async () => {
    render(
      <PracticeBuilderPanel
        open
        onStartSession={vi.fn()}
        preset={{ pool: "weak", category: null, nonce: 2 }}
      />,
    );
    await waitFor(() =>
      expect(api.preview).toHaveBeenCalledWith(expect.objectContaining({ pool: "weak" })),
    );
  });

  it("tells the host once it has adopted, so the host can scroll to it", async () => {
    const onApplied = vi.fn();
    render(
      <PracticeBuilderPanel
        open
        onStartSession={vi.fn()}
        preset={{ pool: "bank", category: "Runes", nonce: 3 }}
        onPresetApplied={onApplied}
      />,
    );
    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1));
  });

  it("NEVER applies to a panel that may not build", async () => {
    api.catalog.mockResolvedValue(CATALOG(false));
    api.listSets.mockResolvedValue({ ok: true, sets: [], capability: CAPABILITY(false) });
    const onApplied = vi.fn();
    render(
      <PracticeBuilderPanel
        open
        onStartSession={vi.fn()}
        preset={{ pool: "weak", category: null, nonce: 4 }}
        onPresetApplied={onApplied}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("practice-builder-locked")).toBeTruthy());
    expect(api.preview).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("does nothing at all when no preset is supplied — PT1.7B is unchanged", async () => {
    render(<PracticeBuilderPanel open onStartSession={vi.fn()} />);
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.preview).toHaveBeenCalledWith(
      expect.objectContaining({ pool: "bank", category: null, include_pro_play: false }),
    );
  });
});
