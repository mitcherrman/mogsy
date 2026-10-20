import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { fetchPatchReport, fetchPatchReports } from "@/lib/patch-reports/api";
import { projectPatchBrief, type PatchBrief } from "@/lib/patch-reports/patch-brief";
import { useChampionAssets, type ChampionManifest } from "@/hooks/useChampionAssets";
import {
  INITIAL_BROADCAST_FEED,
  type BroadcastFeed,
  type BroadcastTransmission,
} from "./broadcast-content";

/**
 * Academy Broadcast content provider: the latest Patch Reports build projected
 * into one Patch Brief transmission.
 *
 * Reuses the exact existing authorities — the Patch Reports queries share the
 * page's query keys (["patch-reports"] / ["patch-report", version], cache
 * included), "latest" is patches[0] exactly as the page's default selection,
 * and champion icons come from the League Docs asset manifest. No second
 * store, no new endpoints.
 *
 * Fallback contract: only a genuine in-flight load shows the loading page;
 * every failure or empty outcome (source down, no patches, no eligible
 * gameplay changes, too few resolvable icons) quietly returns the neutral
 * placeholder transmission — never an error screen inside the book.
 */
/** The Patch Reports list, under the page's own key (shared cache). */
export const patchReportsQuery = { queryKey: ["patch-reports"] as const, queryFn: fetchPatchReports };
/** One Patch Report, under the page's own key (shared cache). */
export function patchReportQuery(version: string) {
  return { queryKey: ["patch-report", version] as const, queryFn: () => fetchPatchReport(version) };
}

/**
 * ACADEMY STARTUP S2 — the same feed, fetched before the page mounts.
 *
 * The Academy's Patch Report book used to start its list -> detail chain only
 * when the Orrery mounted, and it was the last first-screen element to arrive
 * in every measured desktop run ("Receiving transmission..." meanwhile). The
 * Core's warm calls this during the Landing's hold: it fills the exact query
 * entries `usePatchBriefFeed` reads (default staleTime 60 s, so the mounted
 * hook does not refetch), and returns the projected brief so the caller can
 * warm its icons. Never rejects; `null` means "no brief" (the hook then shows
 * its usual placeholder).
 */
export async function prefetchPatchBrief(
  client: QueryClient,
  manifest: Promise<ChampionManifest | null>,
): Promise<PatchBrief | null> {
  try {
    const list = await client.fetchQuery(patchReportsQuery);
    const latest = list?.patches?.[0]?.patch_version ?? null;
    if (!latest) return null;
    const [detail, m] = await Promise.all([client.fetchQuery(patchReportQuery(latest)), manifest]);
    return detail ? projectPatchBrief(detail, m) : null;
  } catch {
    return null;
  }
}

/** Every icon the brief draws (the book renders all of its entries). */
export function patchBriefIconUrls(brief: PatchBrief | null): string[] {
  return brief ? brief.sections.flatMap((s) => s.entries.map((e) => e.iconUrl)) : [];
}

export function usePatchBriefFeed(): BroadcastFeed {
  const listQuery = useQuery(patchReportsQuery);
  const latestVersion = listQuery.data?.patches?.[0]?.patch_version ?? null;

  const detailQuery = useQuery({
    ...patchReportQuery(latestVersion as string),
    enabled: Boolean(latestVersion),
  });

  const { data: manifest, isLoading: manifestLoading } = useChampionAssets();

  return useMemo<BroadcastFeed>(() => {
    if (listQuery.isLoading) return { status: "loading" };
    if (listQuery.isError || !latestVersion) return INITIAL_BROADCAST_FEED;
    if (detailQuery.isLoading || manifestLoading) return { status: "loading" };
    if (detailQuery.isError || !detailQuery.data) return INITIAL_BROADCAST_FEED;

    const brief = projectPatchBrief(detailQuery.data, manifest);
    if (!brief) return INITIAL_BROADCAST_FEED;

    return { status: "ready", transmissions: [briefTransmission(brief)], index: 0 };
  }, [
    listQuery.isLoading,
    listQuery.isError,
    latestVersion,
    detailQuery.isLoading,
    detailQuery.isError,
    detailQuery.data,
    manifestLoading,
    manifest,
  ]);
}

/** The Patch Brief dressed as a broadcast transmission for the book surface. */
export function briefTransmission(brief: PatchBrief): BroadcastTransmission {
  return {
    id: `patch-brief-${brief.patchVersion}`,
    channel: "patch-brief",
    eyebrow: "Patch Brief",
    headline: brief.patchLabel,
    // Icon-only editorial: the sections say everything, no summary copy.
    primaryAction: { label: "Read full report", to: brief.fullReportHref },
    brief,
  };
}
