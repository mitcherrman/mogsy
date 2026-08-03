/**
 * Patch Brief feed provider — latest-patch authority and feed-state mapping.
 *
 * Pinned here: "latest" is patches[0] exactly like the Patch Reports page's
 * default selection; a genuine in-flight load is the only loading state; and
 * every failure or empty outcome (list error, no patches, detail error, no
 * projectable brief) quietly falls back to the neutral placeholder
 * transmission — never an error surface inside the book.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChampionManifest } from "@/hooks/useChampionAssets";
import type { PatchReportDetail } from "@/lib/patch-reports/api";
import { PLACEHOLDER_TRANSMISSION } from "./broadcast-content";
import { usePatchBriefFeed } from "./usePatchBriefFeed";

const mocks = vi.hoisted(() => ({
  fetchPatchReports: vi.fn(),
  fetchPatchReport: vi.fn(),
  manifest: null as ChampionManifest | null,
  manifestLoading: false,
}));

vi.mock("@/lib/patch-reports/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/patch-reports/api")>();
  return {
    ...actual,
    fetchPatchReports: mocks.fetchPatchReports,
    fetchPatchReport: mocks.fetchPatchReport,
  };
});

vi.mock("@/hooks/useChampionAssets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useChampionAssets")>();
  return {
    ...actual,
    useChampionAssets: () => ({ data: mocks.manifest, isLoading: mocks.manifestLoading }),
  };
});

const NAMES = ["Ryze", "Ahri", "Corki", "Zed"];

const detailFixture = (version: string): PatchReportDetail => ({
  patch_version: version,
  source_url: "https://example.com/notes",
  built_at: "2026-07-30T00:00:00Z",
  section_titles: ["Champions"],
  skipped_sections: [],
  cards: NAMES.map((name, i) => ({
    id: i + 1,
    entity_type: "champion",
    entity_name: name,
    entity_slug: null,
    section_id: "champions",
    section_title: "Champions",
    official_image_url: null,
    mogzy_image_path: null,
    mogzy_entity_ref: name,
    context_text: null,
    aggregate_status: "matches",
    changes: [
      {
        group_title: "Base Stats",
        ability_slot: null,
        ability_icon_url: null,
        property_name: "Base attack damage",
        change_kind: "numeric",
        is_new: false,
        before_raw: "58",
        after_raw: "61",
        detail_text: null,
        mogzy_property: null,
        mogzy_current_raw: null,
        mogzy_status: "matches",
        proposal_id: null,
        proposal_status: null,
      },
    ],
  })),
});

const manifestFixture: ChampionManifest = {
  champions: Object.fromEntries(
    NAMES.map((n) => [
      n,
      {
        icon: `assets/champions/${n}/icon.png`,
        splash: `assets/champions/${n}/splash.jpg`,
        loading: `assets/champions/${n}/loading.jpg`,
        cutout: `assets/champions/${n}/cutout.png`,
      },
    ]),
  ),
};

const renderFeed = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => usePatchBriefFeed(), {
    wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
};

const expectPlaceholder = (feed: ReturnType<typeof usePatchBriefFeed>) => {
  expect(feed).toMatchObject({
    status: "ready",
    transmissions: [PLACEHOLDER_TRANSMISSION],
    index: 0,
  });
};

beforeEach(() => {
  mocks.fetchPatchReports.mockReset();
  mocks.fetchPatchReport.mockReset();
  mocks.manifest = manifestFixture;
  mocks.manifestLoading = false;
});

describe("usePatchBriefFeed", () => {
  it("selects patches[0] as the latest patch and emits a ready Patch Brief", async () => {
    mocks.fetchPatchReports.mockResolvedValue({
      patches: [{ patch_version: "25.14" }, { patch_version: "25.13" }],
    });
    mocks.fetchPatchReport.mockImplementation(async (v: string) => detailFixture(v));

    const { result } = renderFeed();
    expect(result.current.status).toBe("loading");

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      if (result.current.status !== "ready") return;
      expect(result.current.transmissions[0].brief).toBeTruthy();
    });
    expect(mocks.fetchPatchReport).toHaveBeenCalledWith("25.14");
    expect(mocks.fetchPatchReport).not.toHaveBeenCalledWith("25.13");

    if (result.current.status !== "ready") throw new Error("unreachable");
    const t = result.current.transmissions[0];
    expect(t.eyebrow).toBe("Patch Brief");
    expect(t.headline).toBe("Patch 25.14");
    expect(t.primaryAction).toEqual({
      label: "Read full report",
      to: "/lol/patch-reports?patch=25.14",
    });
    expect(t.brief?.changes).toHaveLength(4);
  });

  it("falls back to the neutral placeholder when the patch list fails", async () => {
    mocks.fetchPatchReports.mockRejectedValue(new Error("down"));
    const { result } = renderFeed();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expectPlaceholder(result.current);
  });

  it("falls back to the neutral placeholder when no patches exist", async () => {
    mocks.fetchPatchReports.mockResolvedValue({ patches: [] });
    const { result } = renderFeed();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expectPlaceholder(result.current);
    expect(mocks.fetchPatchReport).not.toHaveBeenCalled();
  });

  it("falls back to the neutral placeholder when the detail fetch fails", async () => {
    mocks.fetchPatchReports.mockResolvedValue({ patches: [{ patch_version: "25.14" }] });
    mocks.fetchPatchReport.mockRejectedValue(new Error("down"));
    const { result } = renderFeed();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expectPlaceholder(result.current);
  });

  it("falls back to the neutral placeholder when no brief can be projected (no icons)", async () => {
    mocks.manifest = null;
    mocks.fetchPatchReports.mockResolvedValue({ patches: [{ patch_version: "25.14" }] });
    mocks.fetchPatchReport.mockImplementation(async (v: string) => detailFixture(v));
    const { result } = renderFeed();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expectPlaceholder(result.current);
  });
});
