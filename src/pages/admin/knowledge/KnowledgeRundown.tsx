import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Activity,
  Beaker,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Flame,
  Gauge,
  Heart,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wind,
  Zap as ZapIcon,
} from "lucide-react";
import { toast } from "sonner";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type {
  AnalyticsKnowledge,
  AnalyticsRankingEntry,
  PatchAnalyticsResponse,
  PatchRundownResponse,
  RundownGroup,
  Severity,
  PatchIntelligenceResponse,
  GameplayImpactResponse,
  GameplayImpactMetric,
  GameplayImpactChampion,
} from "@/lib/knowledge-admin/types";
import { ErrorBanner, ProviderBadge, SkeletonRow, SeverityBadge } from "./shared";
import {
  AwaitingBackendBanner,
  MetricCard,
  PendingBadge,
  ProgressRing,
  PropertyBreakdownCard,
  RankingCard,
  SectionShell,
  PatchScoreHero,
  ExecutiveSummaryCard,
  InterestingFactCard,
  InsightCard,
  HeadlineCard,
  GameplayImpactSummaryCards,
  GameplayMetricsTable,
  GameplayChampionImpactCard,
  AssumptionsPanel,
} from "./rundown/PlaceholderPrimitives";
import type { GameplayDetailFields } from "./rundown/PlaceholderPrimitives";

type MetricValue = string | number | null;
type RecordLike = Record<string, unknown>;

interface SafeChampionChange {
  rank: MetricValue;
  ability: string | null;
  property: string | null;
  oldValue: MetricValue;
  newValue: MetricValue;
  delta: number | null;
  deltaPct: number | null;
}

interface SafeChampionAnalytics {
  champion: string;
  valuesChanged: MetricValue;
  propertiesChanged: MetricValue;
  buffs: MetricValue;
  nerfs: MetricValue;
  maxSeverity: Severity | null;
  netChangeScore: number | null;
  changes: SafeChampionChange[];
}

interface RankingDefinition {
  key: string;
  label: string;
}

interface PropertyDefinition {
  key: string;
  label: string;
}

interface KnowledgeMetricDefinition {
  key: keyof AnalyticsKnowledge;
  label: string;
}

interface GameplayMetricDefinition {
  label: string;
  icon: ReactNode;
}

const RANKING_DEFINITIONS: RankingDefinition[] = [
  { key: "most_changed_champion", label: "Most Changed Champion" },
  { key: "biggest_buff", label: "Biggest Buff" },
  { key: "biggest_nerf", label: "Biggest Nerf" },
  { key: "largest_cooldown_reduction", label: "Largest Cooldown Reduction" },
  { key: "largest_mana_increase", label: "Largest Mana Increase" },
  { key: "largest_percentage_increase", label: "Largest % Increase" },
  { key: "largest_percentage_decrease", label: "Largest % Decrease" },
];

const PROPERTY_KEYS: PropertyDefinition[] = [
  { key: "cooldown", label: "Cooldown" },
  { key: "mana_cost", label: "Mana Cost" },
  { key: "damage", label: "Damage" },
  { key: "range", label: "Range" },
  { key: "ratio", label: "Ratios" },
  { key: "healing", label: "Healing" },
  { key: "shield", label: "Shield" },
];

const KNOWLEDGE_METRICS: KnowledgeMetricDefinition[] = [
  { key: "coverage", label: "Coverage" },
  { key: "approved", label: "Approved" },
  { key: "pending", label: "Pending" },
  { key: "parser_gaps", label: "Parser Gaps" },
  { key: "consensus", label: "Consensus" },
  { key: "confidence", label: "Confidence" },
  { key: "health", label: "Health" },
];

const GAMEPLAY_METRICS: GameplayMetricDefinition[] = [
  { label: "Combo Damage", icon: <Swords className="h-4 w-4" /> },
  { label: "Burst Damage", icon: <Flame className="h-4 w-4" /> },
  { label: "Sustained DPS", icon: <Activity className="h-4 w-4" /> },
  { label: "Tankiness", icon: <Shield className="h-4 w-4" /> },
  { label: "Damage Per Mana", icon: <ZapIcon className="h-4 w-4" /> },
  { label: "Ability Casts / Min", icon: <Sparkles className="h-4 w-4" /> },
  { label: "Time To Kill", icon: <Target className="h-4 w-4" /> },
  { label: "Effective Health", icon: <Heart className="h-4 w-4" /> },
  { label: "Lane Sustain", icon: <Heart className="h-4 w-4" /> },
  { label: "Wave Clear", icon: <Wind className="h-4 w-4" /> },
  { label: "Objective Damage", icon: <Target className="h-4 w-4" /> },
  { label: "Gold Efficiency", icon: <Beaker className="h-4 w-4" /> },
];

export default function KnowledgeRundown() {
  const [params, setParams] = useSearchParams();
  const patch = params.get("patch") ?? "";

  const patchesQuery = useQuery({
    queryKey: ["knowledge", "rundown", "all-patches"],
    queryFn: () => knowledgeApi.patchRundown({}),
  });

  const rundownQuery = useQuery({
    queryKey: ["knowledge", "rundown", patch],
    queryFn: () => knowledgeApi.patchRundown(patch ? { patch_version: patch } : {}),
  });

  const analyticsQuery = useQuery({
    queryKey: ["knowledge", "patch-analytics", patch],
    queryFn: () =>
      knowledgeApi.patchAnalytics({
        patch_version: patch || undefined,
        include_changes: true,
      }),
    retry: false,
  });

  const intelligenceQuery = useQuery({
    queryKey: ["knowledge", "patch-intelligence", patch],
    queryFn: () =>
      knowledgeApi.patchIntelligence(patch ? { patch_version: patch } : {}),
    retry: false,
  });

  const gameplayQuery = useQuery({
    queryKey: ["knowledge", "gameplay-impact", patch],
    queryFn: () =>
      knowledgeApi.gameplayImpact(patch ? { patch_version: patch } : {}),
    retry: false,
  });

  const rundown = normalizeRundown(rundownQuery.data);
  const analytics = normalizeAnalytics(analyticsQuery.data);
  const analyticsLoading = analyticsQuery.isLoading;
  const rundownLoading = rundownQuery.isLoading;

  const availablePatches = useMemo(() => {
    const patches = new Set<string>();
    for (const group of patchesQuery.data?.groups ?? []) {
      if (typeof group.patch_version === "string" && group.patch_version) {
        patches.add(group.patch_version);
      }
    }
    return Array.from(patches).sort().reverse();
  }, [patchesQuery.data]);

  const groupedByChampion = useMemo(
    () => groupByChampion(rundown?.groups ?? []),
    [rundown?.groups],
  );

  const fallbackChampionNames = useMemo(() => {
    const names = Object.keys(rundown?.by_champion ?? {});
    return names.sort((a, b) => a.localeCompare(b));
  }, [rundown?.by_champion]);

  const generatedContent = useMemo(
    () => (rundown ? buildGeneratedContent(rundown, patch) : null),
    [rundown, patch],
  );

  const analyticsUnavailable = analyticsQuery.isError || !analytics;
  const hero = analytics?.hero ?? null;
  const rankings = analytics?.rankings ?? null;
  const propertyBreakdown = analytics?.propertyBreakdown ?? null;
  const knowledge = analytics?.knowledge ?? null;
  const champions = analytics?.champions ?? [];

  const intelligence = isRecord(intelligenceQuery.data) ? intelligenceQuery.data as PatchIntelligenceResponse : null;
  const intelligenceLoading = intelligenceQuery.isLoading;
  const intelligenceUnavailable = intelligenceQuery.isError || !intelligence;
  const patchScore = getRecord(intelligence, "patch_score");
  const execSummary = getRecord(intelligence, "executive_summary_input");
  const interestingFacts = Array.isArray(intelligence?.interesting_facts)
    ? (intelligence!.interesting_facts as unknown[]).filter(isRecord)
    : [];
  const insights = Array.isArray(intelligence?.insights)
    ? (intelligence!.insights as unknown[]).filter(isRecord)
    : [];
  const headlines = Array.isArray(intelligence?.headline_suggestions)
    ? (intelligence!.headline_suggestions as unknown[]).filter(isRecord)
    : [];

  const execItems = [
    { label: "Primary Theme", value: toText(execSummary?.primary_theme), tone: "info" as const },
    { label: "Secondary Theme", value: toText(execSummary?.secondary_theme), tone: "info" as const },
    { label: "Patch Classification", value: toText(execSummary?.patch_classification) },
    { label: "Largest Buff", value: toText(execSummary?.largest_buff), tone: "positive" as const },
    { label: "Largest Nerf", value: toText(execSummary?.largest_nerf), tone: "negative" as const },
    { label: "Champions Changed", value: toMetricValue(execSummary?.champions_changed) },
    { label: "Values Changed", value: toMetricValue(execSummary?.values_changed) },
    { label: "Buff Count", value: toMetricValue(execSummary?.buff_count), tone: "positive" as const },
    { label: "Nerf Count", value: toMetricValue(execSummary?.nerf_count), tone: "negative" as const },
  ];

  const copyHeadline = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Headline copied"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Patch</label>
        <select
          value={patch}
          onChange={(event) => {
            const nextParams = new URLSearchParams(params);
            if (event.target.value) {
              nextParams.set("patch", event.target.value);
            } else {
              nextParams.delete("patch");
            }
            setParams(nextParams, { replace: true });
          }}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All patches</option>
          {availablePatches.map((availablePatch) => (
            <option key={availablePatch} value={availablePatch}>
              {availablePatch}
            </option>
          ))}
        </select>
        {rundownQuery.isFetching && (
          <span className="text-[10px] text-muted-foreground">loading…</span>
        )}
      </div>

      {rundownQuery.error && (
        <ErrorBanner error={rundownQuery.error} onRetry={() => rundownQuery.refetch()} />
      )}

      <SectionShell
        title="Patch Score"
        subtitle="Deterministic patch impact score derived server-side by /patch-intelligence."
        banner={
          intelligenceUnavailable && !intelligenceLoading ? (
            <AwaitingBackendBanner>
              Patch Intelligence unavailable; continuing with Patch Analytics + Rundown data.
            </AwaitingBackendBanner>
          ) : undefined
        }
      >
        <PatchScoreHero
          score={safeNumber(patchScore?.score)}
          classification={toText(patchScore?.classification)}
          explanation={toText(patchScore?.explanation)}
          loading={intelligenceLoading}
        />
      </SectionShell>

      <SectionShell
        title="Patch Intelligence"
        subtitle="Patch Rundown remains powered by /patch-rundown; /patch-analytics enhances fields when available."
        banner={
          analyticsUnavailable && !analyticsLoading ? (
            <AwaitingBackendBanner>
              Patch analytics unavailable; rendering the stable Patch Rundown data.
            </AwaitingBackendBanner>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            label="Patch Version"
            value={patch || (rundownLoading ? undefined : "All patches")}
            icon={<Sparkles className="h-4 w-4" />}
            accent="info"
            loading={rundownLoading}
          />
          <MetricCard
            label="Champions Changed"
            value={toMetricValue(hero?.champions_changed) ?? fallbackCount(rundown?.by_champion)}
            icon={<Users className="h-4 w-4" />}
            loading={analyticsLoading && rundownLoading}
          />
          <MetricCard
            label="Values Changed"
            value={toMetricValue(hero?.values_changed)}
            icon={<Activity className="h-4 w-4" />}
            loading={analyticsLoading}
          />
          <MetricCard
            label="Properties Changed"
            value={toMetricValue(hero?.properties_changed) ?? fallbackCount(rundown?.by_property)}
            icon={<Gauge className="h-4 w-4" />}
            loading={analyticsLoading && rundownLoading}
          />
          <MetricCard
            label="Buffs"
            value={toMetricValue(hero?.buff_count)}
            icon={<TrendingUp className="h-4 w-4" />}
            accent="positive"
            loading={analyticsLoading}
          />
          <MetricCard
            label="Nerfs"
            value={toMetricValue(hero?.nerf_count)}
            icon={<TrendingDown className="h-4 w-4" />}
            accent="negative"
            loading={analyticsLoading}
          />
          <MetricCard
            label="Pending Changes"
            value={toMetricValue(hero?.pending_changes) ?? toMetricValue(rundown?.review_counts.pending)}
            icon={<ClipboardList className="h-4 w-4" />}
            accent="warning"
            loading={analyticsLoading && rundownLoading}
          />
          <MetricCard
            label="Approved Changes"
            value={toMetricValue(hero?.approved_changes) ?? toMetricValue(rundown?.review_counts.applied)}
            icon={<Check className="h-4 w-4" />}
            accent="positive"
            loading={analyticsLoading && rundownLoading}
          />
          <MetricCard
            label="Champion Coverage"
            value={formatPercent(hero?.champion_coverage)}
            icon={<ShieldCheck className="h-4 w-4" />}
            accent="info"
            loading={analyticsLoading}
          />
        </div>

        {rundown && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>Severity mix:</span>
            <SeverityBadge severity="major" />
            <span className="tabular-nums">{safeNumber(rundown.by_severity.major) ?? 0}</span>
            <SeverityBadge severity="moderate" />
            <span className="tabular-nums">{safeNumber(rundown.by_severity.moderate) ?? 0}</span>
            <SeverityBadge severity="minor" />
            <span className="tabular-nums">{safeNumber(rundown.by_severity.minor) ?? 0}</span>
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Executive Summary"
        subtitle="Structured summary from /patch-intelligence — dashboard cards, never AI prose."
      >
        <ExecutiveSummaryCard items={execItems} loading={intelligenceLoading} />
      </SectionShell>

      <SectionShell
        title="Interesting Facts"
        subtitle="Backend-flagged 'did you know?' insights with per-fact confidence and evidence."
      >
        {intelligenceLoading ? (
          <SkeletonRow className="h-20" />
        ) : interestingFacts.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">No interesting facts surfaced for this patch.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {interestingFacts.map((fact, index) => (
              <InterestingFactCard
                key={`fact-${index}`}
                headline={toText(fact.headline)}
                confidence={safeNumber(fact.confidence)}
                evidence={fact.evidence}
              />
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Patch Intelligence"
        subtitle="Every insight the backend produced — available or unavailable — rendered verbatim."
      >
        {intelligenceLoading ? (
          <SkeletonRow className="h-20" />
        ) : insights.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">No insights produced for this patch.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.map((insight, index) => (
              <InsightCard
                key={`insight-${index}`}
                title={toText(insight.title)}
                kind={toText(insight.kind)}
                description={toText(insight.description)}
                available={typeof insight.available === "boolean" ? insight.available : null}
                availability={toText(insight.availability)}
                unavailableReason={toText(insight.unavailable_reason)}
                evidence={insight.evidence}
              />
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Headline Suggestions"
        subtitle="Ready-to-copy headlines for YouTube, Discord, Twitter and future distribution."
      >
        {intelligenceLoading ? (
          <SkeletonRow className="h-16" />
        ) : headlines.length === 0 ? (
          <div className="text-xs italic text-muted-foreground">No headline suggestions yet for this patch.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {headlines.map((headline, index) => (
              <HeadlineCard
                key={`headline-${index}`}
                headline={toText(headline.headline)}
                kind={toText(headline.kind)}
                onCopy={copyHeadline}
              />
            ))}
          </div>
        )}
      </SectionShell>

      <SectionShell title="Rankings" subtitle="Superlatives from /patch-analytics when the backend provides them.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RANKING_DEFINITIONS.map((definition) => (
            <RankingEntryCard
              key={definition.key}
              label={definition.label}
              entry={getRecord(rankings, definition.key)}
              loading={analyticsLoading}
            />
          ))}
        </div>
      </SectionShell>

      <SectionShell title="Property Breakdown" subtitle="Analytics breakdowns enhance stable /patch-rundown property counts.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROPERTY_KEYS.map((propertyDefinition) => {
            const analyticsProperty = getRecord(propertyBreakdown, propertyDefinition.key);
            const rundownProperty = rundown?.by_property[propertyDefinition.key];
            return (
              <PropertyBreakdownCard
                key={propertyDefinition.key}
                property={propertyDefinition.label}
                count={safeNumber(analyticsProperty?.count) ?? safeNumber(rundownProperty?.total)}
                largestDelta={toText(analyticsProperty?.largest_delta)}
                largestPct={toText(analyticsProperty?.largest_pct)}
                topChampion={toText(analyticsProperty?.top_champion)}
                loading={analyticsLoading && rundownLoading}
              />
            );
          })}
        </div>
      </SectionShell>

      <SectionShell title="Champion Intelligence" subtitle="Champion analytics are optional; patch-rundown groups remain the fallback.">
        {(analyticsLoading || rundownLoading) && <SkeletonRow className="h-24" />}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {champions.length > 0
            ? champions.map((championAnalytics) => (
                <ChampionIntelCard
                  key={championAnalytics.champion}
                  champion={championAnalytics.champion}
                  analytics={championAnalytics}
                  groups={groupedByChampion[championAnalytics.champion] ?? []}
                />
              ))
            : fallbackChampionNames.map((championName) => (
                <ChampionIntelCard
                  key={championName}
                  champion={championName}
                  analytics={null}
                  groups={groupedByChampion[championName] ?? []}
                />
              ))}
          {!rundownLoading && champions.length === 0 && fallbackChampionNames.length === 0 && (
            <div className="text-xs italic text-muted-foreground">No champion changes in this scope.</div>
          )}
        </div>
      </SectionShell>

      <SectionShell title="Knowledge Quality" subtitle="Quality metrics render only when /patch-analytics provides them.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {KNOWLEDGE_METRICS.map((metric) => {
            const value = safeNumber(knowledge?.[metric.key]);
            return (
              <div key={metric.key} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3">
                <ProgressRing value={value} loading={analyticsLoading} />
                <div className="text-center text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                  {metric.label}
                </div>
                {!analyticsLoading && value == null && <PendingBadge />}
              </div>
            );
          })}
        </div>
      </SectionShell>

      <SectionShell
        title="Gameplay Impact"
        subtitle="Simulated combat metrics — read-only preview of the future analytics surface."
        banner={<AwaitingBackendBanner>Available once Combat Lab simulation metrics are connected.</AwaitingBackendBanner>}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GAMEPLAY_METRICS.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} icon={metric.icon} accent="info" />
          ))}
        </div>
      </SectionShell>

      {generatedContent && (
        <SectionShell title="Generated Content" subtitle="Templated summaries derived from applied changes.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ContentCard title="Website changelog" body={generatedContent.changelog} />
            <ContentCard title="Discord post" body={generatedContent.discord} />
            <ContentCard title="YouTube script outline" body={generatedContent.youtube} />
            <ContentCard title="Quiz update notes" body={generatedContent.quiz} />
          </div>
        </SectionShell>
      )}
    </div>
  );
}

function RankingEntryCard({
  label,
  entry,
  loading,
}: {
  label: string;
  entry?: unknown;
  loading?: boolean;
}) {
  const entryRecord = isRecord(entry) ? entry : null;
  const champion = toText(entryRecord?.champion);
  const ability = toText(entryRecord?.ability_key);
  const property = toText(entryRecord?.property);
  const detail = toText(entryRecord?.detail) ?? ([ability, property].filter(Boolean).join(" · ") || null);
  const value = toText(entryRecord?.value);

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

function ChampionIntelCard({
  champion,
  analytics,
  groups,
}: {
  champion: string;
  analytics: SafeChampionAnalytics | null;
  groups: RundownGroup[];
}) {
  const [open, setOpen] = useState(false);
  const valuesChanged = analytics?.valuesChanged ?? null;
  const propertiesChanged = analytics?.propertiesChanged ?? null;
  const buffs = analytics?.buffs ?? null;
  const nerfs = analytics?.nerfs ?? null;
  const netChangeScore = analytics?.netChangeScore ?? null;
  const changes = analytics?.changes ?? [];
  const hasSummary = valuesChanged != null || propertiesChanged != null || buffs != null || nerfs != null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-muted/20"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold">{champion}</div>
          <div className="flex flex-wrap gap-x-2 text-[11px] tabular-nums text-muted-foreground">
            {valuesChanged != null && <span>{valuesChanged} values</span>}
            {propertiesChanged != null && <span>· {propertiesChanged} props</span>}
            {buffs != null && <span className="text-emerald-300">· {buffs} buff{buffs === 1 ? "" : "s"}</span>}
            {nerfs != null && <span className="text-red-300">· {nerfs} nerf{nerfs === 1 ? "" : "s"}</span>}
            {!hasSummary && <span className="italic text-muted-foreground/60">awaiting analytics</span>}
          </div>
        </div>
        {analytics?.maxSeverity ? <SeverityBadge severity={analytics.maxSeverity} /> : <PendingBadge />}
        {netChangeScore != null && (
          <div className="ml-2 text-xs font-black tabular-nums text-primary">
            {netChangeScore > 0 ? "+" : ""}{formatNumber(netChangeScore)}
          </div>
        )}
      </button>

      {open && (
        <div className="animate-fade-in space-y-3 border-t border-border p-3">
          <div>
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Property groups
            </div>
            <ul className="space-y-1 text-xs">
              {groups.map((group, index) => {
                const ability = toText(group.ability_key);
                const property = toText(group.property);
                const rankCount = safeNumber(group.rank_count) ?? 0;
                return (
                  <li key={`${champion}-${property ?? "property"}-${index}`} className="flex items-center gap-2">
                    <ProviderBadge provider={group.provider} />
                    <span>{[ability, property].filter(Boolean).join(" ") || "Unknown property"}</span>
                    <span className="text-muted-foreground">
                      {rankCount} rank{rankCount === 1 ? "" : "s"}
                    </span>
                    <Link
                      to={`/admin/knowledge/queue?champion=${encodeURIComponent(champion)}&property=${encodeURIComponent(property ?? "")}`}
                      className="ml-auto text-primary hover:underline"
                    >
                      review →
                    </Link>
                  </li>
                );
              })}
              {groups.length === 0 && <li className="italic text-muted-foreground">No pending groups.</li>}
            </ul>
          </div>

          {changes.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
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
                    {changes.map((change, index) => {
                      const deltaTone = getDeltaTone(change.delta);
                      return (
                        <tr key={`${champion}-change-${index}`} className="border-t border-border/40">
                          <td className="pr-2">{change.rank ?? "—"}</td>
                          <td className="pr-2">{change.ability ?? "—"}</td>
                          <td className="pr-2">{change.property ?? "—"}</td>
                          <td className="pr-2">{change.oldValue ?? "—"}</td>
                          <td className="pr-2">{change.newValue ?? "—"}</td>
                          <td className={`pr-2 ${deltaTone}`}>{formatSignedNumber(change.delta)}</td>
                          <td className={`pr-2 ${deltaTone}`}>{formatSignedPercent(change.deltaPct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1.5">
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
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(body).then(() => toast.success("Copied"));
          }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Copy className="h-3 w-3" /> copy
        </button>
      </div>
      <pre className="max-h-64 whitespace-pre-wrap break-words rounded bg-background/60 p-2 font-mono text-[11px]">
        {body}
      </pre>
    </div>
  );
}

function normalizeAnalytics(payload: PatchAnalyticsResponse | undefined) {
  if (!isRecord(payload)) return null;
  const hero = getRecord(payload, "hero");
  const rankings = getRecord(payload, "rankings");
  const propertyBreakdown = getRecord(payload, "property_breakdown");
  const knowledge = getRecord(payload, "knowledge");
  const champions = Array.isArray(payload.champions)
    ? payload.champions.map(normalizeChampion).filter((item): item is SafeChampionAnalytics => item != null)
    : [];

  return {
    hero,
    rankings,
    propertyBreakdown,
    knowledge,
    champions,
  };
}

function normalizeChampion(value: unknown): SafeChampionAnalytics | null {
  if (!isRecord(value)) return null;
  const champion = toText(value.champion);
  if (!champion) return null;
  const changes = Array.isArray(value.changes)
    ? value.changes.map(normalizeChampionChange).filter((item): item is SafeChampionChange => item != null)
    : [];

  return {
    champion,
    valuesChanged: toMetricValue(value.values_changed),
    propertiesChanged: toMetricValue(value.properties_changed),
    buffs: toMetricValue(value.buff_count),
    nerfs: toMetricValue(value.nerf_count),
    maxSeverity: safeSeverity(value.max_severity),
    netChangeScore: safeNumber(value.net_change_score),
    changes,
  };
}

function normalizeChampionChange(value: unknown): SafeChampionChange | null {
  if (!isRecord(value)) return null;
  return {
    rank: toMetricValue(value.rank),
    ability: toText(value.ability_key),
    property: toText(value.property),
    oldValue: toMetricValue(value.old_value),
    newValue: toMetricValue(value.new_value),
    delta: safeNumber(value.delta),
    deltaPct: safeNumber(value.delta_pct),
  };
}

function normalizeRundown(payload: PatchRundownResponse | undefined): PatchRundownResponse | null {
  if (!payload || !Array.isArray(payload.groups)) return null;
  return payload;
}

function groupByChampion(groups: RundownGroup[]): Record<string, RundownGroup[]> {
  const output: Record<string, RundownGroup[]> = {};
  for (const group of groups) {
    if (typeof group.entity_name === "string" && group.entity_name) {
      output[group.entity_name] = [...(output[group.entity_name] ?? []), group];
    }
  }
  return output;
}

function buildGeneratedContent(data: PatchRundownResponse, patch: string) {
  const label = patch || "current";
  const lines = data.groups.map((group) => {
    const champion = toText(group.entity_name) ?? "Unknown champion";
    const ability = toText(group.ability_key) ?? "";
    const property = toText(group.property) ?? "property";
    const provider = toText(group.provider) ?? "provider";
    const rankCount = safeNumber(group.rank_count) ?? 0;
    return `- ${champion} ${ability} ${property} (${rankCount} rank${rankCount === 1 ? "" : "s"}, ${provider})`;
  });
  const cooldownGroups = data.groups.filter((group) => group.property === "cooldown");
  const championCount = Object.keys(data.by_champion).length;
  const appliedCount = safeNumber(data.review_counts.applied) ?? 0;
  const pendingCount = safeNumber(data.review_counts.pending) ?? 0;
  const status = appliedCount > 0 && pendingCount === 0 ? "applied" : "in review";
  const previewRows = data.groups.slice(0, 5).map((group, index) => {
    const champion = toText(group.entity_name) ?? "Unknown champion";
    const ability = toText(group.ability_key) ?? "";
    const property = toText(group.property) ?? "property";
    return `${index + 2}. ${champion} ${ability} ${property}`;
  });

  const changelog = `## Patch ${label} — Mogsy DB\n\n${lines.join("\n") || "_no changes_"}\n\nStatus: ${status}.`;
  const discord = `**Patch ${label} is in Mogsy!**\n${championCount} champion${championCount === 1 ? "" : "s"} touched · ${appliedCount} applied · ${pendingCount} still in review.`;
  const youtube = `1. Intro: ${championCount} champions changed in patch ${label}\n${previewRows.join("\n")}`;
  const quiz = `Regenerate cooldown Qs for:\n${cooldownGroups.map((group) => `- ${toText(group.entity_name) ?? "Unknown champion"} ${toText(group.ability_key) ?? ""}`).join("\n") || "_none this patch_"}`;

  return { changelog, discord, youtube, quiz };
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(source: unknown, key: string): RecordLike | null {
  if (!isRecord(source)) return null;
  const value = source[key];
  return isRecord(value) ? value : null;
}

function toText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value)) {
    const parts = [value.ability_key, value.property, value.champion, value.label, value.name]
      .filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

function toMetricValue(value: unknown): MetricValue {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return value;
  return null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fallbackCount(value: unknown): number | null {
  return isRecord(value) ? Object.keys(value).length : null;
}

function safeSeverity(value: unknown): Severity | null {
  return value === "major" || value === "moderate" || value === "minor" || value === "unknown" ? value : null;
}

function formatPercent(value: unknown): string | null {
  const number = safeNumber(value);
  return number == null ? null : `${Math.round(number * 100)}%`;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatSignedNumber(value: number | null): string {
  if (value == null) return "—";
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatSignedPercent(value: number | null): string {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function getDeltaTone(value: number | null): string {
  if (value == null) return "";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "";
}