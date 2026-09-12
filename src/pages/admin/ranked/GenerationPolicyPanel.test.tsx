// ---------------------------------------------------------------------------
// Quiz Admin — runtime generation controls, rendered from backend metadata.
//
// The fixture is the REAL backend catalog entry, captured verbatim from
// `ranked_public.builder_catalog.builder_catalog(conn)` and checked in as
// `src/lib/admin/__fixtures__/masterySliceCatalogEntry.json`. That is
// deliberate: the whole claim of this feature is that Quiz Admin renders
// whatever the backend declares, so a hand-written fixture agreeing with a
// hand-written renderer would prove nothing about the contract they are
// supposed to share.
//
// Nothing in these tests, or in the components they exercise, knows which
// Mastery generators exist, which champions they cover, or anything about an
// item, an ability or a damage number. Every one of those comes out of the
// fixture, which came out of the backend.
//
// The catalog used to also carry a `mastery_sets` block describing a closed
// registry of prebuilt sets a slot could name. Those sets were hardcoded
// parameterizations of the generators and were deleted, so the block, the
// set dropdown and the per-set variant control are gone with them.
// ---------------------------------------------------------------------------

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/rankedFormatApi", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/rankedFormatApi")
  >("@/lib/admin/rankedFormatApi");
  return { ...actual, previewMasterySlice: vi.fn() };
});

import CATALOG_ENTRY from "@/lib/admin/__fixtures__/masterySliceCatalogEntry.json";
import {
  previewMasterySlice,
  RankedFormatApiError,
  type CatalogModule,
  type SegmentSpecJson,
} from "@/lib/admin/rankedFormatApi";
import { ModuleConfigFields, resolveFieldOptions } from "./ModuleConfigFields";
import { GenerationPolicyPanel } from "./GenerationPolicyPanel";

const mockPreview = vi.mocked(previewMasterySlice);
const entry = CATALOG_ENTRY as unknown as CatalogModule;

/** A deterministic subject, read from the fixture rather than typed here. */
const attackerField = (CATALOG_ENTRY as unknown as CatalogModule)
  .fields.find((f) => f.key === "module_config.attacker_champion_id")!;
const ATTACKER = String(attackerField.options![0].value);
const ABILITY = String(
  attackerField && (CATALOG_ENTRY as unknown as CatalogModule)
    .fields.find((f) => f.key === "module_config.ability_key")!
    .options_by![ATTACKER][0].value);

function segment(over: Partial<SegmentSpecJson> = {}): SegmentSpecJson {
  return {
    module_id: "mastery_slice",
    module_version: 1,
    challenge_count: 2,
    module_config: {
      mastery_mode: "applied_chain",
      attacker_champion_id: ATTACKER,
      ability_key: ABILITY,
      target_champion_id: "olaf",
    },
    ...over,
  };
}

const field = (key: string) => entry.fields.find((f) => f.key === key)!;

beforeEach(() => { vi.clearAllMocks(); });

// ------------------------------------- the catalog really does declare this

describe("the backend catalog declares the generation contract", () => {
  it("offers a generator and its subject, and never a static set", () => {
    const keys = entry.fields.map((f) => f.key);
    expect(keys).toContain("module_config.mastery_mode");
    expect(keys).not.toContain("module_config.mastery_set_id");
    expect(keys).not.toContain("module_config.allowed_variants");
    // One field per key: the renderer addresses a field BY key.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares the ability control as DEPENDENT on the attacker", () => {
    const ability = field("module_config.ability_key");
    expect(ability.type).toBe("enum");
    expect(ability.depends_on).toBe("module_config.attacker_champion_id");
    expect(ability.options_by).toBeTruthy();
  });

  it("carries no per-set capability block for the UI to describe", () => {
    expect((entry as unknown as Record<string, unknown>).mastery_sets)
      .toBeUndefined();
  });

  it("enforces the servable floor through the catalog's own minimum", () => {
    expect(field("challenge_count").min).toBe(1);
  });
});

// ------------------------------------------------- dependent option lookup

describe("a dependent field resolves its options from the parent value", () => {
  it("offers the selected attacker's own certified abilities", () => {
    const options = resolveFieldOptions(
      field("module_config.ability_key"), segment());
    expect(options?.map((o) => o.value)).toEqual(
      field("module_config.ability_key").options_by![ATTACKER]
        .map((o) => o.value));
  });

  it("offers NOTHING for a champion the backend certifies nothing for", () => {
    // Null, not []: an absent capability must read as an absent control.
    expect(resolveFieldOptions(
      field("module_config.ability_key"),
      segment({ module_config: {
        mastery_mode: "applied_chain",
        attacker_champion_id: "not-a-certified-champion" } }),
    )).toBeNull();
  });

  it("leaves a non-dependent field's options exactly as declared", () => {
    const options = resolveFieldOptions(
      field("module_config.attacker_champion_id"), segment());
    expect(options?.map((o) => o.value)).toEqual(
      field("module_config.attacker_champion_id").options!.map((o) => o.value));
  });
});

// ---------------------------------------------------------- rendered form

function renderFields(seg: SegmentSpecJson, onChange = vi.fn()) {
  render(<ModuleConfigFields fields={entry.fields} segment={seg} index={0}
                             onChange={onChange} />);
  return onChange;
}

describe("the form renders from that metadata", () => {
  it("shows the ability control with the selected attacker's abilities", () => {
    renderFields(segment());
    const control = screen.getByLabelText("Ability") as HTMLSelectElement;
    expect(control).toBeInTheDocument();
    const offered = Array.from(control.options)
      .map((o) => o.value).filter(Boolean);
    expect(offered).toEqual(
      field("module_config.ability_key").options_by![ATTACKER]
        .map((o) => String(o.value)));
  });

  it("does NOT show the ability control for an uncertified attacker", () => {
    renderFields(segment({ module_config: {
      mastery_mode: "applied_chain",
      attacker_champion_id: "not-a-certified-champion" } }));
    expect(screen.queryByTestId("field-0-module_config.ability_key")).toBeNull();
  });

  it("does not show it before an attacker has been chosen at all", () => {
    renderFields(segment({ module_config: { mastery_mode: "applied_chain" } }));
    expect(screen.queryByTestId("field-0-module_config.ability_key")).toBeNull();
  });

  it("shows no control for a capability no field declares", () => {
    // Per-variant weighting was a static set's capability and is declared
    // nowhere now. Asserted so a faked control would fail.
    expect(entry.fields.some((f) => f.key.includes("weight"))).toBe(false);
    expect(entry.fields.some((f) => f.key.includes("variant"))).toBe(false);
    renderFields(segment());
    expect(screen.queryByLabelText(/weight/i)).toBeNull();
  });

  it("writes the chosen ability back under the backend's own config key", () => {
    const onChange = renderFields(segment());
    fireEvent.change(screen.getByLabelText("Ability"),
                     { target: { value: ABILITY } });
    expect(onChange).toHaveBeenCalledWith(
      "module_config.ability_key", ABILITY);
  });
});

// ------------------------------------------------------- capability panel

function renderPanel(seg: SegmentSpecJson) {
  return render(<GenerationPolicyPanel segment={seg}
                                       moduleId={seg.module_id}
                                       index={0} />);
}

describe("the generation policy panel", () => {
  it("says the slot generates its questions, and offers a sample", () => {
    renderPanel(segment());
    const panel = screen.getByTestId("generation-policy-0");
    expect(panel).toHaveTextContent(/generates its questions/i);
    expect(screen.getByTestId("preview-generation-0")).toBeInTheDocument();
  });

  it("describes no set, because there is no set to describe", () => {
    renderPanel(segment());
    expect(screen.queryByTestId("mastery-readiness")).toBeNull();
    expect(screen.queryByTestId("weighting-unsupported")).toBeNull();
    expect(screen.queryByTestId("difficulty-unsupported")).toBeNull();
  });

  it("renders nothing at all for a module that generates nothing", () => {
    renderPanel(segment({ module_id: "quiz" }));
    expect(screen.queryByTestId("generation-policy-0")).toBeNull();
  });
});

// -------------------------------------------------------------- preview

const PREVIEW = {
  schema_version: "ranked.mastery_slice_preview.v1",
  is_sample: true,
  note: "Generated now from canonical data. A real match freezes its own copy.",
  mastery_set_id: "mset_abc",
  prompt: "Mastery Slice",
  challenge_count: 1,
  module_config: { mastery_mode: "applied_chain" },
  challenges: [{
    challenge_index: 0,
    interaction_kind: "legacy_combat",
    question_family: "post_mitigation_single_type_damage",
    prompt: "A backend-generated question.",
    answer_type: "single_choice",
    answer_options: ["115", "134", "144", "199"],
    correct_answer: "144",
    explanation: "The backend's own worked explanation.",
  }],
};

describe("preview", () => {
  it("asks the BACKEND to generate from the policy in the editor", async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    const seg = segment({ challenge_count: 2 });
    renderPanel(seg);
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    // The unsaved policy exactly as edited, not a saved one.
    expect(mockPreview).toHaveBeenCalledWith(seg.module_config, 2);
  });

  it("shows the backend's own question, options, answer and explanation", async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    renderPanel(segment());
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-result-0")).toBeInTheDocument());
    expect(screen.getByText("A backend-generated question.")).toBeInTheDocument();
    expect(screen.getByText(/115 · 134 · 144 · 199/)).toBeInTheDocument();
    expect(screen.getByText("Answer: 144")).toBeInTheDocument();
    expect(screen.getByText("The backend's own worked explanation."))
      .toBeInTheDocument();
  });

  it("labels the result as a generated sample, using the backend's own words", async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    renderPanel(segment());
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-result-0")).toHaveTextContent(
        /Generated now from canonical data/));
    expect(screen.getByText("Generated live. Not saved.")).toBeInTheDocument();
  });

  it("surfaces the backend's refusal verbatim rather than guessing", async () => {
    mockPreview.mockRejectedValue(new RankedFormatApiError(
      "segment mastery_slice: module_config.mastery_set_id is retired", 422,
      "RANKED_INVALID_CONFIG_FORMAT"));
    renderPanel(segment());
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-error-0"))
        .toHaveTextContent("mastery_set_id is retired"));
    expect(screen.queryByTestId("preview-result-0")).toBeNull();
  });

  it("drops a sample the moment the policy it described changes", async () => {
    mockPreview.mockResolvedValue(PREVIEW);
    const { rerender } = renderPanel(segment());
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-result-0")).toBeInTheDocument());

    // A stale sample shown beside edited settings is worse than none.
    rerender(<GenerationPolicyPanel
      segment={segment({ challenge_count: 3 })}
      moduleId="mastery_slice" index={0} />);
    await waitFor(() =>
      expect(screen.queryByTestId("preview-result-0")).toBeNull());
  });
});
