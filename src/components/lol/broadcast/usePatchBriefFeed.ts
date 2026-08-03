import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchPatchReport, fetchPatchReports } from "@/lib/patch-reports/api";
import { projectPatchBrief, type PatchBrief } from "@/lib/patch-reports/patch-brief";
import { useChampionAssets } from "@/hooks/useChampionAssets";
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
export function usePatchBriefFeed(): BroadcastFeed {
  const listQuery = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
  const latestVersion = listQuery.data?.patches?.[0]?.patch_version ?? null;

  const detailQuery = useQuery({
    queryKey: ["patch-report", latestVersion],
    queryFn: () => fetchPatchReport(latestVersion as string),
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
    summary: brief.descriptor,
    primaryAction: { label: "Read full report", to: brief.fullReportHref },
    brief,
  };
}
