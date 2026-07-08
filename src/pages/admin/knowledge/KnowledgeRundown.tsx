import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Copy,
  TrendingUp,
  TrendingDown,
  Activity,
  Package,
  Sparkles,
  ShieldCheck,
  Users,
  ClipboardList,
  Check,
  Gauge,
  ChevronDown,
  ChevronRight,
  Swords,
  Flame,
  Heart,
  Zap as ZapIcon,
  Wind,
  Target,
  Shield,
  Beaker,
} from "lucide-react";
import { toast } from "sonner";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type {
  PatchRundownResponse,
  RundownGroup,
  AnalyticsChampion,
  AnalyticsRankingEntry,
  AnalyticsPropertyBreakdown,
  AnalyticsKnowledge,
  Severity,
} from "@/lib/knowledge-admin/types";
import { ErrorBanner, ProviderBadge, SkeletonRow, SeverityBadge } from "./shared";
import {
  MetricCard,
  RankingCard,
  PropertyBreakdownCard,
  SectionShell,
  ProgressRing,
  AwaitingBackendBanner,
  PendingBadge,
} from "./rundown/PlaceholderPrimitives";

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

  // Real analytics feed (nullable/optional at every field).
  const analyticsQ = useQuery({
    queryKey: ["knowledge", "patch-analytics", patch],
    queryFn: () =>
      knowledgeApi.patchAnalytics({
        patch_version: patch || undefined,
        include_changes: true,
      }),
    retry: false,
  });

  const availablePatches = useMemo(() => {
    const set = new Set<string>();
    (patchesQ.data?.groups ?? []).forEach((g) => g.patch_version && set.add(g.patch_version));
    return Array.from(set).sort().reverse();
  }, [patchesQ.data]);

  const data = scopedQ.data;
  const analytics = analyticsQ.data;
  const hero = analytics?.hero ?? null;
  const rankings = analytics?.rankings ?? null;
  const propertyBreakdown = analytics?.property_breakdown ?? null;
  const knowledge = analytics?.knowledge ?? null;
  const analyticsChampions = analytics?.champions ?? null;
  const groupedByChampion = useMemo(() => groupByChampion(data?.groups ?? []), [data]);
  const generated = useMemo(() => (data ? buildGeneratedContent(data, patch) : null), [data, patch]);
  const loading = scopedQ.isLoading;
  const analyticsLoading = analyticsQ.isLoading;

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
      {analyticsQ.error && (
        <ErrorBanner error={analyticsQ.error as Error} onRetry={() => analyticsQ.refetch()} />
      )}

      {/* ─── 1. HERO SUMMARY ─────────────────────────────────────────────── */}
      <SectionShell
        title="Patch Intelligence"
        subtitle="Live rollups from the knowledge database. Analytics fields marked pending will populate automatically once the backend endpoint ships."
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="Patch Version"
            value={patch || (loading ? undefined : "All patches")}
            icon={<Sparkles className="h-4 w-4" />}
            accent="info"
            loading={loading}
          />
          <MetricCard
            label="Champions Changed"
            value={hero?.champions_changed ?? undefined}
            icon={<Users className="h-4 w-4" />}
            accent="default"
            loading={analyticsLoading}
          />
          <MetricCard
            label="Values Changed"
            value={hero?.values_changed ?? undefined}
            icon={<Activity className="h-4 w-4" />}
            loading={analyticsLoading}
          />
          <MetricCard
            label="Properties Changed"
            value={hero?.properties_changed ?? undefined}
            icon={<Gauge className="h-4 w-4" />}
            loading={analyticsLoading}
          />
          <MetricCard
            label="Buffs"
            value={hero?.buff_count ?? undefined}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="positive"
            loading={analyticsLoading}
          />
          <MetricCard
            label="Nerfs"
            value={hero?.nerf_count ?? undefined}
            icon={<TrendingDown className="h-4 w-4" />}
            accent="negative"
            loading={analyticsLoading}
          />
          <MetricCard
            label="Pending Changes"
            value={hero?.pending_changes ?? data?.review_counts.pending}
            icon={<ClipboardList className="h-4 w-4" />}
            accent="warning"
            loading={analyticsLoading || loading}
          />
          <MetricCard
            label="Approved Changes"
            value={hero?.approved_changes ?? data?.review_counts.applied}
            icon={<Check className="h-4 w-4" />}
            accent="positive"
            loading={analyticsLoading || loading}
          />
          <MetricCard
            label="Champion Coverage"
            value={hero?.champion_coverage != null ? `${Math.round(hero.champion_coverage * 100)}%` : undefined}
            icon={<ShieldCheck className="h-4 w-4" />}
            accent="info"
            loading={analyticsLoading}
          />
        </div>
        {data && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Severity mix:</span>
            <SeverityBadge severity="major" /> <span className="tabular-nums">{data.by_severity.major}</span>
            <SeverityBadge severity="moderate" /> <span className="tabular-nums">{data.by_severity.moderate}</span>
            <SeverityBadge severity="minor" /> <span className="tabular-nums">{data.by_severity.minor}</span>
          </div>
        )}
      </SectionShell>

      {/* ─── 2. RANKINGS ─────────────────────────────────────────────────── */}
      <SectionShell
        title="Rankings"
        subtitle="Superlatives across the patch, served by /patch-analytics."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <RankingEntryCard label="Most Changed Champion" entry={rankings?.most_changed_champion} loading={analyticsLoading} />
          <RankingEntryCard label="Biggest Buff" entry={rankings?.biggest_buff} loading={analyticsLoading} />
          <RankingEntryCard label="Biggest Nerf" entry={rankings?.biggest_nerf} loading={analyticsLoading} />
          <RankingEntryCard label="Largest Cooldown Reduction" entry={rankings?.largest_cooldown_reduction} loading={analyticsLoading} />
          <RankingEntryCard label="Largest Mana Increase" entry={rankings?.largest_mana_increase} loading={analyticsLoading} />
          <RankingEntryCard label="Largest % Increase" entry={rankings?.largest_percentage_increase} loading={analyticsLoading} />
          <RankingEntryCard label="Largest % Decrease" entry={rankings?.largest_percentage_decrease} loading={analyticsLoading} />
        </div>
      </SectionShell>

      {/* ─── 3. PROPERTY BREAKDOWN ───────────────────────────────────────── */}
      <SectionShell
        title="Property Breakdown"
        subtitle="Per-property rollups from /patch-analytics."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PROPERTY_KEYS.map((prop) => {
            const bd = propertyBreakdown?.[prop.key];
            return (
              <PropertyBreakdownCard
                key={prop.key}
                property={prop.label}
                count={bd?.count ?? null}
                largestDelta={toText(bd?.largest_delta)}
                largestPct={toText(bd?.largest_pct)}
                topChampion={toText(bd?.top_champion)}
                loading={analyticsLoading}
              />
            );
          })}
        </div>
      </SectionShell>

      {/* ─── 4. CHAMPION INTELLIGENCE ────────────────────────────────────── */}
      <SectionShell
        title="Champion Intelligence"
        subtitle="Per-champion analytics from /patch-analytics. Expand for per-rank change list."
      >
        {(analyticsLoading || loading) && <SkeletonRow className="h-24" />}
        {analyticsChampions && analyticsChampions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...analyticsChampions]
              .sort((a, b) => (b.net_change_score ?? 0) - (a.net_change_score ?? 0))
              .map((c) => (
                <ChampionIntelCard
                  key={c.champion}
                  champion={c.champion}
                  analytics={c}
                  groups={groupedByChampion[c.champion] ?? []}
                />
              ))}
          </div>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(data.by_champion)
              .sort((a, b) => b[1].pending - a[1].pending)
              .map(([champ]) => (
                <ChampionIntelCard
                  key={champ}
                  champion={champ}
                  analytics={null}
                  groups={groupedByChampion[champ] ?? []}
                />
              ))}
            {Object.keys(data.by_champion).length === 0 && (
              <div className="text-xs text-muted-foreground italic">No champion changes in this scope.</div>
            )}
          </div>
        ) : null}
      </SectionShell>

      {/* ─── 5. KNOWLEDGE QUALITY ────────────────────────────────────────── */}
      <SectionShell
        title="Knowledge Quality"
        subtitle="Metrics served by /patch-analytics.knowledge."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {KNOWLEDGE_METRICS.map(({ key, label }) => {
            const value = knowledge?.[key];
            const has = value !== undefined && value !== null;
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-3 flex flex-col items-center gap-2">
                <ProgressRing value={has ? value : undefined} loading={analyticsLoading} />
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground text-center">
                  {label}
                </div>
                {!analyticsLoading && !has && <PendingBadge />}
              </div>
            );
          })}
        </div>
      </SectionShell>

      {/* ─── 6. GAMEPLAY IMPACT (future) ─────────────────────────────────── */}
      <SectionShell
        title="Gameplay Impact"
        subtitle="Simulated combat metrics — read-only preview of the future analytics surface."
        banner={
          <AwaitingBackendBanner>
            Available once Combat Lab simulation metrics are connected.
          </AwaitingBackendBanner>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {GAMEPLAY_METRICS.map((m) => (
            <MetricCard key={m.label} label={m.label} icon={m.icon} accent="info" />
          ))}
        </div>
      </SectionShell>

      {/* ─── Generated content (existing) ────────────────────────────────── */}
      {generated && (
        <SectionShell title="Generated Content" subtitle="Templated summaries derived from applied changes.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ContentCard title="Website changelog" body={generated.changelog} />
            <ContentCard title="Discord post" body={generated.discord} />
            <ContentCard title="YouTube script outline" body={generated.youtube} />
            <ContentCard title="Quiz update notes" body={generated.quiz} />
          </div>
        </SectionShell>
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

/** Coerce any backend value into something safe to render as a React child. */
function toText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const parts = [obj.ability_key, obj.property, obj.champion, obj.label, obj.name]
      .filter((x) => typeof x === "string" && x)
      .map(String);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(v);
    } catch {
      return null;
    }
  }
  return String(v);
}

/* ─── Property registry ──────────────────────────────────────────────── */
const PROPERTY_KEYS: { key: string; label: string }[] = [
  { key: "cooldown", label: "Cooldown" },
  { key: "mana_cost", label: "Mana Cost" },
  { key: "damage", label: "Damage" },
  { key: "range", label: "Range" },
  { key: "ratio", label: "Ratios" },
  { key: "healing", label: "Healing" },
  { key: "shield", label: "Shield" },
];

const KNOWLEDGE_METRICS: { key: keyof AnalyticsKnowledge; label: string }[] = [
  { key: "coverage", label: "Coverage" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "parser_gaps", label: "Parser Gaps" },
  { key: "consensus", label: "Consensus" },
  { key: "confidence", label: "Confidence" },
  { key: "health", label: "Health" },
];

const GAMEPLAY_METRICS: { label: string; icon: React.ReactNode }[] = [
  { label: "Combo Damage",           icon: <Swords className="h-4 w-4" /> },
  { label: "Burst Damage",           icon: <Flame className="h-4 w-4" /> },
  { label: "Sustained DPS",          icon: <Activity className="h-4 w-4" /> },
  { label: "Tankiness",              icon: <Shield className="h-4 w-4" /> },
  { label: "Damage Per Mana",        icon: <ZapIcon className="h-4 w-4" /> },
  { label: "Ability Casts / Min",    icon: <Sparkles className="h-4 w-4" /> },
  { label: "Time To Kill",           icon: <Target className="h-4 w-4" /> },
  { label: "Effective Health",       icon: <Heart className="h-4 w-4" /> },
  { label: "Lane Sustain",           icon: <Heart className="h-4 w-4" /> },
  { label: "Wave Clear",             icon: <Wind className="h-4 w-4" /> },
  { label: "Objective Damage",       icon: <Target className="h-4 w-4" /> },
  { label: "Gold Efficiency",        icon: <Beaker className="h-4 w-4" /> },
];

/** Ranking card that unpacks an AnalyticsRankingEntry. */
function RankingEntryCard({
  label,
  entry,
  loading,
}: {
  label: string;
  entry?: AnalyticsRankingEntry | null;
  loading?: boolean;
}) {
  const champion = toText(entry?.champion);
  const abilityText = toText(entry?.ability_key);
  const propertyText = toText(entry?.property);
  const detailFromEntry = toText(entry?.detail);
  const detailFallback = [abilityText, propertyText].filter(Boolean).join(" · ");
  const detail = detailFromEntry ?? (detailFallback || null);
  const value = toText(entry?.value);
  return (
    <RankingCard
      label={label}
      champion={champion}
      detail={detail}
      value={value}
      loading={loading}
    />
  );
}

/** Expandable champion card. Consumes AnalyticsChampion when available. */
function ChampionIntelCard({
  champion,
  analytics,
  groups,
}: {
  champion: string;
  analytics: AnalyticsChampion | null;
  groups: RundownGroup[];
}) {
  const [open, setOpen] = useState(false);
  const valuesChanged = analytics?.values_changed ?? null;
  const propertiesChanged = analytics?.properties_changed ?? null;
  const buffs = analytics?.buff_count ?? null;
  const nerfs = analytics?.nerf_count ?? null;
  const maxSeverity: Severity | null = analytics?.max_severity ?? null;
  const net = analytics?.net_change_score ?? null;
  const changes = analytics?.changes ?? null;
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/20 transition"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm truncate">{champion}</div>
          <div className="text-[11px] text-muted-foreground tabular-nums flex flex-wrap gap-x-2">
            {valuesChanged != null && <span>{valuesChanged} values</span>}
            {propertiesChanged != null && <span>· {propertiesChanged} props</span>}
            {buffs != null && <span className="text-emerald-300">· {buffs} buff{buffs === 1 ? "" : "s"}</span>}
            {nerfs != null && <span className="text-red-300">· {nerfs} nerf{nerfs === 1 ? "" : "s"}</span>}
            {valuesChanged == null && propertiesChanged == null && buffs == null && nerfs == null && (
              <span className="italic text-muted-foreground/60">awaiting analytics</span>
            )}
          </div>
        </div>
        {maxSeverity ? <SeverityBadge severity={maxSeverity} /> : <PendingBadge />}
        {net != null && (
          <div className="text-xs font-black tabular-nums text-primary ml-2">
            {net > 0 ? "+" : ""}{Math.round(net * 100) / 100}
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-border p-3 space-y-3 animate-fade-in">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1">
              Property groups
            </div>
            <ul className="space-y-1 text-xs">
              {groups.map((g, i) => (
                <li key={i} className="flex items-center gap-2">
                  <ProviderBadge provider={g.provider} />
                  <span>{toText(g.ability_key)} {toText(g.property)}</span>
                  <span className="text-muted-foreground">
                    {g.rank_count} rank{g.rank_count === 1 ? "" : "s"}
                  </span>
                  <Link
                    to={`/admin/knowledge/queue?champion=${encodeURIComponent(champion)}&property=${encodeURIComponent(toText(g.property) ?? "")}`}
                    className="ml-auto text-primary hover:underline"
                  >
                    review →
                  </Link>
                </li>
              ))}
              {groups.length === 0 && (
                <li className="text-muted-foreground italic">No pending groups.</li>
              )}
            </ul>
          </div>
          {changes && changes.length > 0 ? (
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground mb-1">
                Per-rank changes
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="pr-2 font-bold">Rank</th>
                      <th className="pr-2 font-bold">Ability</th>
                      <th className="pr-2 font-bold">Property</th>
                      <th className="pr-2 font-bold">Old</th>
                      <th className="pr-2 font-bold">New</th>
                      <th className="pr-2 font-bold">Δ</th>
                      <th className="pr-2 font-bold">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c, i) => {
                      const delta = c.delta ?? null;
                      const tone = delta == null ? "" : delta > 0 ? "text-emerald-300" : delta < 0 ? "text-red-300" : "";
                      return (
                        <tr key={i} className="border-t border-border/40">
                          <td className="pr-2">{toText(c.rank) ?? "—"}</td>
                          <td className="pr-2">{toText(c.ability_key) ?? "—"}</td>
                          <td className="pr-2">{toText(c.property) ?? "—"}</td>
                          <td className="pr-2">{toText(c.old_value) ?? "—"}</td>
                          <td className="pr-2">{toText(c.new_value) ?? "—"}</td>
                          <td className={`pr-2 ${tone}`}>{delta != null ? (delta > 0 ? `+${delta}` : delta) : "—"}</td>
                          <td className={`pr-2 ${tone}`}>
                            {c.delta_pct != null ? `${c.delta_pct > 0 ? "+" : ""}${Math.round(c.delta_pct * 10) / 10}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded bg-background/40 px-2 py-1.5 flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Per-rank change list
              </div>
              <PendingBadge />
            </div>
          )}
        </div>
      )}
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