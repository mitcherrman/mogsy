import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  FlaskConical,
  History,
  Info,
  RefreshCw,
  ScrollText,
  Sparkles,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";
import { useChampionDoc, isChampionNotFound } from "@/hooks/useChampionDoc";
import {
  attackSpeedAtLevel,
  statAtLevel,
  type ChampionDoc,
  type DocAbility,
  type DocChampionStats,
  type DocFormula,
  type DocRankValues,
} from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

/** Format a stat value: whole numbers stay whole, fractions get sensible precision. */
function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Number(value.toFixed(decimals));
  return `${rounded % 1 === 0 ? Math.round(rounded) : rounded}`;
}

/** "2026-05-23 09:14:42" / ISO strings → "May 23, 2026"; unparseable input stays raw. */
function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Null-safe projection: only compute when base AND growth are present. */
function projected(base: number | null, growth: number | null, level: number): number | null {
  if (base === null || base === undefined) return null;
  if (growth === null || growth === undefined) return base;
  return statAtLevel(base, growth, level);
}

type StatRowDef = {
  label: string;
  base: (s: DocChampionStats) => number | null;
  growth?: (s: DocChampionStats) => number | null;
  atLevel?: (s: DocChampionStats, level: number) => number | null;
  growthSuffix?: string;
  decimals?: number;
  /** Hide the row entirely (e.g. mana rows for manaless champions). */
  hidden?: (s: DocChampionStats) => boolean;
};

const STAT_ROWS: StatRowDef[] = [
  {
    label: "Health",
    base: (s) => s.hp,
    growth: (s) => s.hp_per_level,
    atLevel: (s, l) => projected(s.hp, s.hp_per_level, l),
  },
  {
    label: "Health regen (per 5s)",
    base: (s) => s.hp5,
    growth: (s) => s.hp5_per_level,
    atLevel: (s, l) => projected(s.hp5, s.hp5_per_level, l),
  },
  {
    label: "Mana",
    base: (s) => s.mp,
    growth: (s) => s.mp_per_level,
    atLevel: (s, l) => projected(s.mp, s.mp_per_level, l),
    hidden: (s) => !s.mp,
  },
  {
    label: "Mana regen (per 5s)",
    base: (s) => s.mp5,
    growth: (s) => s.mp5_per_level,
    atLevel: (s, l) => projected(s.mp5, s.mp5_per_level, l),
    hidden: (s) => !s.mp,
  },
  {
    label: "Attack damage",
    base: (s) => s.ad,
    growth: (s) => s.ad_per_level,
    atLevel: (s, l) => projected(s.ad, s.ad_per_level, l),
  },
  {
    label: "Attack speed",
    base: (s) => s.attack_speed,
    growth: (s) => s.attack_speed_per_level,
    growthSuffix: "%",
    atLevel: (s, l) =>
      s.attack_speed === null || s.attack_speed_per_level === null
        ? s.attack_speed
        : attackSpeedAtLevel(s.attack_speed, s.attack_speed_per_level, l, s.attack_speed_ratio),
    decimals: 3,
  },
  {
    label: "Attack speed ratio",
    base: (s) => s.attack_speed_ratio,
    decimals: 3,
    hidden: (s) => s.attack_speed_ratio === null || s.attack_speed_ratio === undefined,
  },
  {
    label: "Armor",
    base: (s) => s.armor,
    growth: (s) => s.armor_per_level,
    atLevel: (s, l) => projected(s.armor, s.armor_per_level, l),
  },
  {
    label: "Magic resist",
    base: (s) => s.magic_resist,
    growth: (s) => s.magic_resist_per_level,
    atLevel: (s, l) => projected(s.magic_resist, s.magic_resist_per_level, l),
  },
  { label: "Move speed", base: (s) => s.move_speed, decimals: 0 },
  { label: "Attack range", base: (s) => s.attack_range, decimals: 0 },
];

const SLOT_LABELS: Record<DocAbility["slot"], string> = {
  P: "Passive",
  Q: "Q",
  W: "W",
  E: "E",
  R: "R",
};

const UPCOMING_SECTIONS = [
  { title: "Patch history", description: "Structured before-and-after changes.", Icon: History },
  { title: "Related quizzes", description: "Test yourself on this champion.", Icon: BrainCircuit },
  { title: "Combat Lab", description: "Open this champion in the damage simulator.", Icon: FlaskConical },
];

const VERIFICATION_BADGES: Record<string, string> = {
  verified: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  unverified: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  unknown: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

/** Compact per-rank display: by_rank when parseable, otherwise the raw string. */
function rankText(values: DocRankValues | null): string | null {
  if (!values) return null;
  if (values.by_rank && values.by_rank.length > 0) {
    return values.by_rank.map((v) => fmt(v, 2)).join(" / ");
  }
  return values.raw || null;
}

/** Normalized formula with symbolic variables visually distinguished. */
function FormulaText({ formula }: { formula: DocFormula }) {
  const parts = formula.normalized.split(/([A-Za-z_][A-Za-z0-9_]*)/g);
  return (
    <code className="block whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-foreground/90">
      {parts.map((part, i) =>
        formula.unresolved_tokens.includes(part) ? (
          <span
            key={i}
            className="rounded bg-[#c9a84c]/10 px-0.5 font-semibold text-[#e8cd7a]"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </code>
  );
}

function AbilityCard({ ability }: { ability: DocAbility }) {
  const isSynthesizedPassive = ability.slot === "P" && !ability.name && !ability.description;
  const rankRows = [
    { label: "Cooldown", text: rankText(ability.cooldown) },
    { label: "Cost", text: rankText(ability.cost) },
    { label: "Range", text: rankText(ability.range) },
  ].filter((r) => r.text !== null);

  return (
    <article className="rounded-xl border border-border bg-card/60 p-4">
      <header className="flex items-center gap-2.5 flex-wrap">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#c9a84c]/40 bg-black/40 px-1.5 text-xs font-bold" style={{ color: GOLD }}>
          {SLOT_LABELS[ability.slot]}
        </span>
        <h3 className="text-sm md:text-base font-bold text-foreground">
          {ability.name ?? (ability.slot === "P" ? "Passive" : SLOT_LABELS[ability.slot])}
        </h3>
        {ability.ranks !== null && (
          <span className="ml-auto rounded-md border border-border bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {ability.ranks} rank{ability.ranks === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {isSynthesizedPassive ? (
        <p className="mt-2 text-xs text-muted-foreground italic">
          Passive name and description aren't in the library yet.
        </p>
      ) : (
        ability.description && (
          <p className="mt-2 text-xs md:text-sm text-foreground/80">{ability.description}</p>
        )
      )}

      {rankRows.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {rankRows.map((row) => (
            <div key={row.label} className="rounded-md border border-border/60 bg-black/30 p-2">
              <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {row.label}
              </dt>
              <dd className="mt-0.5 font-mono text-[12px] text-foreground/90 break-words">{row.text}</dd>
            </div>
          ))}
        </dl>
      )}

      {ability.formulas.length > 0 && (
        <div className="mt-3 rounded-md border border-[#c9a84c]/20 bg-black/20 p-2.5">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
            Scaling formulas · symbolic reference
          </div>
          <div className="mt-2 space-y-2.5">
            {ability.formulas.map((formula, i) => {
              const isResolved =
                formula.resolved_value !== null && formula.unresolved_tokens.length === 0;
              return (
                <div key={`${formula.type}-${i}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-foreground">{formula.label}</span>
                    {isResolved && (
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-px text-[10px] font-semibold text-emerald-300">
                        constant: {fmt(formula.resolved_value, 2)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    <FormulaText formula={formula} />
                  </div>
                  {formula.raw !== formula.normalized && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground/80">
                        Raw source value
                      </summary>
                      <code className="mt-1 block whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                        {formula.raw}
                      </code>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-muted-foreground">
            Highlighted variables are symbolic — they depend on ability rank, champion stats,
            target defenses, or other combat state, so these formulas are reference scaling
            information, not calculated damage.
          </p>
        </div>
      )}
    </article>
  );
}

export default function LeagueDocsChampionDetail() {
  const { slug = "" } = useParams();
  const [level, setLevel] = useState(1);
  const { data: doc, isLoading, isError, error, refetch, isRefetching } = useChampionDoc(slug);
  const { data: assets } = useChampionAssets();

  const notFound = isError && isChampionNotFound(error);
  const champion = doc?.champion;
  const icon = getChampionIcon(assets, champion?.name);

  return (
    <div>
      <SEOHead
        title={
          champion
            ? `${champion.name} — Stats & Abilities | League Docs`
            : "Champion — League Docs | Mogsy"
        }
        description={
          champion
            ? `${champion.name}${champion.title ? `, ${champion.title}` : ""} — base stats, per-level growth, level projections, and ability cooldowns, costs, and ranges.`
            : "League of Legends champion reference page on Mogsy League Docs."
        }
        path={`/lol/docs/champions/${slug}`}
      />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link
          to="/lol/docs/champions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[#c9a84c] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Champion Index
        </Link>

        {isLoading ? (
          <div className="mt-3 space-y-4 animate-pulse">
            <div className="h-28 rounded-2xl border border-border bg-card/40" />
            <div className="h-72 rounded-xl border border-border bg-card/40" />
            <div className="h-56 rounded-xl border border-border bg-card/40" />
          </div>
        ) : notFound ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-foreground font-semibold">Champion not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No champion matches “{slug}”. It may be misspelled or not in the library yet.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
              <Link to="/lol/docs/champions">Browse all champions</Link>
            </Button>
          </div>
        ) : isError || !doc ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Couldn't load champion data. Check your connection and try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10"
              onClick={() => refetch()}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : (
          <ChampionDocContent doc={doc} icon={icon} level={level} onLevelChange={setLevel} />
        )}
      </div>
    </div>
  );
}

function ChampionDocContent({
  doc,
  icon,
  level,
  onLevelChange,
}: {
  doc: ChampionDoc;
  icon: string | null;
  level: number;
  onLevelChange: (level: number) => void;
}) {
  const { champion, stats, abilities, meta } = doc;
  const verificationBadge = VERIFICATION_BADGES[meta.verification_status] ?? VERIFICATION_BADGES.unknown;
  const identityFacts = [
    champion.resource_type ? { label: "Resource", value: champion.resource_type } : null,
    champion.release_date ? { label: "Released", value: fmtDate(champion.release_date) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <>
      {/* Header */}
      <div className="mt-3 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-5 md:p-7">
        <div className="flex items-center gap-4">
          {icon ? (
            <img
              src={icon}
              alt={champion.name}
              className="h-16 w-16 md:h-20 md:w-20 rounded-xl border border-[#c9a84c]/40 object-cover"
            />
          ) : (
            <span className="h-16 w-16 md:h-20 md:w-20 rounded-xl border border-border bg-black/40" />
          )}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
              League Docs · Champion
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{champion.name}</h1>
            {champion.title && (
              <p className="text-sm text-muted-foreground italic">{champion.title}</p>
            )}
            {identityFacts.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {identityFacts.map((fact) => (
                  <span
                    key={fact.label}
                    className="rounded-md border border-border bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                  >
                    {fact.label}: <span className="text-foreground/90">{fact.value}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Base stats + projection */}
      <section className="mt-4 rounded-xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: GOLD }}>
              Core stats
            </div>
            <h2 className="text-lg font-bold text-foreground">Base stats & growth</h2>
          </div>
          {stats && (
            <div className="w-full sm:w-64">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                <span>Level projection</span>
                <span className="rounded-md border border-[#c9a84c]/40 bg-black/40 px-2 py-0.5 text-[#c9a84c]">
                  Level {level}
                </span>
              </div>
              <Slider
                value={[level]}
                onValueChange={([v]) => onLevelChange(v)}
                min={1}
                max={18}
                step={1}
                className="mt-2"
                aria-label="Projection level"
              />
            </div>
          )}
        </div>

        {!stats ? (
          <p className="mt-4 rounded-md border border-dashed border-border bg-black/20 p-4 text-center text-sm text-muted-foreground">
            Base stats aren't available for this champion yet.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wider">Stat</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right">Base (Lv 1)</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right">Growth / level</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right" style={{ color: GOLD }}>
                      At level {level}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STAT_ROWS.filter((row) => !row.hidden?.(stats)).map((row) => {
                    const decimals = row.decimals ?? 1;
                    const growth = row.growth?.(stats);
                    return (
                      <TableRow key={row.label} className="border-border/60">
                        <TableCell className="text-sm font-semibold text-foreground">{row.label}</TableCell>
                        <TableCell className="text-sm text-right text-foreground/90">
                          {fmt(row.base(stats), decimals)}
                        </TableCell>
                        <TableCell className="text-sm text-right text-muted-foreground">
                          {row.growth
                            ? growth === null || growth === undefined
                              ? "—"
                              : `+${fmt(growth, decimals)}${row.growthSuffix ?? ""}`
                            : "fixed"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-semibold" style={{ color: GOLD }}>
                          {row.atLevel ? fmt(row.atLevel(stats, level), decimals) : fmt(row.base(stats), decimals)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Base-stat projection only, using League's stat-growth curve — the same one Mogsy's
                combat engine uses. Attack-speed growth is a percent bonus applied to the champion's
                attack-speed ratio. Items, runes, buffs, and champion-specific passives are not
                included.
              </span>
            </p>
          </>
        )}
      </section>

      {/* Abilities */}
      <section className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4" style={{ color: GOLD }} />
          <h2 className="text-lg font-bold text-foreground">Abilities</h2>
        </div>
        {abilities.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
            Ability data isn't available for this champion yet.
          </p>
        ) : (
          <div className="space-y-3">
            {abilities.map((ability) => (
              <AbilityCard key={ability.slot} ability={ability} />
            ))}
          </div>
        )}
      </section>

      {/* Data metadata */}
      <section className="mt-4 rounded-xl border border-border bg-card/60 p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <ScrollText className="h-4 w-4" style={{ color: GOLD }} />
          <h2 className="text-sm font-bold text-foreground">About this data</h2>
          <span
            className={`ml-auto inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${verificationBadge}`}
          >
            {meta.verification_status}
          </span>
        </div>
        <dl className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
            <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Data patch</dt>
            <dd className="mt-0.5 text-foreground/90">{meta.patch ?? "Not reported"}</dd>
          </div>
          <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
            <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Source</dt>
            <dd className="mt-0.5 text-foreground/90">{meta.source ?? "Not reported"}</dd>
          </div>
          <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
            <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Last updated</dt>
            <dd className="mt-0.5 text-foreground/90">{fmtDate(meta.last_updated) ?? "Not reported"}</dd>
          </div>
          <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
            <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Last verified</dt>
            <dd className="mt-0.5 text-foreground/90">{fmtDate(meta.last_verified) ?? "Not verified yet"}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">
          “Data patch” is the patch this data was captured or verified against — it may lag the
          current live patch. Verification covers stored values, not live-game currency.
        </p>
      </section>

      {/* Upcoming sections */}
      <section className="mt-4">
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          Coming to this page
        </div>
        <div className="mt-2 grid grid-cols-1 min-[420px]:grid-cols-3 gap-2">
          {UPCOMING_SECTIONS.map((s) => (
            <div key={s.title} className="rounded-lg border border-border/60 bg-card/30 p-3 opacity-70">
              <div className="flex items-center gap-1.5">
                <s.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-bold text-foreground">{s.title}</span>
                <span className="ml-auto rounded border border-[#c9a84c]/30 bg-[#c9a84c]/5 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-[#c9a84c]">
                  Soon
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
