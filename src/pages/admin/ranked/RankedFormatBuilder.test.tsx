// ---------------------------------------------------------------------------
// Admin Ranked Builder — behaviour.
//
// The API layer is mocked; the page, the row, the field controls and the pure
// edit helpers are all real. What is asserted is mostly what reaches the
// backend: this screen's job is to produce a correct PUT body, and a screen
// that renders beautifully while sending a format with a dropped field would
// be the worst possible outcome here.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// fireEvent, not user-event: the project does not depend on @testing-library/
// user-event and Phase 4 is not the place to add a dependency for it. These
// helpers cover the four interactions this screen has.
const click = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const selectOption = async (el: HTMLElement, value: string) => {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
  });
};
const setValue = async (el: HTMLElement, value: string) => {
  await act(async () => {
    fireEvent.change(el, { target: { value } });
  });
};

vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/admin/rankedFormatApi", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/rankedFormatApi")
  >("@/lib/admin/rankedFormatApi");
  return {
    ...actual,
    fetchModuleCatalog: vi.fn(),
    fetchFormatConfig: vi.fn(),
    saveFormatConfig: vi.fn(),
  };
});

import RankedFormatBuilder from "./RankedFormatBuilder";
import {
  RankedFormatApiError,
  fetchFormatConfig,
  fetchModuleCatalog,
  saveFormatConfig,
  type FormatConfigView,
  type ModuleCatalog,
  type RankedFormatJson,
} from "@/lib/admin/rankedFormatApi";

const mockCatalog = vi.mocked(fetchModuleCatalog);
const mockConfig = vi.mocked(fetchFormatConfig);
const mockSave = vi.mocked(saveFormatConfig);

// --- fixtures mirroring the real backend payloads -------------------------

const CATALOG: ModuleCatalog = {
  schema_version: "ranked.builder_catalog.v1",
  cycle_note: "Modules repeat in this order until the Ranked match ends.",
  modules: [
    {
      module_id: "quiz",
      module_version: 1,
      label: "Quiz",
      description: "One question, both players answer.",
      defaults: {
        module_id: "quiz",
        module_version: 1,
        challenge_count: 1,
        timer_seconds: 20,
        pressure_seconds: null,
        full_damage: 10,
        reduced_damage: 5,
        ability_phase_seconds: null,
        module_config: { pool: "easy_item_cost" },
        analytics_tag: "playtest_easy_1",
        scoring: "outcome",
        card_timer_seconds: null,
      },
      fields: [
        {
          key: "module_config.pool",
          label: "Question pool",
          type: "enum",
          required: true,
          options: [
            { value: "easy_item_cost", label: "easy_item_cost" },
            { value: "hard_cooldowns", label: "hard_cooldowns" },
          ],
        },
        { key: "timer_seconds", label: "Timer (seconds)", type: "number", required: true, min: 1 },
        { key: "full_damage", label: "Damage on loss", type: "integer", required: true, min: 0 },
        {
          key: "reduced_damage",
          label: "Damage when both are correct",
          type: "integer",
          required: true,
          min: 0,
        },
        { key: "analytics_tag", label: "Tag", type: "text", required: false },
      ],
    },
    {
      module_id: "item_cost_duel",
      module_version: 4,
      label: "Meta Reflex",
      description: "A five-card block.",
      defaults: {
        module_id: "item_cost_duel",
        module_version: 4,
        challenge_count: 5,
        timer_seconds: null,
        pressure_seconds: null,
        full_damage: null,
        reduced_damage: null,
        ability_phase_seconds: null,
        module_config: { families: ["item_cost", "item_stat:ad"] },
        analytics_tag: "playtest_meta_reflex_1",
        scoring: "additive",
        card_timer_seconds: 6,
      },
      fields: [
        {
          key: "module_config.families",
          label: "Card families",
          type: "multi_enum",
          required: true,
          min_items: 1,
          options: [
            { value: "item_cost", label: "item_cost" },
            { value: "item_stat:ad", label: "item_stat:ad" },
            { value: "recognition:champion", label: "recognition:champion" },
          ],
        },
        {
          key: "card_timer_seconds",
          label: "Seconds per card",
          type: "number",
          required: true,
          min: 1,
        },
        { key: "analytics_tag", label: "Tag", type: "text", required: false },
      ],
      fixed: { challenge_count: 5, scoring: "additive" },
    },
  ],
};

/** A format carrying a field the builder does not expose, on purpose. */
const SAVED_FORMAT: RankedFormatJson = {
  schema_version: 1,
  format_id: "ranked_admin_bot",
  format_version: 3,
  status: "active",
  bot_eligible: true,
  rating_eligible: false,
  rollout_allowlist: [],
  segment_pattern: [
    { ...CATALOG.modules[0].defaults, analytics_tag: "first", pressure_seconds: 4 },
    { ...CATALOG.modules[1].defaults, analytics_tag: "block" },
  ],
};

const FALLBACK_FORMAT: RankedFormatJson = {
  schema_version: 1,
  format_id: "ranked_modern",
  format_version: 1,
  status: "active",
  segment_pattern: [{ ...CATALOG.modules[0].defaults, analytics_tag: "fallback_slot" }],
};

function view(over: Partial<FormatConfigView> = {}): FormatConfigView {
  return {
    schema_version: "ranked.format_config.v1",
    target: "admin_bot",
    targets: ["admin_bot", "public"],
    revision: 3,
    config: structuredClone(SAVED_FORMAT),
    saved_by: "admin-1",
    saved_at: "2026-08-29 12:00:00",
    fallback: structuredClone(FALLBACK_FORMAT),
    fallback_unavailable: null,
    consumed_by_match_creation: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCatalog.mockResolvedValue(CATALOG);
  mockConfig.mockResolvedValue(view());
  mockSave.mockImplementation(async (target, format) => ({
    target,
    revision: 4,
    format,
    saved_by: "admin-1",
    saved_at: "2026-08-29 12:05:00",
  }));
});

async function mount() {
  render(<RankedFormatBuilder />);
  await screen.findByTestId("segment-list");
}

// ── targets ────────────────────────────────────────────────────────────────

describe("targets", () => {
  it("loads the admin_bot target first", async () => {
    await mount();
    expect(mockConfig).toHaveBeenCalledWith("admin_bot");
  });

  it("loads the public target when selected", async () => {
    await mount();
    mockConfig.mockResolvedValue(view({ target: "public", revision: 9 }));
    await click(screen.getByTestId("target-public"));
    await waitFor(() => expect(mockConfig).toHaveBeenCalledWith("public"));
  });

  it("switching target reloads that target's config, not the previous one", async () => {
    await mount();
    expect(screen.getByTestId("revision-label")).toHaveTextContent("Revision 3");

    mockConfig.mockResolvedValue(
      view({
        target: "public",
        revision: 9,
        config: { ...structuredClone(SAVED_FORMAT), format_id: "ranked_public_configured" },
      }),
    );
    await click(screen.getByTestId("target-public"));
    await waitFor(() =>
      expect(screen.getByTestId("revision-label")).toHaveTextContent("Revision 9"),
    );
  });

  it("uses the backend fallback as the editable start when nothing is saved", async () => {
    mockConfig.mockResolvedValue(view({ revision: null, config: null, saved_at: null }));
    await mount();
    expect(screen.getByTestId("revision-label")).toHaveTextContent("No saved configuration");
    expect(screen.getByTestId("fallback-notice")).toBeInTheDocument();
    // The fallback's single slot is what is editable.
    expect(screen.getAllByTestId(/^segment-row-/)).toHaveLength(1);
  });
});

// ── ordering ───────────────────────────────────────────────────────────────

describe("ordered module list", () => {
  it("renders segments in saved order with their labels", async () => {
    await mount();
    const rows = screen.getAllByTestId(/^segment-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-module-id", "quiz");
    expect(within(rows[0]).getByText(/Quiz/)).toBeInTheDocument();
    expect(rows[1]).toHaveAttribute("data-module-id", "item_cost_duel");
    expect(within(rows[1]).getByText(/Meta Reflex/)).toBeInTheDocument();
  });

  it("move down swaps exactly two adjacent segments in the saved order", async () => {
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const sent = mockSave.mock.calls[0][1];
    expect(sent.segment_pattern.map((s) => s.module_id)).toEqual(["item_cost_duel", "quiz"]);
  });

  it("move up is the exact inverse of move down", async () => {
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("move-up-1"));
    expect(screen.getByTestId("save-config")).toBeDisabled(); // back to baseline
  });

  it("the first row cannot move up and the last cannot move down", async () => {
    await mount();
    expect(screen.getByTestId("move-up-0")).toBeDisabled();
    expect(screen.getByTestId("move-down-1")).toBeDisabled();
  });

  it("removing a segment drops exactly that one", async () => {
    await mount();
    await click(screen.getByTestId("remove-0"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1].segment_pattern.map((s) => s.module_id)).toEqual([
      "item_cost_duel",
    ]);
  });

  it("the last remaining segment cannot be removed", async () => {
    mockConfig.mockResolvedValue(
      view({ config: { ...structuredClone(SAVED_FORMAT), segment_pattern: [SAVED_FORMAT.segment_pattern[0]] } }),
    );
    await mount();
    expect(screen.getByTestId("remove-0")).toBeDisabled();
  });
});

// ── adding ─────────────────────────────────────────────────────────────────

describe("add module", () => {
  it("offers exactly the catalog's modules", async () => {
    await mount();
    const add = screen.getByTestId("add-module");
    expect(within(add).getByTestId("add-quiz-v1")).toBeInTheDocument();
    expect(within(add).getByTestId("add-item_cost_duel-v4")).toBeInTheDocument();
    expect(within(add).getAllByRole("button")).toHaveLength(2);
  });

  it("appends the catalog's production defaults", async () => {
    await mount();
    await click(screen.getByTestId("add-quiz-v1"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const pattern = mockSave.mock.calls[0][1].segment_pattern;
    expect(pattern).toHaveLength(3);
    expect(pattern[2]).toEqual(CATALOG.modules[0].defaults);
  });

  it("two rows added from one catalog entry do not share a module_config", async () => {
    await mount();
    await click(screen.getByTestId("add-quiz-v1"));
    await click(screen.getByTestId("add-quiz-v1"));
    await selectOption(within(screen.getByTestId("segment-row-2")).getByLabelText("Question pool"),
      "hard_cooldowns",
    );
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const pattern = mockSave.mock.calls[0][1].segment_pattern;
    expect((pattern[2].module_config as Record<string, unknown>).pool).toBe("hard_cooldowns");
    expect((pattern[3].module_config as Record<string, unknown>).pool).toBe("easy_item_cost");
  });
});

// ── per-module settings serialize correctly ────────────────────────────────

describe("module settings", () => {
  it("quiz settings serialize into the right places", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await selectOption(within(row).getByLabelText("Question pool"), "hard_cooldowns");
    await setValue(within(row).getByLabelText("Timer (seconds)"), "33");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const segment = mockSave.mock.calls[0][1].segment_pattern[0];
    expect(segment.module_config).toEqual({ pool: "hard_cooldowns" });
    expect(segment.timer_seconds).toBe(33);
  });

  it("meta reflex families serialize as a list in catalog option order", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-1");
    // Deselect one, select another out of order.
    await click(within(row).getByTestId("option-1-item_cost"));
    await click(within(row).getByTestId("option-1-recognition:champion"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const segment = mockSave.mock.calls[0][1].segment_pattern[1];
    expect(segment.module_config).toEqual({
      families: ["item_stat:ad", "recognition:champion"],
    });
    expect(segment.card_timer_seconds).toBe(6);
  });

  it("a cleared number field serializes as null, never as zero", async () => {
    await mount();
    await setValue(
      within(screen.getByTestId("segment-row-0")).getByLabelText("Timer (seconds)"), "");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1].segment_pattern[0].timer_seconds).toBeNull();
  });

  it("shows what a module fixes without offering it for edit", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-1");
    expect(within(row).getByText(/challenge_count 5/)).toBeInTheDocument();
    expect(within(row).queryByLabelText(/challenge/i)).not.toBeInTheDocument();
    expect(within(row).queryByLabelText(/scoring/i)).not.toBeInTheDocument();
  });
});

// ── saving ─────────────────────────────────────────────────────────────────

describe("save", () => {
  it("sends the whole format to the selected target", async () => {
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0][0]).toBe("admin_bot");
  });

  it("PRESERVES format fields the builder never exposes", async () => {
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const sent = mockSave.mock.calls[0][1];

    // Top-level fields no control touches.
    expect(sent.schema_version).toBe(1);
    expect(sent.format_id).toBe("ranked_admin_bot");
    expect(sent.format_version).toBe(3);
    expect(sent.status).toBe("active");
    expect(sent.bot_eligible).toBe(true);
    expect(sent.rating_eligible).toBe(false);
    expect(sent.rollout_allowlist).toEqual([]);
    // A segment field the builder does not expose survives the reorder.
    const quiz = sent.segment_pattern.find((s) => s.module_id === "quiz")!;
    expect(quiz.pressure_seconds).toBe(4);
  });

  it("editing one field leaves every sibling field untouched", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await selectOption(within(row).getByLabelText("Question pool"), "hard_cooldowns");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const sent = mockSave.mock.calls[0][1].segment_pattern[0];
    const original = SAVED_FORMAT.segment_pattern[0];
    expect(sent).toEqual({
      ...original,
      module_config: { pool: "hard_cooldowns" },
    });
  });

  it("save success updates the revision and clears the dirty state", async () => {
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("save-config"));
    expect(await screen.findByTestId("save-success")).toHaveTextContent("revision 4");
    expect(screen.getByTestId("revision-label")).toHaveTextContent("Revision 4");
    expect(screen.getByTestId("save-config")).toBeDisabled();
    expect(screen.queryByTestId("dirty-label")).not.toBeInTheDocument();
  });

  it("save is disabled until something changes", async () => {
    await mount();
    expect(screen.getByTestId("save-config")).toBeDisabled();
    await click(screen.getByTestId("move-down-0"));
    expect(screen.getByTestId("save-config")).toBeEnabled();
    expect(screen.getByTestId("dirty-label")).toBeInTheDocument();
  });
});

// ── errors ─────────────────────────────────────────────────────────────────

describe("errors", () => {
  it("renders a backend validation refusal verbatim", async () => {
    mockSave.mockRejectedValue(
      new RankedFormatApiError(
        "segment quiz: unknown question pool 'nope' (known: easy_item_cost)",
        422,
        "RANKED_INVALID_CONFIG_FORMAT",
      ),
    );
    await mount();
    await click(screen.getByTestId("move-down-0"));
    await click(screen.getByTestId("save-config"));
    expect(await screen.findByTestId("save-error")).toHaveTextContent(
      "unknown question pool 'nope'",
    );
  });

  it("surfaces RANKED_STORED_CONFIG_INVALID from a load, prominently", async () => {
    mockConfig.mockRejectedValue(
      new RankedFormatApiError(
        "the saved Ranked configuration for 'public' cannot be used: revision 9 is not valid JSON. Save a valid configuration for this target, or delete its rows to fall back to the default format ladder.",
        500,
        "RANKED_STORED_CONFIG_INVALID",
      ),
    );
    render(<RankedFormatBuilder />);
    const alert = await screen.findByTestId("stored-config-invalid");
    expect(alert).toHaveTextContent("This lane is not creating matches");
    expect(alert).toHaveTextContent("delete its rows");
    // Never presented as a generic load failure that could be shrugged off.
    expect(screen.queryByTestId("load-error")).not.toBeInTheDocument();
  });

  it("a load failure is shown, not silently replaced by a blank editor", async () => {
    mockConfig.mockRejectedValue(new RankedFormatApiError("Backend returned 500.", 500));
    render(<RankedFormatBuilder />);
    expect(await screen.findByTestId("load-error")).toHaveTextContent("Backend returned 500.");
    expect(screen.queryByTestId("segment-list")).not.toBeInTheDocument();
  });

  it("an unusable fallback on an unsaved target is reported", async () => {
    mockConfig.mockResolvedValue(
      view({
        revision: null,
        config: null,
        fallback: null,
        fallback_unavailable: {
          code: "RANKED_MODERN_NOT_CONFIGURED",
          message: "missing the capability flag(s) it requires",
        },
      }),
    );
    render(<RankedFormatBuilder />);
    expect(await screen.findByTestId("load-error")).toHaveTextContent("capability flag");
  });
});

// ── product rules on the surface ───────────────────────────────────────────

describe("surface", () => {
  it("warns on the public target", async () => {
    await mount();
    await click(screen.getByTestId("target-public"));
    expect(await screen.findByTestId("public-target-warning")).toHaveTextContent(
      "affects new Public Ranked matches immediately",
    );
  });

  it("does not warn on the admin bot target", async () => {
    await mount();
    expect(screen.queryByTestId("public-target-warning")).not.toBeInTheDocument();
  });

  it("states the repeating cycle", async () => {
    await mount();
    expect(
      screen.getByText("Modules repeat in this order until the Ranked match ends."),
    ).toBeInTheDocument();
  });

  it("offers no Mastery module anywhere", async () => {
    const { container } = render(<RankedFormatBuilder />);
    await screen.findByTestId("segment-list");
    expect(container.textContent?.toLowerCase()).not.toContain("mastery");
    expect(screen.queryByTestId(/add-mastery/)).not.toBeInTheDocument();
  });

  it("has no draft, publish, activate or approve control", async () => {
    await mount();
    for (const word of [/draft/i, /publish/i, /activate/i, /approve/i, /promote/i]) {
      expect(screen.queryByRole("button", { name: word })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /^Save$/ })).toHaveLength(1);
  });

  it("keeps a segment whose module the catalog does not describe", async () => {
    mockConfig.mockResolvedValue(
      view({
        config: {
          ...structuredClone(SAVED_FORMAT),
          segment_pattern: [
            SAVED_FORMAT.segment_pattern[0],
            { module_id: "mastery_slice", module_version: 1, challenge_count: 3 },
          ],
        },
      }),
    );
    await mount();
    expect(screen.getByTestId("unsupported-module-1")).toBeInTheDocument();

    // ...and it survives a save byte for byte rather than being dropped.
    await click(screen.getByTestId("move-up-1"));
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1].segment_pattern[0]).toEqual({
      module_id: "mastery_slice",
      module_version: 1,
      challenge_count: 3,
    });
  });
});
