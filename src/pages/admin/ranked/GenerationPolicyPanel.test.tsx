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
// Mastery sets exist, what a variant means, or anything about a champion, an
// item, an ability or a damage number. Every one of those comes out of the
// fixture, which came out of the backend.
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

const JARVAN = "chain.jarvan.physical_penetration";
const AHRI = "playtest.champion.ahri";

function segment(over: Partial<SegmentSpecJson> = {}): SegmentSpecJson {
  return {
    module_id: "mastery_slice",
    module_version: 1,
    challenge_count: 2,
    module_config: { mastery_set_id: JARVAN },
    ...over,
  };
}

const field = (key: string) => entry.fields.find((f) => f.key === key)!;

beforeEach(() => { vi.clearAllMocks(); });

// ------------------------------------- the catalog really does declare this

describe("the backend catalog declares the generation contract", () => {
  it("offers exactly three settings for a runtime-generating slot", () => {
    expect(entry.fields.map((f) => f.key)).toEqual([
      "module_config.mastery_set_id",
      "challenge_count",
      "module_config.allowed_variants",
    ]);
  });

  it("declares the variant control as DEPENDENT on the chosen set", () => {
    const variants = field("module_config.allowed_variants");
    expect(variants.type).toBe("multi_enum");
    expect(variants.depends_on).toBe("module_config.mastery_set_id");
    expect(variants.required).toBe(false);
  });

  it("carries each set's capabilities, so the UI declares none of its own", () => {
    const jarvan = entry.mastery_sets?.find((c) => c.set_id === JARVAN);
    expect(jarvan).toBeDefined();
    expect(jarvan!.variants.map((v) => v.variant_id))
      .toEqual(["lethality", "percent_pen"]);
    expect(jarvan!.supports_variant_weighting).toBe(false);
    expect(jarvan!.supports_difficulty).toBe(false);
    expect(jarvan!.max_questions).toBe(2);
  });

  it("enforces the servable floor through the catalog's own minimum", () => {
    expect(field("challenge_count").min).toBe(2);
  });
});

// ------------------------------------------------- dependent option lookup

describe("a dependent field resolves its options from the parent value", () => {
  it("offers the selected set's own variants", () => {
    const options = resolveFieldOptions(
      field("module_config.allowed_variants"), segment());
    expect(options?.map((o) => o.value)).toEqual(["lethality", "percent_pen"]);
  });

  it("offers a different set's different variants", () => {
    const options = resolveFieldOptions(
      field("module_config.allowed_variants"),
      segment({ module_config: { mastery_set_id: AHRI } }));
    expect(options?.map((o) => o.value)).toEqual(
      entry.mastery_sets!.find((c) => c.set_id === AHRI)!
        .variants.map((v) => v.variant_id));
  });

  it("offers NOTHING for a set the backend declares no variants for", () => {
    // Null, not []: an absent capability must read as an absent control.
    expect(resolveFieldOptions(
      field("module_config.allowed_variants"),
      segment({ module_config: { mastery_set_id: "some.set.with.no.variants" } }),
    )).toBeNull();
  });

  it("leaves a non-dependent field's options exactly as declared", () => {
    const options = resolveFieldOptions(field("module_config.mastery_set_id"),
                                        segment());
    expect(options?.map((o) => o.value).sort())
      .toEqual(entry.mastery_sets!.map((c) => c.set_id).sort());
  });
});

// ---------------------------------------------------------- rendered form

function renderFields(seg: SegmentSpecJson, onChange = vi.fn()) {
  render(<ModuleConfigFields fields={entry.fields} segment={seg} index={0}
                             onChange={onChange} />);
  return onChange;
}

describe("the form renders from that metadata", () => {
  it("shows the variant control with the selected set's variants", () => {
    renderFields(segment());
    expect(screen.getByTestId("field-0-module_config.allowed_variants"))
      .toBeInTheDocument();
    expect(screen.getByTestId("option-0-lethality")).toBeInTheDocument();
    expect(screen.getByTestId("option-0-percent_pen")).toBeInTheDocument();
  });

  it("does NOT show the variant control for a set with no variants", () => {
    renderFields(segment({
      module_config: { mastery_set_id: "some.set.with.no.variants" } }));
    expect(screen.queryByTestId("field-0-module_config.allowed_variants"))
      .toBeNull();
  });

  it("does not show it before a set has been chosen at all", () => {
    renderFields(segment({ module_config: {} }));
    expect(screen.queryByTestId("field-0-module_config.allowed_variants"))
      .toBeNull();
  });

  it("shows no control for a capability no field declares", () => {
    // Weighting is declared unsupported, so there is no weighting field and
    // therefore nothing to render. Asserted so a faked control would fail.
    expect(entry.fields.some((f) => f.key.includes("weight"))).toBe(false);
    renderFields(segment());
    expect(screen.queryByLabelText(/weight/i)).toBeNull();
  });

  it("writes the chosen variants back under the backend's own config key", () => {
    const onChange = renderFields(segment());
    fireEvent.click(screen.getByTestId("option-0-lethality"));
    expect(onChange).toHaveBeenCalledWith(
      "module_config.allowed_variants", ["lethality"]);
  });

  it("round-trips a saved variant policy back into the form", () => {
    renderFields(segment({
      module_config: { mastery_set_id: JARVAN, allowed_variants: ["percent_pen"] },
    }));
    expect(screen.getByTestId("option-0-percent_pen"))
      .toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("option-0-lethality"))
      .toHaveAttribute("aria-checked", "false");
  });
});

// ------------------------------------------------------- capability panel

function renderPanel(seg: SegmentSpecJson) {
  return render(<GenerationPolicyPanel segment={seg}
                                       capabilities={entry.mastery_sets}
                                       index={0} />);
}

describe("the generation policy panel", () => {
  it("states the selected set's declared description and readiness", () => {
    renderPanel(segment());
    const panel = screen.getByTestId("generation-policy-0");
    const jarvan = entry.mastery_sets!.find((c) => c.set_id === JARVAN)!;
    expect(panel).toHaveTextContent(jarvan.description);
    expect(screen.getByTestId("mastery-readiness"))
      .toHaveAttribute("data-readiness-state", "ready");
  });

  it("says plainly that weighting and difficulty are unsupported", () => {
    renderPanel(segment());
    expect(screen.getByTestId("weighting-unsupported")).toBeInTheDocument();
    expect(screen.getByTestId("difficulty-unsupported")).toBeInTheDocument();
  });

  it("renders nothing at all when no known set is selected", () => {
    renderPanel(segment({ module_config: { mastery_set_id: "unknown.set" } }));
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
  module_config: { mastery_set_id: JARVAN },
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
    renderPanel(segment({
      module_config: { mastery_set_id: JARVAN, allowed_variants: ["percent_pen"] },
      challenge_count: 2,
    }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    // The unsaved policy exactly as edited, not a saved one.
    expect(mockPreview).toHaveBeenCalledWith(
      { mastery_set_id: JARVAN, allowed_variants: ["percent_pen"] }, 2);
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
      "segment mastery_slice: unknown variant 'bogus'", 422,
      "RANKED_INVALID_CONFIG_FORMAT"));
    renderPanel(segment());
    await act(async () => {
      fireEvent.click(screen.getByTestId("preview-generation-0"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("preview-error-0"))
        .toHaveTextContent("unknown variant 'bogus'"));
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
      segment={segment({
        module_config: { mastery_set_id: JARVAN, allowed_variants: ["lethality"] },
      })}
      capabilities={entry.mastery_sets} index={0} />);
    await waitFor(() =>
      expect(screen.queryByTestId("preview-result-0")).toBeNull());
  });
});
