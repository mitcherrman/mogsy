import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminBattle, BattleStatus } from "@/lib/combat-battles/types";

// --- mock the admin API; the list is driven by a mutable `events` array so we
// can simulate a refetch that replaces the event objects with equivalent data.
let events: AdminBattle[] = [];
const listMock = vi.fn(async () => ({ battles: events.map((e) => ({ ...e })) }));
vi.mock("@/lib/combat-battles/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/combat-battles/api")>();
  return {
    ...actual,
    battlesAdminApi: {
      list: () => listMock(),
      settlement: vi.fn(async () => { throw new actual.BattlesApiError(404, "not_found", "none"); }),
      validate: vi.fn(), publish: vi.fn(), void: vi.fn(), reproduce: vi.fn(),
      settle: vi.fn(), create: vi.fn(), update: vi.fn(),
    },
  };
});
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import CombatBattlesAdmin from "./CombatBattlesAdmin";
import { battlesAdminApi, BattlesApiError } from "@/lib/combat-battles/api";
import { toast } from "@/hooks/use-toast";

function battle(id: string, stored: BattleStatus, over: Partial<AdminBattle> = {}): AdminBattle {
  const published = stored === "scheduled";
  return {
    battle_id: id, slug: id, title: `Battle ${id}`, description: "",
    stored_status: stored, effective_status: (over.effective_status ?? stored) as BattleStatus,
    battle_format: "independent_damage_comparison_v1", healing_enabled: false,
    open_at: null, lock_at: null, reveal_at: null,
    left_snapshot: {}, right_snapshot: {}, engine_metadata: {}, validation_report: null,
    frozen_result: published ? ({} as never) : null, winner_side: null, decision_reason: null,
    input_checksum: published ? "in" : null, result_checksum: published ? "res" : null,
    created_at: "", updated_at: "", published_at: published ? "2026-01-01T00:00:00Z" : null,
    voided_at: null, void_reason: null, ...over,
  };
}

function renderAdmin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CombatBattlesAdmin /></MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

// The explanatory copy is unique to the selected-event operations panel.
const PANEL = /checks whether the configuration is eligible/i;

afterEach(() => { cleanup(); events = []; listMock.mockClear(); });

describe("CombatBattlesAdmin — selection & capability gating", () => {
  it("1+2+3. selection and a dirty publish input survive a list refetch (equivalent new objects)", async () => {
    events = [battle("v1", "validated")];
    const qc = renderAdmin();

    fireEvent.click(await screen.findByText("Battle v1"));
    expect(await screen.findByText(PANEL)).toBeTruthy();

    // dirty a publish schedule input
    const openInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(openInput, { target: { value: "2026-05-01T10:00" } });
    expect(openInput.value).toBe("2026-05-01T10:00");

    // refetch: list returns brand-new objects (same ids/data)
    await qc.invalidateQueries({ queryKey: ["combat-battles", "admin"] });
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));

    // selection + panel preserved, dirty value intact
    expect(screen.getByText(PANEL)).toBeTruthy();
    expect((document.querySelector('input[type="datetime-local"]') as HTMLInputElement).value)
      .toBe("2026-05-01T10:00");
  });

  it("6. selection clears safely if the selected event is removed from the server response", async () => {
    events = [battle("v1", "validated"), battle("v2", "draft")];
    const qc = renderAdmin();
    fireEvent.click(await screen.findByText("Battle v1"));
    expect(await screen.findByText(PANEL)).toBeTruthy();

    events = [battle("v2", "draft")]; // v1 removed
    await qc.invalidateQueries({ queryKey: ["combat-battles", "admin"] });

    await waitFor(() => expect(screen.queryByText(PANEL)).toBeNull());
    expect(screen.getByText(/Select an event, or create a draft/)).toBeTruthy();
  });

  it("7+8. Reproduce is disabled with a reason for a validated (unpublished) event", async () => {
    events = [battle("v1", "validated")];
    renderAdmin();
    fireEvent.click(await screen.findByText("Battle v1"));
    await screen.findByText(PANEL);

    const reproduce = screen.getByRole("button", { name: "Reproduce" });
    expect(reproduce).toBeDisabled();
    expect(screen.getByText(/Publish to freeze a result before reproducing/)).toBeTruthy();
  });

  it("9. Reproduce is enabled for a published (frozen-result) event", async () => {
    events = [battle("s1", "scheduled", { effective_status: "revealed" })];
    renderAdmin();
    fireEvent.click(await screen.findByText("Battle s1"));
    await screen.findByText(PANEL);
    expect(screen.getByRole("button", { name: "Reproduce" })).not.toBeDisabled();
  });

  it("15. disabled Publish/Validate expose reason text for a published event", async () => {
    events = [battle("s1", "scheduled", { effective_status: "locked" })];
    renderAdmin();
    fireEvent.click(await screen.findByText("Battle s1"));
    await screen.findByText(PANEL);
    expect(screen.getByRole("button", { name: "Validate" })).toBeDisabled();
    expect(screen.getByText(/Already published/)).toBeTruthy();
  });

  it("16. a backend rejection on an apparently-valid action still surfaces (advisory UI)", async () => {
    events = [battle("v1", "validated")];
    renderAdmin();
    fireEvent.click(await screen.findByText("Battle v1"));
    await screen.findByText(PANEL);
    // Frontend thinks Validate is available, but the server rejects (race).
    vi.mocked(battlesAdminApi.validate).mockRejectedValueOnce(
      new BattlesApiError(409, "conflict", "stale lifecycle state"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    await waitFor(() =>
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining("conflict: stale lifecycle state") }),
      ),
    );
  });
});
