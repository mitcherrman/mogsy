// ---------------------------------------------------------------------------
// Admin Ranked Builder — `mastery_slice.v1`, all THREE generation sources.
//
// The Mastery slot names a generation SOURCE, then whatever that source needs,
// and the backend generates the questions when the segment is reached:
//
//   module_config.mastery_mode           enum, required —
//                                        "champion" | "matchup" | "applied_chain"
//   module_config.champion_id            enum, visible_when champion
//   module_config.champion_a_id          enum, visible_when matchup
//   module_config.champion_b_id          enum, visible_when matchup
//   module_config.attacker_champion_id   enum, visible_when applied_chain
//   module_config.ability_key            enum, depends_on the attacker,
//                                        visible_when applied_chain
//   module_config.target_champion_id     enum, visible_when applied_chain
//   challenge_count                      top-level SegmentSpec field, label
//                                        "Questions" — still the SOLE source of N
//
// This fixture mirrors the real backend catalog entry
// (`ranked_public/builder_catalog.py::_mastery_entry`), trimmed to a handful
// of champions; the live one carries the whole supported roster.
//
// The third source used to be a REGISTERED static Mastery set from a closed
// catalog, with a per-set variant filter. Those sets were hardcoded
// parameterizations of the Mastery generators and were deleted; the third
// source is now the applied combat chain, which names its subject the same
// way the other two do. `visible_when`, `depends_on` and `options_by` were
// already generic, so the renderer itself is unchanged apart from letting a
// single-choice enum be dependent too.
//
// What this file proves: the generic renderer renders a three-branch tagged
// union with no module knowledge of its own, and the mode switch normalizes
// the saved config so the backend never receives fields from a branch it did
// not select.
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
    // Mocked so the preview test proves the panel calls the REAL backend
    // endpoint's client with the editor's current policy — never that React
    // synthesised a sample of its own.
    previewMasterySlice: vi.fn(),
  };
});

import RankedFormatBuilder from "./RankedFormatBuilder";
import {
  fetchFormatConfig,
  fetchModuleCatalog,
  previewMasterySlice,
  saveFormatConfig,
  type FormatConfigView,
  type ModuleCatalog,
  type RankedFormatJson,
} from "@/lib/admin/rankedFormatApi";

const mockCatalog = vi.mocked(fetchModuleCatalog);
const mockConfig = vi.mocked(fetchFormatConfig);
const mockSave = vi.mocked(saveFormatConfig);
const mockPreview = vi.mocked(previewMasterySlice);

const MODE_KEY = "module_config.mastery_mode";

// The applied chain's subjects, exactly as the backend catalog publishes
// them: value = what is stored in module_config, label = what an admin reads.
// Bounded by CERTIFICATION rather than by the Mastery roster, which is why
// these are their own short lists and not `CHAMPIONS`.
const ATTACKERS = [
  { value: "jarvan", label: "Jarvan IV" },
  { value: "olaf", label: "Olaf" },
];

const ABILITIES_BY_ATTACKER: Record<string, { value: string; label: string }[]> = {
  jarvan: [
    { value: "Q", label: "Q — Dragon Strike" },
    { value: "R", label: "R — Cataclysm" },
  ],
  olaf: [{ value: "Q", label: "Q — Undertow" }],
};

const CHAIN_TARGETS = [
  { value: "ahri", label: "Ahri" },
  { value: "olaf", label: "Olaf" },
];

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
        { value: "applied_chain", label: "Applied combat chain" },
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
      key: "module_config.attacker_champion_id",
      label: "Attacker",
      type: "enum" as const,
      required: true,
      options: ATTACKERS,
      visible_when: { [MODE_KEY]: "applied_chain" },
    },
    {
      key: "module_config.ability_key",
      label: "Ability",
      type: "enum" as const,
      required: true,
      depends_on: "module_config.attacker_champion_id",
      options_by: ABILITIES_BY_ATTACKER,
      visible_when: { [MODE_KEY]: "applied_chain" },
    },
    {
      key: "module_config.target_champion_id",
      label: "Target",
      type: "enum" as const,
      required: true,
      options: CHAIN_TARGETS,
      visible_when: { [MODE_KEY]: "applied_chain" },
    },
    {
      key: "challenge_count",
      label: "Questions",
      type: "integer" as const,
      required: true,
      min: 1,
    },
  ],
  fixed: { min_challenge_count: 2 },
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


// ── (4) Runtime Mastery Set — the source production was missing ────────────
//
// Everything below drives the SAME components the champion/matchup tests
// drive. No test here references a Jarvan-specific component, prop or branch,
// because none exists: the set, its label and its variants all arrive as
// catalog data.

describe("mastery_slice — the applied combat chain", () => {
  const chooseAppliedChain = async () => {
    await mount();
    const row = await expand(0);
    await selectOption(within(row).getByLabelText("Mastery type"), "applied_chain");
    return row;
  };

  it("offers the applied chain alongside Champion and Matchup", async () => {
    await mount();
    const row = await expand(0);
    const mode = within(row).getByLabelText("Mastery type") as HTMLSelectElement;
    expect(Array.from(mode.options).map((o) => o.value)).toEqual([
      "", "champion", "matchup", "applied_chain",
    ]);
  });

  it("reveals the chain's subject fields and hides every other champion control", async () => {
    const row = await chooseAppliedChain();
    expect(within(row).getByLabelText("Attacker")).toBeInTheDocument();
    expect(within(row).getByLabelText("Target")).toBeInTheDocument();
    expect(within(row).queryByLabelText("Champion")).not.toBeInTheDocument();
    expect(within(row).queryByLabelText("Champion A")).not.toBeInTheDocument();
    expect(within(row).queryByLabelText("Champion B")).not.toBeInTheDocument();
    // Questions is common to every source and stays.
    expect(within(row).getByLabelText("Questions")).toBeInTheDocument();
  });

  it("lists each attacker by its display name, never a raw id", async () => {
    const row = await chooseAppliedChain();
    const select = within(row).getByLabelText("Attacker") as HTMLSelectElement;
    const labels = Array.from(select.options)
      .filter((o) => o.value).map((o) => o.textContent);
    expect(labels).toEqual(ATTACKERS.map((a) => a.label));
  });

  it("shows the selected attacker's certified abilities, from backend metadata", async () => {
    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "jarvan");
    const select = within(row).getByLabelText("Ability") as HTMLSelectElement;
    expect(Array.from(select.options).filter((o) => o.value)
      .map((o) => o.textContent)).toEqual(["Q — Dragon Strike", "R — Cataclysm"]);
  });

  it("offers a DIFFERENT attacker's different abilities", async () => {
    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "olaf");
    const select = within(row).getByLabelText("Ability") as HTMLSelectElement;
    expect(Array.from(select.options).filter((o) => o.value)
      .map((o) => o.textContent)).toEqual(["Q — Undertow"]);
  });

  it("renders NO ability control for an attacker the backend certifies none for", async () => {
    // An absent capability must read as an absent control, never an empty one.
    mockCatalog.mockResolvedValue({
      ...CATALOG,
      modules: CATALOG.modules.map((m) =>
        m.module_id !== "mastery_slice" ? m : {
          ...m,
          fields: m.fields.map((f) =>
            f.key !== "module_config.ability_key" ? f : { ...f, options_by: {} }),
        }),
    } as ModuleCatalog);
    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "jarvan");
    expect(within(row).queryByLabelText("Ability")).not.toBeInTheDocument();
  });

  it("serializes the backend's config contract, and nothing else", async () => {
    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "jarvan");
    await selectOption(within(row).getByLabelText("Ability"), "Q");
    await selectOption(within(row).getByLabelText("Target"), "olaf");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedConfig()).toEqual({
      mastery_mode: "applied_chain",
      attacker_champion_id: "jarvan",
      ability_key: "Q",
      target_champion_id: "olaf",
    });
  });

  it("strands no champion key when switching away from Champion", async () => {
    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "jarvan");
    await click(screen.getByTestId("save-config"));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(savedConfig()).not.toHaveProperty("champion_id");
  });

  it("restores the chain's subject when the page reloads", async () => {
    mockConfig.mockResolvedValue(view({
      config: {
        ...SAVED_FORMAT,
        segment_pattern: [{
          ...MASTERY_MODULE.defaults,
          challenge_count: 2,
          module_config: {
            mastery_mode: "applied_chain",
            attacker_champion_id: "olaf",
            ability_key: "Q",
            target_champion_id: "ahri",
          },
        }],
      },
    }));
    await mount();
    const row = await expand(0);
    expect(within(row).getByLabelText("Mastery type")).toHaveValue("applied_chain");
    expect(within(row).getByLabelText("Attacker")).toHaveValue("olaf");
    expect(within(row).getByLabelText("Ability")).toHaveValue("Q");
    expect(within(row).getByLabelText("Target")).toHaveValue("ahri");
  });

  it("previews through the real backend endpoint, with the unsaved policy", async () => {
    mockPreview.mockResolvedValue({
      is_sample: true,
      note: "Generated live from current data. Not saved.",
      challenges: [{
        challenge_index: 0,
        prompt: "Jarvan IV is level 11 with Dragon Strike rank 5 and an Axiom Arc…",
        answer_options: ["115", "134", "144", "199"],
        correct_answer: "144",
        explanation: "",
      }],
    } as never);

    const row = await chooseAppliedChain();
    await selectOption(within(row).getByLabelText("Attacker"), "jarvan");
    await selectOption(within(row).getByLabelText("Ability"), "Q");
    await selectOption(within(row).getByLabelText("Target"), "olaf");
    await click(within(row).getByTestId("preview-generation-0"));

    await waitFor(() => expect(mockPreview).toHaveBeenCalled());
    // The policy currently in the editor, not the one last saved.
    expect(mockPreview).toHaveBeenCalledWith({
      mastery_mode: "applied_chain",
      attacker_champion_id: "jarvan",
      ability_key: "Q",
      target_champion_id: "olaf",
    }, 5);
    expect(await within(row).findByTestId("preview-result-0")).toBeInTheDocument();
    expect(within(row).getByText(/Axiom Arc/)).toBeInTheDocument();
    // Labelled as a generated sample — on the control ("Generated live. Not
    // saved.") and again on the returned payload's own note, which travels
    // with the samples rather than being restated by the UI.
    expect(within(row).getAllByText(/Not saved/).length).toBeGreaterThanOrEqual(2);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("offers the sample on EVERY generated source, not just this one", async () => {
    // The panel describes a generated SLOT now, not a selected static set,
    // so an on-demand champion slot gets the same preview button.
    await mount();
    const row = await expand(0);
    expect(within(row).getByTestId("generation-policy-0")).toBeInTheDocument();
    expect(within(row).getByTestId("preview-generation-0")).toBeInTheDocument();
  });

  it("describes no static set, because there is none to describe", async () => {
    const row = await chooseAppliedChain();
    expect(within(row).queryByTestId("mastery-readiness")).not.toBeInTheDocument();
    expect(within(row).queryByTestId("weighting-unsupported")).not.toBeInTheDocument();
  });
});
