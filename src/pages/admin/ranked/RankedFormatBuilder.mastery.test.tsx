// ---------------------------------------------------------------------------
// Admin Ranked Builder — `mastery_slice.v1`, on-demand Mastery (Step 3).
//
// The Mastery slot no longer picks one of a tiny static list of pre-made
// Mastery Sets. It names a Mastery TYPE plus the champion(s), and the backend
// generates the questions from current canonical truth when the segment is
// reached:
//
//   module_config.mastery_mode    enum, required — "champion" | "matchup"
//   module_config.champion_id     enum, visible_when mastery_mode=champion
//   module_config.champion_a_id   enum, visible_when mastery_mode=matchup
//   module_config.champion_b_id   enum, visible_when mastery_mode=matchup
//   challenge_count               top-level SegmentSpec field, label
//                                 "Questions" — still the SOLE source of N
//
// This fixture mirrors the real backend catalog entry
// (`ranked_public/builder_catalog.py::_mastery_entry`), trimmed to a handful
// of champions; the live one carries the whole supported roster.
//
// What this file proves: the generic renderer needs only ONE new generic
// concept — `visible_when` — to render a tagged-union config, and the mode
// switch normalizes the saved config so the backend never receives fields
// from the branch it did not select.
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

const MODE_KEY = "module_config.mastery_mode";

const CHAMPIONS = [
  { value: "darius", label: "Darius" },
  { value: "garen", label: "Garen" },
  { value: "jinx", label: "Jinx" },
  { value: "kaisa", label: "Kai'Sa" },
  { value: "zed", label: "Zed" },
];

const MASTERY_MODULE = {
  module_id: "mastery_slice",
  module_version: 1,
  label: "Mastery Slice",
  description: "Mastery questions generated on demand for a champion or a matchup.",
  defaults: {
    module_id: "mastery_slice",
    module_version: 1,
    challenge_count: 5,
    timer_seconds: null,
    pressure_seconds: null,
    full_damage: null,
    reduced_damage: null,
    ability_phase_seconds: null,
    module_config: { mastery_mode: "champion", champion_id: "darius" },
    analytics_tag: "playtest_mastery_1",
    scoring: "outcome",
    card_timer_seconds: null,
  },
  fields: [
    {
      key: MODE_KEY,
      label: "Mastery type",
      type: "enum" as const,
      required: true,
      options: [
        { value: "champion", label: "Champion" },
        { value: "matchup", label: "Matchup" },
      ],
    },
    {
      key: "module_config.champion_id",
      label: "Champion",
      type: "enum" as const,
      required: true,
      options: CHAMPIONS,
      visible_when: { [MODE_KEY]: "champion" },
    },
    {
      key: "module_config.champion_a_id",
      label: "Champion A",
      type: "enum" as const,
      required: true,
      options: CHAMPIONS,
      visible_when: { [MODE_KEY]: "matchup" },
    },
    {
      key: "module_config.champion_b_id",
      label: "Champion B",
      type: "enum" as const,
      required: true,
      options: CHAMPIONS,
      visible_when: { [MODE_KEY]: "matchup" },
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
    {
      key: "timer_seconds",
      label: "Timer (seconds)",
      type: "number" as const,
      required: true,
      min: 1,
    },
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
  segment_pattern: [{ ...MASTERY_MODULE.defaults, analytics_tag: "mastery_slot_1" }],
};

function view(over: Partial<FormatConfigView> = {}): FormatConfigView {
  return {
    schema_version: "ranked.format_config.v1",
    target: "admin_bot",
    targets: ["admin_bot", "public"],
    revision: 3,
    config: structuredClone(SAVED_FORMAT),
    saved_by: "admin-1",
    saved_at: "2026-08-30 12:00:00",
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
    saved_at: "2026-08-30 12:05:00",
  }));
});

async function mount() {
  render(<RankedFormatBuilder />);
  await screen.findByTestId("segment-list");
}

const expand = async (index: number) => {
  await click(screen.getByTestId(`toggle-${index}`));
  return screen.getByTestId(`segment-row-${index}`);
};

const savedSegment = () => mockSave.mock.calls[0][1].segment_pattern[0];
const savedConfig = () => savedSegment().module_config as Record<string, unknown>;

// ── (1) Champion mode renders one champion selector + Questions ────────────

describe("mastery_slice — Champion mode", () => {
  it("renders the Mastery type selector, ONE champion selector and Questions", async () => {
    await mount();
    const row = await expand(0);

    expect(within(row).getByLabelText("Mastery type")).toBeInTheDocument();
    expect(within(row).getByLabelText("Champion").tagName).toBe("SELECT");
    expect(within(row).getByLabelText("Questions")).toHaveAttribute("type", "number");

    // The matchup branch's fields are not on screen.
    expect(within(row).queryByLabelText("Champion A")).not.toBeInTheDocument();
    expect(within(row).queryByLabelText("Champion B")).not.toBeInTheDocument();
  });

  it("offers the roster the catalog supplied, by display name", async () => {
    await mount();
    const row = await expand(0);
    const champion = within(row).getByLabelText("Champion") as HTMLSelectElement;
    const labels = Array.from(champion.options).map((o) => o.textContent);
    expect(labels).toContain("Zed");
    expect(labels).toContain("Kai'Sa");
  });

  it("selecting a champion writes the canonical id into module_config", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Champion"), "zed");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedConfig()).toEqual({ mastery_mode: "champion", champion_id: "zed" });
  });
});

// ── (2) Matchup mode renders two selectors + Questions ─────────────────────

describe("mastery_slice — Matchup mode", () => {
  it("renders TWO champion selectors and Questions, and hides the single one", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Mastery type"), "matchup");

    expect(within(row).getByLabelText("Champion A")).toBeInTheDocument();
    expect(within(row).getByLabelText("Champion B")).toBeInTheDocument();
    expect(within(row).getByLabelText("Questions")).toBeInTheDocument();
    expect(within(row).queryByLabelText("Champion")).not.toBeInTheDocument();
  });

  it("writes both canonical champion ids", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Mastery type"), "matchup");
    await selectOption(within(row).getByLabelText("Champion A"), "jinx");
    await selectOption(within(row).getByLabelText("Champion B"), "kaisa");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedConfig()).toEqual({
      mastery_mode: "matchup",
      champion_a_id: "jinx",
      champion_b_id: "kaisa",
    });
  });
});

// ── (3) mode switch normalizes config ──────────────────────────────────────

describe("mastery_slice — mode switching normalizes the saved config", () => {
  it("Champion -> Matchup drops champion_id and seeds both matchup fields", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Mastery type"), "matchup");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const config = savedConfig();
    expect(config).not.toHaveProperty("champion_id");
    expect(config.mastery_mode).toBe("matchup");
    // Both revealed fields carry a real value, never left undefined.
    expect(typeof config.champion_a_id).toBe("string");
    expect(typeof config.champion_b_id).toBe("string");
  });

  it("Matchup -> Champion drops both matchup fields", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Mastery type"), "matchup");
    await selectOption(within(row).getByLabelText("Champion A"), "garen");
    await selectOption(within(row).getByLabelText("Champion B"), "darius");
    await selectOption(within(row).getByLabelText("Mastery type"), "champion");
    // Pick a champion other than the fixture's default, so the round trip
    // leaves the format genuinely dirty and the save button is enabled.
    await selectOption(within(row).getByLabelText("Champion"), "zed");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());

    const config = savedConfig();
    expect(config).not.toHaveProperty("champion_a_id");
    expect(config).not.toHaveProperty("champion_b_id");
    expect(config).toEqual({ mastery_mode: "champion", champion_id: "zed" });
  });

  it("switching back and forth never accumulates stale keys", async () => {
    await mount();
    const row = await expand(0);
    const mode = within(row).getByLabelText("Mastery type");
    await selectOption(mode, "matchup");
    await selectOption(mode, "champion");
    await selectOption(mode, "matchup");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(Object.keys(savedConfig()).sort()).toEqual([
      "champion_a_id",
      "champion_b_id",
      "mastery_mode",
    ]);
  });
});

// ── (4) question count of 1 is allowed ─────────────────────────────────────

describe("mastery_slice — question count", () => {
  it("accepts 1", async () => {
    await mount();
    const row = await expand(0);
    await setValue(within(row).getByLabelText("Questions"), "1");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedSegment().challenge_count).toBe(1);
  });

  it("writes challenge_count, never a duplicate question_count key", async () => {
    await mount();
    const row = await expand(0);
    await setValue(within(row).getByLabelText("Questions"), "6");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedSegment().challenge_count).toBe(6);
    expect(JSON.stringify(mockSave.mock.calls[0][1])).not.toContain("question_count");
  });

  it("is no longer clamped by any static per-set ceiling", async () => {
    // On-demand Mastery publishes no max_questions; availability is resolved
    // live by the backend at save time.
    await mount();
    const row = await expand(0);
    await setValue(within(row).getByLabelText("Questions"), "40");
    expect(within(row).getByLabelText("Questions")).toHaveValue(40);
  });
});

// ── (5)(6) saved JSON shape, and reopening a saved config ──────────────────

describe("mastery_slice — save payload and reload", () => {
  it("saves exactly the backend's schema shape for Champion Mastery", async () => {
    await mount();
    const row = await expand(0);
    await setValue(within(row).getByLabelText("Questions"), "3");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockSave.mock.calls[0][1]).toEqual({
      ...SAVED_FORMAT,
      segment_pattern: [{ ...SAVED_FORMAT.segment_pattern[0], challenge_count: 3 }],
    });
  });

  it("preserves unrelated segment fields through a Mastery edit", async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Champion"), "zed");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedSegment().analytics_tag).toBe("mastery_slot_1");
    expect(savedSegment().scoring).toBe("outcome");
  });

  it("reopening a saved Matchup config repopulates both selectors", async () => {
    mockConfig.mockResolvedValue(
      view({
        config: {
          ...SAVED_FORMAT,
          segment_pattern: [
            {
              ...MASTERY_MODULE.defaults,
              challenge_count: 2,
              module_config: {
                mastery_mode: "matchup",
                champion_a_id: "garen",
                champion_b_id: "darius",
              },
            },
          ],
        },
      }),
    );
    await mount();
    const row = await expand(0);
    expect(within(row).getByLabelText("Mastery type")).toHaveValue("matchup");
    expect(within(row).getByLabelText("Champion A")).toHaveValue("garen");
    expect(within(row).getByLabelText("Champion B")).toHaveValue("darius");
    expect(within(row).getByLabelText("Questions")).toHaveValue(2);
  });

  it("reopening a saved Champion config repopulates its selector", async () => {
    mockConfig.mockResolvedValue(
      view({
        config: {
          ...SAVED_FORMAT,
          segment_pattern: [
            {
              ...MASTERY_MODULE.defaults,
              module_config: { mastery_mode: "champion", champion_id: "zed" },
            },
          ],
        },
      }),
    );
    await mount();
    const row = await expand(0);
    expect(within(row).getByLabelText("Mastery type")).toHaveValue("champion");
    expect(within(row).getByLabelText("Champion")).toHaveValue("zed");
  });
});

// ── (7) the old static Mastery Set dropdown is gone ────────────────────────

describe("mastery_slice — the static Mastery Set dropdown is gone", () => {
  it("offers no Mastery set field and no playtest set id anywhere", async () => {
    await mount();
    const row = await expand(0);
    expect(within(row).queryByLabelText("Mastery set")).not.toBeInTheDocument();
    expect(within(row).queryByLabelText("Set")).not.toBeInTheDocument();
    expect(row.innerHTML).not.toContain("playtest.");
  });
});

// ── (8) the rest of the builder is untouched ───────────────────────────────

describe("mastery_slice — the rest of the builder still behaves", () => {
  it("appears in Add Module from the catalog label alone", async () => {
    await mount();
    const add = screen.getByTestId("add-module");
    expect(within(add).getByTestId("add-mastery_slice-v1")).toBeInTheDocument();
  });

  it("does not leak Questions onto a quiz-shaped module", async () => {
    await mount();
    const row = await expand(0);
    await click(screen.getByTestId("add-quiz-v1"));
    const quizRow = await expand(1);
    expect(within(quizRow).queryByLabelText("Questions")).not.toBeInTheDocument();
    expect(within(row).getByLabelText("Questions")).toBeInTheDocument();
  });

  it("a quiz segment's config is untouched by the Mastery normalization", async () => {
    await mount();
    await click(screen.getByTestId("add-quiz-v1"));
    const quizRow = await expand(1);
    await setValue(within(quizRow).getByLabelText("Timer (seconds)"), "15");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const quizSegment = mockSave.mock.calls[0][1].segment_pattern[1];
    expect(quizSegment.module_config).toEqual({ pool: "easy_item_cost" });
    expect(quizSegment.timer_seconds).toBe(15);
  });
});

// ── the compact row's one line, for a Mastery slot ─────────────────────────

describe("mastery_slice — collapsed summary", () => {
  it("summarises the slot without opening the row", async () => {
    await mount();
    const summary = screen.getByTestId("segment-summary-0");
    expect(summary).toHaveTextContent("Mastery Slice");
    expect(summary).toHaveTextContent("5 questions");
    expect(screen.queryByLabelText("Champion")).toBeNull();
  });

  it("follows the question count as it is edited", async () => {
    await mount();
    const row = await expand(0);
    await setValue(within(row).getByLabelText("Questions"), "1");
    expect(screen.getByTestId("segment-summary-0")).toHaveTextContent("1 question");
  });
});
