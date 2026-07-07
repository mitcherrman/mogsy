import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { PatchRundownResponse, RundownGroup } from "@/lib/knowledge-admin/types";
import { ErrorBanner, ProviderBadge, SkeletonRow } from "./shared";

/**
 * Patch Rundown page. All rollups come from GET /patch-rundown; the
 * generated content cards are client-side templates over `groups[]`
 * (docs §6). No LLM call — the copy just captures what actually
 * happened to the DB.
 */
export default function KnowledgeRundown() {
  const [params, setParams] = useSearchParams();
  const patch = params.get("patch") ?? "";

  // Load an unfiltered rundown once to derive the patch selector list.
  const patchesQ = useQuery({
    queryKey: ["knowledge", "rundown", "all-patches"],
    queryFn: () => knowledgeApi.patchRundown({}),
  });
  const scopedQ = useQuery({
    queryKey: ["knowledge", "rundown", patch],
    queryFn: () => knowledgeApi.patchRundown(patch ? { patch_version: patch } : {}),
  });

  const availablePatches = useMemo(() => {
    const set = new Set<string>();
    (patchesQ.data?.groups ?? []).forEach((g) => g.patch_version && set.add(g.patch_version));
    return Array.from(set).sort().reverse();
  }, [patchesQ.data]);

  const data = scopedQ.data;
  const groupedByChampion = useMemo(() => groupByChampion(data?.groups ?? []), [data]);

  const generated = useMemo(() => (data ? buildGeneratedContent(data, patch) : null), [data, patch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-muted-foreground">Patch</label>
        <select
          value={patch}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            if (e.target.value) next.set("patch", e.target.value);
            else next.delete("patch");
            setParams(next, { replace: true });
          }}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All patches</option>
          {availablePatches.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {scopedQ.isFetching && <span className="text-[10px] text-muted-foreground">loading…</span>}
      </div>

      {scopedQ.error && <ErrorBanner error={scopedQ.error} onRetry={() => scopedQ.refetch()} />}
      {scopedQ.isLoading && <SkeletonRow className="h-24" />}

      {data && (
        <>
          <header className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Review counts</div>
              <div className="font-semibold">
                <span className="text-amber-300">{data.review_counts.pending} pending</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-emerald-300">{data.review_counts.applied} applied</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-red-300">{data.review_counts.rejected} rejected</span>
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Severity</div>
              <div className="font-semibold tabular-nums">
                <span className="text-red-300">{data.by_severity.major}⚡ major</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-orange-300">{data.by_severity.moderate} moderate</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">{data.by_severity.minor} minor</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className="rounded-xl border border-border bg-card p-3">
              <h2 className="text-sm font-extrabold mb-2">By champion</h2>
              <ul className="space-y-1 text-xs">
                {Object.entries(data.by_champion)
                  .sort((a, b) => b[1].pending - a[1].pending)
                  .map(([champ, counts]) => (
                    <li key={champ}>
                      <details className="rounded border border-border">
                        <summary className="cursor-pointer px-2 py-1 flex items-center gap-2">
                          <span className="font-semibold">{champ}</span>
                          <span className="text-muted-foreground">{counts.pending} pending</span>
                        </summary>
                        <ul className="border-t border-border p-2 space-y-1">
                          {(groupedByChampion[champ] ?? []).map((g, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <ProviderBadge provider={g.provider} />
                              <span>{g.ability_key} {g.property}</span>
                              <span className="text-muted-foreground">{g.rank_count} rank{g.rank_count === 1 ? "" : "s"}</span>
                              <Link
                                to={`/admin/knowledge/queue?champion=${encodeURIComponent(champ)}&property=${encodeURIComponent(g.property)}`}
                                className="ml-auto text-primary hover:underline"
                              >
                                review →
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
              </ul>
            </section>

            <section className="rounded-xl border border-border bg-card p-3 space-y-3">
              <RollupList title="By property" data={data.by_property} />
              <RollupList title="By provider" data={data.by_provider} />
            </section>
          </div>

          {generated && (
            <section className="space-y-2">
              <h2 className="text-sm font-extrabold">Generated content</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <ContentCard title="Website changelog" body={generated.changelog} />
                <ContentCard title="Discord post" body={generated.discord} />
                <ContentCard title="YouTube script outline" body={generated.youtube} />
                <ContentCard title="Quiz update notes" body={generated.quiz} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function groupByChampion(groups: RundownGroup[]): Record<string, RundownGroup[]> {
  const out: Record<string, RundownGroup[]> = {};
  for (const g of groups) {
    (out[g.entity_name] ??= []).push(g);
  }
  return out;
}

function RollupList({ title, data }: { title: string; data: Record<string, { pending: number; applied: number; rejected: number; total?: number }> }) {
  const rows = Object.entries(data).sort((a, b) => b[1].pending - a[1].pending);
  return (
    <div>
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-1">{title}</h3>
      <ul className="text-xs space-y-0.5">
        {rows.map(([k, v]) => (
          <li key={k} className="flex justify-between tabular-nums">
            <span className="text-foreground">{k}</span>
            <span className="text-muted-foreground">{v.pending}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <button
          onClick={() => {
            navigator.clipboard.writeText(body).then(() => toast.success("Copied"));
          }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Copy className="h-3 w-3" /> copy
        </button>
      </div>
      <pre className="text-[11px] font-mono bg-background/60 rounded p-2 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
{body}
      </pre>
    </div>
  );
}

function buildGeneratedContent(data: PatchRundownResponse, patch: string) {
  const label = patch || "current";
  const lines = data.groups.map((g) => `- ${g.entity_name} ${g.ability_key ?? ""} ${g.property} (${g.rank_count} rank${g.rank_count === 1 ? "" : "s"}, ${g.provider})`);
  const cooldownGroups = data.groups.filter((g) => g.property === "cooldown");
  const champCount = Object.keys(data.by_champion).length;
  const status = data.review_counts.applied > 0 && data.review_counts.pending === 0 ? "applied" : "in review";

  const changelog = `## Patch ${label} — Mogsy DB\n\n${lines.join("\n") || "_no changes_"}\n\nStatus: ${status}.`;
  const discord = `**Patch ${label} is in Mogsy!**\n${champCount} champion${champCount === 1 ? "" : "s"} touched · ${data.review_counts.applied} applied · ${data.review_counts.pending} still in review.`;
  const youtube = `1. Intro: ${champCount} champions changed in patch ${label}\n${data.groups.slice(0, 5).map((g, i) => `${i + 2}. ${g.entity_name} ${g.ability_key ?? ""} ${g.property}`).join("\n")}`;
  const quiz = `Regenerate cooldown Qs for:\n${cooldownGroups.map((g) => `- ${g.entity_name} ${g.ability_key ?? ""}`).join("\n") || "_none this patch_"}`;

  return { changelog, discord, youtube, quiz };
}