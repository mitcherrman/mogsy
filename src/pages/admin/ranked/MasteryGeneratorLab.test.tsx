// ---------------------------------------------------------------------------
// Mastery Generator Lab — the frontend contract.
//
// THE FIXTURES ARE REAL. `masterySliceCatalogEntry.json` is the backend's own
// catalog entry and `masterySlicePreviews.json` / `masterySliceCoverage.json`
// are verbatim captures of what `ranked_public/mastery_preview.py` returned for
// all three production generators against the canonical database. That is the
// point: this page's whole claim is that it renders what the backend produces,
// and a hand-written fixture agreeing with a hand-written renderer would prove
// nothing about the contract they are meant to share.
//
// So nothing in this file knows a champion, an ability, an item, a damage
// number or a question family. Every one of them arrives from the backend,
// through a fixture, and is asserted BY READING THE FIXTURE rather than by
// being typed here — which is what makes these tests fail if the wire contract
// moves instead of quietly passing against a stale copy.
// ---------------------------------------------------------------------------

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/rankedFormatApi", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/rankedFormatApi")
  >("@/lib/admin/rankedFormatApi");
  return {
    ...actual,
    fetchModuleCatalog: vi.fn(),
    previewMasterySlice: vi.fn(),
    fetchMasterySliceCoverage: vi.fn(),
  };
});

// The admin gate renders its children once credentials are present. Stubbed so
// these tests exercise the Lab rather than re-testing the shared gate, which
// has its own suite — the gate itself is NOT removed from the page.
vi.mock("@/components/admin/AdminAuthGate", () => ({
  AdminAuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CATALOG_ENTRY from "@/lib/admin/__fixtures__/masterySliceCatalogEntry.json";
import PREVIEWS from "@/lib/admin/__fixtures__/masterySlicePreviews.json";
import COVERAGE from "@/lib/admin/__fixtures__/masterySliceCoverage.json";
import {
  RankedFormatApiError,
  fetchMasterySliceCoverage,
  fetchModuleCatalog,
  previewMasterySlice,
  type CatalogModule,
  type MasterySliceCoverageView,
  type MasterySlicePreview,
} from "@/lib/admin/rankedFormatApi";
import { MasteryGeneratorLab, STATIC_QUESTIONS_PATH, newSeed } from "./MasteryGeneratorLab";

const catalog = vi.mocked(fetchModuleCatalog);
const preview = vi.mocked(previewMasterySlice);
const coverage = vi.mocked(fetchMasterySliceCoverage);

const ENTRY = CATALOG_ENTRY as unknown as CatalogModule;
type Mode = "champion" | "matchup" | "applied_chain";
const MODES: Mode[] = ["champion", "matchup", "applied_chain"];
const previewFor = (mode: Mode) =>
  (PREVIEWS as Record<string, unknown>)[mode] as MasterySlicePreview;
const coverageFor = (mode: Mode) =>
  (COVERAGE as Record<string, unknown>)[mode] as MasterySliceCoverageView;

/**
 * The providers the real renderers need.
 *
 * A QueryClient is required because the arena's own scenario cards fetch the
 * champion asset manifest through react-query — which is itself evidence that
 * this page renders the PRODUCTION components rather than a simplified copy: a
 * Lab-owned text renderer would need no provider at all. The router is here
 * for the Static Questions link.
 */
function mountLab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MasteryGeneratorLab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  catalog.mockResolvedValue({
    schema_version: "ranked.builder_catalog.v1",
    modules: [ENTRY],
    cycle_note: "Modules repeat in this order until the Ranked match ends.",
  });
  preview.mockResolvedValue(previewFor("champion"));
  coverage.mockResolvedValue(coverageFor("champion"));
});

async function generate(mode: Mode = "champion") {
  preview.mockResolvedValue(previewFor(mode));
  mountLab();
  await screen.findByTestId("generate");
  fireEvent.click(screen.getByTestId("generate"));
  await screen.findByTestId("generated-slice");
}

// --------------------------------------------------------------- navigation


describe("Generator Lab — navigation and the static/generated boundary", () => {
  it("names Static Questions as a different surface and links to it", async () => {
    mountLab();
    const link = await screen.findByTestId("static-questions-link");
    expect(link).toHaveAttribute("href", STATIC_QUESTIONS_PATH);
    // The distinction, stated on the page rather than only in a doc.
    expect(screen.getByText(/generated, not stored/i)).toBeInTheDocument();
  });

  it("says in the page itself that previewing writes nothing", async () => {
    mountLab();
    await screen.findByTestId("mastery-generator-lab");
    // Read off the container's collapsed text rather than with a text matcher:
    // the sentence is broken across a <code> element and wrapped across source
    // lines, so an element-level matcher would be testing JSX formatting
    // rather than what the page says.
    const said = screen.getByTestId("mastery-generator-lab")
      .textContent!.replace(/\s+/g, " ");
    expect(said).toMatch(/no attempt, no history, no match, no round/i);
  });
});

// --------------------------------------------------------------- controls


describe("Generator Lab — generator controls", () => {
  it("renders its controls from the BACKEND catalog, holding no roster of its own", async () => {
    mountLab();
    await screen.findByTestId("mastery-generator-lab");
    // Every field the backend declares for the selected mode, by the backend's
    // own label — not a list of fields this page knows about.
    const modeField = ENTRY.fields.find(
      (f) => f.key === "module_config.mastery_mode")!;
    const select = await screen.findByLabelText(modeField.label);
    for (const option of modeField.options!) {
      expect(
        within(select as HTMLElement).getByText(option.label),
      ).toBeInTheDocument();
    }
  });

  it("shows only the subject fields the selected generator uses", async () => {
    mountLab();
    await screen.findByTestId("mastery-generator-lab");
    // The champion default: the Champion field is offered, the matchup pair
    // and the applied chain's are not. The backend independently refuses a
    // config carrying another mode's fields, so this is a display rule — but
    // offering a field that cannot be saved is still a lie to an operator.
    expect(screen.getByTestId("field-0-module_config.champion_id")).toBeInTheDocument();
    expect(screen.queryByTestId("field-0-module_config.champion_a_id")).toBeNull();
    expect(screen.queryByTestId("field-0-module_config.attacker_champion_id")).toBeNull();

    fireEvent.change(
      screen.getByLabelText(
        ENTRY.fields.find((f) => f.key === "module_config.mastery_mode")!.label),
      { target: { value: "matchup" } },
    );
    expect(screen.getByTestId("field-0-module_config.champion_a_id")).toBeInTheDocument();
    expect(screen.getByTestId("field-0-module_config.champion_b_id")).toBeInTheDocument();
    expect(screen.queryByTestId("field-0-module_config.champion_id")).toBeNull();
  });

  it("starts from the catalog's own defaults, not a champion typed here", async () => {
    mountLab();
    await screen.findByTestId("generate");
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    expect(preview.mock.calls[0][0]).toEqual(ENTRY.defaults.module_config);
    expect(preview.mock.calls[0][1]).toBe(ENTRY.defaults.challenge_count);
  });
});

// --------------------------------------------------------------- generation


describe("Generator Lab — generation", () => {
  it.each(MODES)("renders a real %s slice through the production renderer", async (mode) => {
    await generate(mode);
    const fixture = previewFor(mode);
    for (const challenge of fixture.challenges) {
      const card = screen.getByTestId(`generated-question-${challenge.challenge_index}`);
      // THE RENDERER REUSE, asserted by what it emitted: a structural
      // challenge reaches the Mastery interaction renderers, a prose one
      // reaches the arena's own question surface. Neither is a Lab component.
      const structural = challenge.interaction_kind === "atomic_recall"
        || challenge.interaction_kind === "comparison_left_right";
      if (structural) {
        expect(within(card).queryByTestId("mastery-slice-prose-challenge")).toBeNull();
      } else {
        expect(within(card).getByTestId("mastery-slice-prose-challenge")).toBeInTheDocument();
      }
      // The backend's answer, shown as the admin-only half.
      expect(
        within(card).getByTestId(`answer-${challenge.challenge_index}`),
      ).toHaveTextContent(String(challenge.correct_answer));
    }
  });

  it("renders every generated question, not a truncated sample of them", async () => {
    await generate("champion");
    const fixture = previewFor("champion");
    for (const challenge of fixture.challenges) {
      expect(
        screen.getByTestId(`generated-question-${challenge.challenge_index}`),
      ).toBeInTheDocument();
    }
  });

  it("carries the backend's own caveat with the samples", async () => {
    await generate("champion");
    expect(screen.getByText(previewFor("champion").note)).toBeInTheDocument();
  });
});

// --------------------------------------------------------------- seed


describe("Generator Lab — deterministic reproduction", () => {
  it("sends the typed seed, and regenerating with it sends the identical request", async () => {
    mountLab();
    await screen.findByTestId("seed-input");
    fireEvent.change(screen.getByTestId("seed-input"), { target: { value: "abc123" } });
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("regenerate-same-seed"));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(2));
    expect(preview.mock.calls[0]).toEqual(preview.mock.calls[1]);
    expect(preview.mock.calls[0][2]).toBe("abc123");
  });

  it("sends NO seed when none is typed, rather than an empty one", async () => {
    mountLab();
    await screen.findByTestId("generate");
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    // null, so the client omits the key entirely and the backend reproduces
    // the fixed preview it always returned.
    expect(preview.mock.calls[0][2]).toBeNull();
  });

  it("'New seed' fills a fresh seed and regenerates with it", async () => {
    mountLab();
    await screen.findByTestId("new-seed");
    fireEvent.click(screen.getByTestId("new-seed"));
    await waitFor(() => expect(preview).toHaveBeenCalled());
    const sent = preview.mock.calls[0][2];
    expect(typeof sent).toBe("string");
    expect(sent).not.toBe("");
    expect((screen.getByTestId("seed-input") as HTMLInputElement).value).toBe(sent);
  });

  it("a new seed is actually new", () => {
    // Not a test of the generator — the generator's determinism is the
    // backend's, and is proved there. This only asserts the button does not
    // hand the same string back twice, which would make it a no-op control.
    const seeds = new Set(Array.from({ length: 32 }, () => newSeed()));
    expect(seeds.size).toBe(32);
  });

  it("shows the seed and the salt the generator actually used", async () => {
    await generate("champion");
    fireEvent.click(screen.getByTestId("toggle-diagnostics"));
    const fixture = previewFor("champion");
    const panel = screen.getByTestId("generator-diagnostics");
    expect(within(panel).getByText(String(fixture.seed))).toBeInTheDocument();
    expect(within(panel).getByText(String(fixture.selection_salt))).toBeInTheDocument();
  });
});

// --------------------------------------------------------------- diagnostics


describe("Generator Lab — diagnostics and provenance", () => {
  it("is collapsed by default, so an inspection screen is not a wall of ids", async () => {
    await generate("champion");
    expect(screen.queryByTestId("artifact-details")).toBeNull();
    expect(screen.queryByTestId("raw-json")).toBeNull();
  });

  it.each(MODES)("reports the %s generator's own provenance block verbatim", async (mode) => {
    await generate(mode);
    fireEvent.click(screen.getByTestId("toggle-diagnostics"));
    const artifact = previewFor(mode).mastery_artifact!;
    const details = screen.getByTestId("artifact-details");
    for (const value of [
      artifact.generator_type, artifact.generator_version, artifact.subject_key,
      artifact.artifact_instance_id, artifact.mastery_set_id,
      artifact.artifact_digest, artifact.patch_display,
    ]) {
      expect(within(details).getByText(String(value))).toBeInTheDocument();
    }
  });

  it("offers the raw response as an explicit extra step, never by default", async () => {
    await generate("champion");
    fireEvent.click(screen.getByTestId("toggle-diagnostics"));
    expect(screen.queryByTestId("raw-json")).toBeNull();
    fireEvent.click(screen.getByTestId("toggle-raw-json"));
    expect(screen.getByTestId("raw-json")).toBeInTheDocument();
  });

  it("says 'unknown' rather than failing when a slice carries no provenance block", async () => {
    // Absent means unknown — the compatibility rule every reader of this block
    // follows. A Lab that errored here would be unable to inspect exactly the
    // historical slices someone most wants explained.
    preview.mockResolvedValue({ ...previewFor("champion"), mastery_artifact: null });
    mountLab();
    await screen.findByTestId("generate");
    fireEvent.click(screen.getByTestId("generate"));
    await screen.findByTestId("generated-slice");
    fireEvent.click(screen.getByTestId("toggle-diagnostics"));
    expect(screen.getByTestId("artifact-absent")).toBeInTheDocument();
    // …and the questions still render.
    expect(screen.getByTestId("generated-question-0")).toBeInTheDocument();
  });
});

// --------------------------------------------------------------- coverage


describe("Generator Lab — coverage", () => {
  it.each(MODES)("reports the %s subject's depth from the backend's own count", async (mode) => {
    coverage.mockResolvedValue(coverageFor(mode));
    mountLab();
    await screen.findByTestId("check-coverage");
    fireEvent.click(screen.getByTestId("check-coverage"));
    const panel = await screen.findByTestId("generator-coverage");
    const report = coverageFor(mode).coverage;
    expect(within(panel).getByTestId("coverage-total"))
      .toHaveTextContent(String(report.total_candidates));
    for (const family of report.families) {
      expect(
        within(panel).getByTestId(`coverage-atomic-family-${family.family}`),
      ).toHaveTextContent(String(family.count));
    }
    // Both sides of a matchup's universe, counted separately — the same family
    // can appear on each, and conflating them would hide that a thin pair can
    // still be long.
    for (const family of report.comparison_families) {
      expect(
        within(panel).getByTestId(`coverage-comparison-family-${family.family}`),
      ).toHaveTextContent(String(family.count));
    }
  });

  it("says an uncertified applied chain is refused, not merely empty", async () => {
    const base = coverageFor("applied_chain");
    coverage.mockResolvedValue({
      ...base,
      coverage: { ...base.coverage, certified: false },
    });
    mountLab();
    await screen.findByTestId("check-coverage");
    fireEvent.click(screen.getByTestId("check-coverage"));
    expect(await screen.findByTestId("coverage-uncertified")).toBeInTheDocument();
  });
});

// --------------------------------------------------------------- errors


describe("Generator Lab — error states", () => {
  it("shows the backend's refusal verbatim, and no samples beside it", async () => {
    preview.mockRejectedValue(new RankedFormatApiError(
      "segment mastery_slice: Matchup Mastery needs two DIFFERENT champions",
      422, "RANKED_INVALID_CONFIG_FORMAT"));
    mountLab();
    await screen.findByTestId("generate");
    fireEvent.click(screen.getByTestId("generate"));
    const error = await screen.findByTestId("preview-error");
    expect(error).toHaveTextContent("two DIFFERENT champions");
    expect(screen.queryByTestId("generated-slice")).toBeNull();
  });

  it("reports an unreachable backend as that, not as an empty generator", async () => {
    preview.mockRejectedValue(new Error("boom"));
    mountLab();
    await screen.findByTestId("generate");
    fireEvent.click(screen.getByTestId("generate"));
    expect(await screen.findByTestId("preview-error"))
      .toHaveTextContent(/could not reach the admin backend/i);
  });

  it("clears a stale sample the moment the policy changes", async () => {
    await generate("champion");
    expect(screen.getByTestId("generated-slice")).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText(
        ENTRY.fields.find((f) => f.key === "module_config.mastery_mode")!.label),
      { target: { value: "matchup" } },
    );
    // A sample describes ONE policy. Showing it beside edited settings is
    // worse than showing none.
    expect(screen.queryByTestId("generated-slice")).toBeNull();
  });

  it("says so when this deployment's catalog does not offer the module", async () => {
    catalog.mockResolvedValue({
      schema_version: "ranked.builder_catalog.v1", modules: [], cycle_note: "",
    });
    mountLab();
    expect(await screen.findByTestId("catalog-error")).toBeInTheDocument();
  });

  it("reports a catalog it cannot fetch rather than rendering empty controls", async () => {
    catalog.mockRejectedValue(new RankedFormatApiError("nope", 403, null));
    mountLab();
    expect(await screen.findByTestId("catalog-error")).toHaveTextContent("nope");
  });
});

// --------------------------------------------------------------- persistence


describe("Generator Lab — it asks for nothing that writes", () => {
  it("calls only the two read-only endpoints, and never on mount", async () => {
    mountLab();
    await screen.findByTestId("generate");
    // Loading the page generates nothing. An inspection screen that generated
    // on mount would run the real generator for whatever subject happened to
    // be the default, every time anyone opened it.
    expect(preview).not.toHaveBeenCalled();
    expect(coverage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("generate"));
    fireEvent.click(screen.getByTestId("check-coverage"));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(coverage).toHaveBeenCalledTimes(1));
  });
});
