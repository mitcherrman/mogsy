import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  FlaskConical,
  History,
  Info,
  RefreshCw,
  ScrollText,
  Sigma,
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
import { useChampionBaseStats } from "@/hooks/useChampionBaseStats";
import {
  attackSpeedAtLevel,
  findChampionBySlug,
  statAtLevel,
  type ChampionBaseStats,
} from "@/lib/league-docs/api";

const GOLD = "#c9a84c";

/** Format a stat value: whole numbers stay whole, fractions get sensible precision. */
function fmt(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const rounded = Number(value.toFixed(decimals));
  return `${rounded % 1 === 0 ? Math.round(rounded) : rounded}`;
}

type StatRowDef = {
  label: string;
  base: (c: ChampionBaseStats) => number;
  growth?: (c: ChampionBaseStats) => number;
  /** Projected value at a level; omitted = stat does not scale with level. */
  atLevel?: (c: ChampionBaseStats, level: number) => number;
  growthSuffix?: string;
  decimals?: number;
  /** Hide the row entirely (e.g. mana for manaless champions). */
  hidden?: (c: ChampionBaseStats) => boolean;
};

const STAT_ROWS: StatRowDef[] = [
  {
    label: "Health",
    base: (c) => c.hp,
    growth: (c) => c.hp_per_level,
    atLevel: (c, l) => statAtLevel(c.hp, c.hp_per_level, l),
  },
  {
    label: "Health regen (per 5s)",
    base: (c) => c.hp5,
    // hp5 growth is not exposed by the public endpoint yet — base value only.
  },
  {
    label: "Mana",
    base: (c) => c.mp,
    growth: (c) => c.mp_per_level,
    atLevel: (c, l) => statAtLevel(c.mp, c.mp_per_level, l),
    hidden: (c) => !c.mp,
  },
  {
    label: "Attack damage",
    base: (c) => c.ad,
    growth: (c) => c.ad_per_level,
    atLevel: (c, l) => statAtLevel(c.ad, c.ad_per_level, l),
  },
  {
    label: "Attack speed",
    base: (c) => c.attack_speed,
    growth: (c) => c.attack_speed_per_level,
    growthSuffix: "%",
    atLevel: (c, l) => attackSpeedAtLevel(c.attack_speed, c.attack_speed_per_level, l),
    decimals: 3,
  },
  {
    label: "Armor",
    base: (c) => c.armor,
    growth: (c) => c.armor_per_level,
    atLevel: (c, l) => statAtLevel(c.armor, c.armor_per_level, l),
  },
  {
    label: "Magic resist",
    base: (c) => c.magic_resist,
    growth: (c) => c.magic_resist_per_level,
    atLevel: (c, l) => statAtLevel(c.magic_resist, c.magic_resist_per_level, l),
  },
  { label: "Move speed", base: (c) => c.move_speed, decimals: 0 },
  { label: "Attack range", base: (c) => c.attack_range, decimals: 0 },
];

const UPCOMING_SECTIONS = [
  { title: "Abilities", description: "Cooldowns, costs, ranges, and per-rank values.", Icon: Sparkles },
  { title: "Formulas", description: "Damage ratios and scaling math.", Icon: Sigma },
  { title: "Patch history", description: "Structured before-and-after changes.", Icon: History },
  { title: "Related quizzes", description: "Test yourself on this champion.", Icon: BrainCircuit },
  { title: "Combat Lab", description: "Open this champion in the damage simulator.", Icon: FlaskConical },
];

export default function LeagueDocsChampionDetail() {
  const { slug = "" } = useParams();
  const [level, setLevel] = useState(1);
  const { data: champions, isLoading, isError, refetch, isRefetching } = useChampionBaseStats();
  const { data: assets } = useChampionAssets();

  const champion = useMemo(() => findChampionBySlug(champions, slug), [champions, slug]);
  const icon = getChampionIcon(assets, champion?.champion_name);

  return (
    <div>
      <SEOHead
        title={
          champion
            ? `${champion.champion_name} — Base Stats & Growth | League Docs`
            : "Champion — League Docs | Mogsy"
        }
        description={
          champion
            ? `${champion.champion_name} base stats and per-level growth: health, attack damage, armor, magic resist, and projected values at any level from 1 to 18.`
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
          </div>
        ) : isError ? (
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
        ) : !champion ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
            <p className="text-sm text-foreground font-semibold">Champion not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No champion matches “{slug}”. It may be misspelled or not in the library yet.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 border-[#c9a84c]/40 text-[#c9a84c] hover:bg-[#c9a84c]/10">
              <Link to="/lol/docs/champions">Browse all champions</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mt-3 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-5 md:p-7">
              <div className="flex items-center gap-4">
                {icon ? (
                  <img
                    src={icon}
                    alt={champion.champion_name}
                    className="h-16 w-16 md:h-20 md:w-20 rounded-xl border border-[#c9a84c]/40 object-cover"
                  />
                ) : (
                  <span className="h-16 w-16 md:h-20 md:w-20 rounded-xl border border-border bg-black/40" />
                )}
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
                    League Docs · Champion
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">{champion.champion_name}</h1>
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
                <div className="w-full sm:w-64">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span>Level projection</span>
                    <span className="rounded-md border border-[#c9a84c]/40 bg-black/40 px-2 py-0.5 text-[#c9a84c]">
                      Level {level}
                    </span>
                  </div>
                  <Slider
                    value={[level]}
                    onValueChange={([v]) => setLevel(v)}
                    min={1}
                    max={18}
                    step={1}
                    className="mt-2"
                    aria-label="Projection level"
                  />
                </div>
              </div>

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
                    {STAT_ROWS.filter((row) => !row.hidden?.(champion)).map((row) => {
                      const decimals = row.decimals ?? 1;
                      return (
                        <TableRow key={row.label} className="border-border/60">
                          <TableCell className="text-sm font-semibold text-foreground">{row.label}</TableCell>
                          <TableCell className="text-sm text-right text-foreground/90">
                            {fmt(row.base(champion), decimals)}
                          </TableCell>
                          <TableCell className="text-sm text-right text-muted-foreground">
                            {row.growth
                              ? `+${fmt(row.growth(champion), decimals)}${row.growthSuffix ?? ""}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-right font-semibold" style={{ color: GOLD }}>
                            {row.atLevel ? fmt(row.atLevel(champion, level), decimals) : fmt(row.base(champion), decimals)}
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
                  combat engine uses. Items, runes, buffs, and champion-specific passives are not
                  included. Attack-speed growth is percentage-based; champions whose attack-speed
                  ratio differs from their base value may vary slightly.
                </span>
              </p>
            </section>

            {/* Data metadata */}
            <section className="mt-4 rounded-xl border border-border bg-card/60 p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2">
                <ScrollText className="h-4 w-4" style={{ color: GOLD }} />
                <h2 className="text-sm font-bold text-foreground">About this data</h2>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
                  <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Source</dt>
                  <dd className="mt-0.5 text-foreground/90">Mogsy structured League database</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
                  <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Data patch</dt>
                  <dd className="mt-0.5 text-foreground/90">Not reported by the data API yet</dd>
                </div>
                <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
                  <dt className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Last verified</dt>
                  <dd className="mt-0.5 text-foreground/90">Not reported by the data API yet</dd>
                </div>
              </dl>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Values may lag the very latest patch. Per-page patch and verification metadata will
                appear here as the data API starts reporting it.
              </p>
            </section>

            {/* Upcoming sections */}
            <section className="mt-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                Coming to this page
              </div>
              <div className="mt-2 grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-2">
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
        )}
      </div>
    </div>
  );
}
