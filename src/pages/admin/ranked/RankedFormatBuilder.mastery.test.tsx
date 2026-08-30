// ---------------------------------------------------------------------------
// Admin Ranked Builder — `mastery_slice.v1` catalog entry.
//
// The backend catalog for this module is being written concurrently in a
// separate repo/worktree. This fixture is built from the field CONTRACT
// documented in the Phase 5 handoff, not from a live backend response:
//
//   module_config.mastery_set_id  enum, required, options carry an optional
//                                  `max_questions` alongside value/label
//   challenge_count                top-level SegmentSpec field, exposed only
//                                  on this module's catalog entry, label
//                                  "Questions"
//
// Once the backend worktree's real catalog lands this fixture should be
// diffed against it; nothing here should need to change if the shape matches
// what is documented above.
//
// The point of this file: prove the EXISTING generic renderer
// (ModuleConfigFields / SegmentRow / RankedFormatBuilder) needs zero new
// code to render Mastery correctly, and prove the one bit of new behaviour
// this phase adds — the challenge_count soft clamp when max_questions is
// exceeded.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

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

// --- fixture, built from the documented contract, NOT the live backend ----

const MASTERY_MODULE = {
  module_id: "mastery_slice",
  module_version: 1,
  label: "Mastery",
  description: "A block of Mastery questions drawn from one Mastery set.",
  defaults: {
    module_id: "mastery_slice",
    module_version: 1,
    challenge_count: 5,
    timer_seconds: null,
    pressure_seconds: null,
    full_damage: null,
    reduced_damage: null,
    ability_phase_seconds: null,
    module_config: { mastery_set_id: "playtest.champion.ahri" },
    analytics_tag: "playtest_mastery_1",
    scoring: "outcome",
    card_timer_seconds: null,
  },
  fields: [
    {
      key: "module_config.mastery_set_id",
      label: "Set",
      type: "enum" as const,
      required: true,
      options: [
        { value: "playtest.champion.ahri", label: "Ahri — Champion Mastery", max_questions: 8 },
        {
          value: "playtest.matchup.ahri.syndra",
          label: "Ahri vs Syndra — Matchup Mastery",
          max_questions: 4,
        },
      ],
    },
    {
      key: "challenge_count",
      label: "Questions",
      type: "integer" as const,
      required: true,
      min: 1,
    },
  ],
};

const QUIZ_MODULE = {
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
      type: "enum" as const,
      required: true,
      options: [{ value: "easy_item_cost", label: "easy_item_cost" }],
    },
    { key: "timer_seconds", label: "Timer (seconds)", type: "number" as const, required: true, min: 1 },
  ],
};

const CATALOG: ModuleCatalog = {
  schema_version: "ranked.builder_catalog.v1",
  cycle_note: "Modules repeat in this order until the Ranked match ends.",
  modules: [QUIZ_MODULE, MASTERY_MODULE],
};

const SAVED_FORMAT: RankedFormatJson = {
  schema_version: 1,
  format_id: "ranked_admin_bot",
  format_version: 3,
  status: "active",
  bot_eligible: true,
  rating_eligible: false,
  rollout_allowlist: [],
  segment_pattern: [
    { ...MASTERY_MODULE.defaults, analytics_tag: "mastery_slot_1" },
  ],
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
    fallback: null,
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

describe("mastery_slice catalog entry — generic rendering", () => {
  it("appears in Add Module using only the catalog label, no bespoke code", async () => {
    await mount();
    const add = screen.getByTestId("add-module");
    expect(within(add).getByTestId("add-mastery_slice-v1")).toBeInTheDocument();
    expect(within(add).getByText("Mastery")).toBeInTheDocument();
  });

  it("renders Set (enum) and Questions (integer) via the existing EnumField/NumberField", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    expect(within(row).getAllByText(/Mastery/).length).toBeGreaterThan(0);
    const setField = within(row).getByLabelText("Set");
    expect(setField.tagName).toBe("SELECT");
    const questionsField = within(row).getByLabelText("Questions");
    expect(questionsField).toHaveAttribute("type", "number");
  });

  it("the Set dropdown offers exactly the fixture's options", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    const setField = within(row).getByLabelText("Set") as HTMLSelectElement;
    const optionTexts = Array.from(setField.options).map((o) => o.textContent);
    expect(optionTexts).toContain("Ahri — Champion Mastery");
    expect(optionTexts).toContain("Ahri vs Syndra — Matchup Mastery");
  });

  it("does not expose challenge_count on Quiz or Meta Reflex-shaped modules", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    // Sanity: Quiz's catalog entry (added separately) has no Questions field.
    await click(screen.getByTestId("add-quiz-v1"));
    const quizRow = screen.getByTestId("segment-row-1");
    expect(within(quizRow).queryByLabelText("Questions")).not.toBeInTheDocument();
    expect(within(row).getByLabelText("Questions")).toBeInTheDocument();
  });
});

describe("mastery_slice catalog entry — writes", () => {
  it("selecting a set writes module_config.mastery_set_id", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const segment = mockSave.mock.calls[0][1].segment_pattern[0];
    expect((segment.module_config as Record<string, unknown>).mastery_set_id).toBe(
      "playtest.matchup.ahri.syndra",
    );
  });

  it("editing Questions writes segment challenge_count, not a new key", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await setValue(within(row).getByLabelText("Questions"), "7");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const segment = mockSave.mock.calls[0][1].segment_pattern[0];
    expect(segment.challenge_count).toBe(7);
  });

  it("never sends a duplicate question_count key", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await setValue(within(row).getByLabelText("Questions"), "6");
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const payload = JSON.stringify(mockSave.mock.calls[0][1]);
    expect(payload).not.toContain("question_count");
  });

  it("changing the set preserves unrelated segment fields (analytics_tag)", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const segment = mockSave.mock.calls[0][1].segment_pattern[0];
    expect(segment.analytics_tag).toBe("mastery_slot_1");
    expect(segment.scoring).toBe("outcome");
  });

  it("round-trips a full save payload: load -> edit one field -> save", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await setValue(within(row).getByLabelText("Questions"), "3");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const sent = mockSave.mock.calls[0][1];
    expect(sent).toEqual({
      ...SAVED_FORMAT,
      segment_pattern: [{ ...SAVED_FORMAT.segment_pattern[0], challenge_count: 3 }],
    });
  });
});

describe("mastery_slice catalog entry — challenge_count soft clamp", () => {
  it("clamps challenge_count down when it exceeds the newly selected set's max_questions", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    // Starting default is 5, within Ahri's max of 8. Switch to the matchup
    // set, whose max_questions is 4 — below the current 5.
    expect(within(row).getByLabelText("Questions")).toHaveValue(5);
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    expect(within(row).getByLabelText("Questions")).toHaveValue(4);
  });

  it("does not clamp when the value is already within the new set's max_questions", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await setValue(within(row).getByLabelText("Questions"), "2");
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    expect(within(row).getByLabelText("Questions")).toHaveValue(2);
  });

  it("does not clamp when the selected option carries no max_questions metadata", async () => {
    mockCatalog.mockResolvedValue({
      ...CATALOG,
      modules: [
        QUIZ_MODULE,
        {
          ...MASTERY_MODULE,
          fields: [
            {
              ...MASTERY_MODULE.fields[0],
              options: [{ value: "playtest.champion.ahri", label: "Ahri — Champion Mastery" }],
            },
            MASTERY_MODULE.fields[1],
          ],
        },
      ],
    });
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await setValue(within(row).getByLabelText("Questions"), "50");
    await selectOption(within(row).getByLabelText("Set"), "playtest.champion.ahri");
    expect(within(row).getByLabelText("Questions")).toHaveValue(50);
  });

  it("the clamp is presentational — the clamped value, not a client-rejected one, is what saves", async () => {
    await mount();
    const row = screen.getByTestId("segment-row-0");
    await selectOption(within(row).getByLabelText("Set"), "playtest.matchup.ahri.syndra");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const segment = mockSave.mock.calls[0][1].segment_pattern[0];
    expect(segment.challenge_count).toBe(4);
    expect((segment.module_config as Record<string, unknown>).mastery_set_id).toBe(
      "playtest.matchup.ahri.syndra",
    );
  });
});
