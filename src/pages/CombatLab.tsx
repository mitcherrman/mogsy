import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Swords,
  Zap,
  Activity,
  Timer,
  Heart,
  Skull,
  Plus,
  X,
  Search,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  WifiOff,
  AlertTriangle,
  Crosshair,
  Target as TargetIcon,
  Layers,
  RotateCcw,
  Hand,
  BarChart3,
  LineChart,
  PieChart,
  Flame,
  Database,
  Filter,
  Wand2,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import ChampionProfile from "@/components/combat-lab/ChampionProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  combatApi,
  COMBAT_API_BASE_URL,
  PRESETS,
  CRIT_MODES,
  assertSimulationResponse,
  getEventTime,
  getEventDamage,
  getEventLabel,
  type Champion,
  type Item,
  type Rune,
  type TargetProfile,
  type Summoner,
  type OptionsMeta,
  type SimulateRequest,
  type SimulationResult,
  type TimelineEvent,
  type CritMode,
  type CombatAction,
  type SandboxStepResponse,
  type TargetScopeInfo,
  DEFAULT_ATTACKER_STATS,
  DEFAULT_TARGET_STATS,
  type CombatLabBasicAttackRequest,
  type CombatLabActiveRequest,
  type CombatLabBuildPreviewRequest,
  type CombatLabBuildPreviewResponse,
  type CoverageResponse,
  type CoverageChampion,
  type ChampionConfidenceResponse,
  type ChampionConfidence,
} from "@/lib/combat-lab/api";

const STORAGE_KEY = "combat-lab:last-config";
const COMBO_TOKENS = ["AA", "Q", "W", "E", "R", "IGNITE", "FLASH", "HEAL", "BARRIER", "GHOST", "EXHAUST", "SMITE"];
const ALLOWED_CRIT_MODES = CRIT_MODES;

type ApiStatus = "checking" | "online" | "offline";

const defaultConfig: SimulateRequest = {
  champion: "",
  sequence: "Q,AA,E,AA,R",
  items: [],
  runes: [],
  target_profile: "",
  stats: { LEVEL: 18 },
  ranks: { Q: 5, W: 5, E: 5, R: 3 },
  branches: {},
  ad: 100,
  attack_speed: 1.2,
  crit_mode: "expected",
};

/* ─────────────── hooks ─────────────── */

function useOutsideClose(
  active: boolean,
  onClose: () => void
) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, onClose]);
  return ref;
}

/* ─────────────── icon placeholder (icon-ready) ─────────────── */

function IconBubble({
  name,
  src,
  size = "md",
  tone = "muted",
}: {
  name: string;
  src?: string;
  size?: "sm" | "md";
  tone?: "muted" | "primary";
}) {
  const initials = name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const sz = size === "sm" ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[10px]";
  const toneCls =
    tone === "primary"
      ? "bg-primary/15 text-primary border-primary/30"
      : "bg-muted/40 text-muted-foreground border-border/60";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border font-semibold ${sz} ${toneCls}`}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

/* ─────────────── small primitives ─────────────── */

function SectionCard({
  title,
  icon: Icon,
  children,
  right,
  className,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`border-border/60 bg-card/60 backdrop-blur-sm ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 text-foreground/90">
            {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
            {title}
          </CardTitle>
          {right}
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function Chip({
  label,
  onRemove,
  tone = "default",
  icon,
}: {
  label: string;
  onRemove?: () => void;
  tone?: "default" | "primary" | "accent";
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === "primary"
      ? "border-primary/40 bg-primary/10 text-primary"
      : tone === "accent"
      ? "border-accent/40 bg-accent/10 text-accent"
      : "border-border bg-muted/40 text-foreground/90";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${toneCls}`}
    >
      {icon}
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 transition"
          aria-label={`Remove ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function SearchSelect<T extends { name: string }>({
  label,
  placeholder,
  value,
  options,
  onChange,
  loading,
  withIcons = false,
}: {
  label?: string;
  placeholder: string;
  value: string;
  options: T[];
  onChange: (v: string) => void;
  loading?: boolean;
  withIcons?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        (o?.name ?? "").toLowerCase().includes(query.toLowerCase())
      ),
    [options, query]
  );
  useEffect(() => setActiveIdx(0), [query, open]);
  const containerRef = useOutsideClose(open, () => setOpen(false));
  const select = (name: string) => {
    onChange(name);
    setOpen(false);
    setQuery("");
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[activeIdx];
      if (o) select(o.name);
    }
  };
  return (
    <div className="relative" ref={containerRef}>
      {label && <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background/60 px-3 text-sm hover:border-primary/40 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          {withIcons && value && <IconBubble name={value} size="sm" tone="primary" />}
          <span className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || placeholder}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl"
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((o, idx) => (
              <button
                key={o.name}
                type="button"
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => select(o.name)}
                role="option"
                aria-selected={o.name === value}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  idx === activeIdx ? "bg-primary/10" : ""
                } ${o.name === value ? "text-primary" : "text-foreground/90"}`}
              >
                {withIcons && <IconBubble name={o.name} size="sm" />}
                <span className="truncate">{o.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MultiSelect<T extends { name: string; tree?: string; type?: string }>({
  label,
  placeholder,
  values,
  options,
  onChange,
  max,
  grouped,
  loading,
  withIcons = false,
}: {
  label?: string;
  placeholder: string;
  values: string[];
  options: T[];
  onChange: (v: string[]) => void;
  max?: number;
  grouped?: boolean;
  loading?: boolean;
  withIcons?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useOutsideClose(open, () => setOpen(false));
  const filtered = useMemo(
    () => options.filter((o) => (o?.name ?? "").toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );
  const groups = useMemo(() => {
    if (!grouped) return null;
    const g: Record<string, T[]> = {};
    for (const o of filtered) {
      const key = o.tree || "Other";
      (g[key] ||= []).push(o);
    }
    return g;
  }, [filtered, grouped]);

  const toggle = (name: string) => {
    if (values.includes(name)) {
      onChange(values.filter((v) => v !== name));
    } else {
      if (max && values.length >= max) {
        toast({ title: `Max ${max} selected`, description: "Remove one to add another." });
        return;
      }
      onChange([...values, name]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
          {max && (
            <span className="text-[10px] text-muted-foreground">
              {values.length}/{max}
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="min-h-10 w-full rounded-md border border-input bg-background/60 px-2 py-1.5 text-left text-sm hover:border-primary/40 transition-colors"
      >
        {values.length === 0 ? (
          <span className="text-muted-foreground px-1">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => (
              <Chip
                key={v}
                label={v}
                tone="primary"
                icon={withIcons ? <IconBubble name={v} size="sm" tone="primary" /> : undefined}
                onRemove={() => onChange(values.filter((x) => x !== v))}
              />
            ))}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="Search…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground pr-1"
            >
              Done
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
            )}
            {groups
              ? Object.entries(groups).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {group}
                    </div>
                    {items.map((o) => {
                      const selected = values.includes(o.name);
                      return (
                        <button
                          key={o.name}
                          type="button"
                          onClick={() => toggle(o.name)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-primary/10 ${
                            selected ? "text-primary" : "text-foreground/90"
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {withIcons && <IconBubble name={o.name} size="sm" />}
                            <span className="truncate">{o.name}</span>
                          </span>
                          {selected && <span className="text-xs">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                ))
              : filtered.map((o) => {
                  const selected = values.includes(o.name);
                  return (
                    <button
                      key={o.name}
                      type="button"
                      onClick={() => toggle(o.name)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-primary/10 ${
                        selected ? "text-primary" : "text-foreground/90"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {withIcons && <IconBubble name={o.name} size="sm" />}
                        <span className="truncate">{o.name}</span>
                      </span>
                      {selected && <span className="text-xs">✓</span>}
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── page ─────────────── */

export default function CombatLab() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [runes, setRunes] = useState<Rune[]>([]);
  const [targets, setTargets] = useState<TargetProfile[]>([]);
  const [summoners, setSummoners] = useState<Summoner[]>([]);
  const [actionsMeta, setActionsMeta] = useState<CombatAction[]>([]);
  const [options, setOptions] = useState<OptionsMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  const [config, setConfig] = useState<SimulateRequest>(() => {
    if (typeof window === "undefined") return defaultConfig;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultConfig, ...JSON.parse(raw) };
    } catch {}
    return defaultConfig;
  });

  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [devMode, setDevMode] = useState(false);

  /* persist config */
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  /* health */
  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await combatApi.health();
        if (!cancelled) setApiStatus("online");
      } catch {
        if (!cancelled) setApiStatus("offline");
      }
    };
    ping();
    const id = setInterval(ping, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  /* metadata */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMetaLoading(true);
      const settle = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await p;
        } catch {
          return fallback;
        }
      };
      const [ch, it, ru, tg, sm, ac, op] = await Promise.all([
        settle(combatApi.champions(), [] as Champion[]),
        settle(combatApi.items(), [] as Item[]),
        settle(combatApi.runes(), [] as Rune[]),
        settle(combatApi.targetProfiles(), [] as TargetProfile[]),
        settle(combatApi.summoners(), [] as Summoner[]),
        settle(combatApi.combatLabActions(), [] as CombatAction[]),
        settle(combatApi.options(), {} as OptionsMeta),
      ]);
      if (cancelled) return;
      setChampions(ch);
      setItems(it);
      setRunes(ru);
      setTargets(tg);
      setSummoners(sm);
      setActionsMeta(ac);
      setOptions(op);
      setMetaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const critModes = useMemo<readonly CritMode[]>(() => {
    const fromApi = (options?.crit_modes || []).filter((m): m is CritMode =>
      (ALLOWED_CRIT_MODES as readonly string[]).includes(m)
    );
    return fromApi.length ? fromApi : ALLOWED_CRIT_MODES;
  }, [options]);

  // Keep crit_mode valid if backend whitelist narrows
  useEffect(() => {
    if (config.crit_mode && !critModes.includes(config.crit_mode)) {
      setConfig((c) => ({ ...c, crit_mode: critModes[0] }));
    }
  }, [critModes, config.crit_mode]);

  const update = <K extends keyof SimulateRequest>(key: K, val: SimulateRequest[K]) =>
    setConfig((c) => ({ ...c, [key]: val }));

  const applyPreset = (key: keyof typeof PRESETS) => {
    setConfig({ ...defaultConfig, ...PRESETS[key] });
    toast({ title: "Preset loaded", description: PRESETS[key].champion });
  };

  const sequenceTokens = config.sequence
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const setSequenceTokens = (tokens: string[]) =>
    update("sequence", tokens.join(","));

  const runSimulation = async () => {
    setError(null);
    if (!config.champion) {
      toast({ title: "Pick a champion", variant: "destructive" });
      return;
    }
    if (!config.target_profile) {
      toast({ title: "Pick a target profile", variant: "destructive" });
      return;
    }
    if (sequenceTokens.length === 0) {
      toast({ title: "Add at least one ability to the combo", variant: "destructive" });
      return;
    }
    setSimulating(true);
    try {
      const res = await combatApi.simulate(config);
      assertSimulationResponse(res);
      setResult(res.result);
    } catch (e: any) {
      setError(e?.message || "Simulation failed");
      setResult(null);
    } finally {
      setSimulating(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ config, result }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "combat-lab-simulation.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config));
      toast({ title: "Config copied", description: "Paste it anywhere to share." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="px-4 md:px-0 py-6 md:py-10 xl:w-[120%] xl:-ml-[10%]">
      <SEOHead
        title="Combat Lab — Mogsy"
        description="League of Legends combat simulator. Build combos, pick items and runes, and benchmark damage with the Mogsy Combat Lab."
      />

      {/* Header */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80 m-0">
          <Swords className="h-3.5 w-3.5" />
          Combat Lab
        </h1>
        <div className="flex items-center gap-2">
          <ApiStatusBadge status={apiStatus} />
          <Link
            to="/combat-lab/diagnostics"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-card/40 px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Activity className="h-3 w-3" />
            Diagnostics
          </Link>
          <button
            type="button"
            onClick={() => setDevMode((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${
              devMode
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/50 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-primary"
            }`}
            title="Toggle developer mode"
          >
            <Activity className="h-3 w-3" />
            Dev Mode {devMode ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      <MetadataAuditPanel
        loading={metaLoading}
        apiStatus={apiStatus}
        champions={champions}
        items={items}
        runes={runes}
        targets={targets}
        summoners={summoners}
        actions={actionsMeta}
      />

      <Tabs defaultValue="sandbox" className="w-full">
        {/* Rotation Simulator hidden in Phase 2A — Interactive Sandbox is the primary experience.
            Code retained but TabsList omitted so only the Sandbox renders. */}
        <TabsList className="hidden h-auto w-full justify-start gap-1 rounded-lg border border-border/60 bg-card/40 p-1 backdrop-blur-sm">
          <TabsTrigger
            value="rotation"
            className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none gap-2 px-4 py-2"
          >
            <Zap className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span>Rotation Simulator</span>
              <span className="text-[10px] font-normal text-muted-foreground/80">Full combo / DPS / build testing</span>
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="sandbox"
            className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none gap-2 px-4 py-2"
          >
            <Crosshair className="h-4 w-4" />
            <span className="flex flex-col items-start leading-tight">
              <span>Interactive Sandbox</span>
              <span className="text-[10px] font-normal text-muted-foreground/80">Step-by-step stateful combat</span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rotation" className="mt-0">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: configuration */}
        <div className="space-y-6 lg:col-span-2">
          {/* Presets */}
          <SectionCard title="Presets" icon={Sparkles}>
            <div className="grid gap-3 sm:grid-cols-2">
              <PresetCard
                title="Akali Burst"
                subtitle="Q → AA → E → Ignite → AA → R"
                accent="from-pink-500/20 to-purple-500/10"
                onClick={() => applyPreset("akali-burst")}
              />
              <PresetCard
                title="Ashe On-Hit DPS"
                subtitle="Sustained auto-attacks vs Tank"
                accent="from-sky-500/20 to-cyan-500/10"
                onClick={() => applyPreset("ashe-onhit")}
              />
            </div>
          </SectionCard>

          {/* Champion + target + crit */}
          <SectionCard title="Setup" icon={Swords}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SearchSelect
                label="Champion"
                placeholder="Select champion…"
                value={config.champion}
                options={champions}
                onChange={(v) => update("champion", v)}
                loading={metaLoading}
                withIcons
              />
              <SearchSelect
                label="Target profile"
                placeholder="Select target…"
                value={config.target_profile}
                options={targets}
                onChange={(v) => update("target_profile", v)}
                loading={metaLoading}
              />
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Crit mode
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {critModes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => update("crit_mode", m as CritMode)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        config.crit_mode === m
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    AD
                  </Label>
                  <Input
                    type="number"
                    value={config.ad ?? 0}
                    onChange={(e) => update("ad", Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                    Attack speed
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={config.attack_speed ?? 0}
                    onChange={(e) => update("attack_speed", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Combo */}
          <SectionCard title="Combo sequence" icon={Zap}>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-border/70 bg-background/40 p-3 min-h-16">
                {sequenceTokens.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    Click tokens below to build your combo.
                  </span>
                )}
                {sequenceTokens.map((tok, i) => (
                  <span
                    key={`${tok}-${i}`}
                    className="group inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-bold text-primary"
                  >
                    <span className="opacity-60">{i + 1}.</span>
                    {tok}
                    <button
                      type="button"
                      onClick={() =>
                        setSequenceTokens(sequenceTokens.filter((_, idx) => idx !== i))
                      }
                      className="opacity-60 hover:opacity-100"
                      aria-label="Remove token"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COMBO_TOKENS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSequenceTokens([...sequenceTokens, t])}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-semibold text-foreground/90 hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition"
                  >
                    <Plus className="h-3 w-3" />
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
                  Raw sequence
                </Label>
                <Input
                  value={config.sequence}
                  onChange={(e) => update("sequence", e.target.value)}
                  placeholder="Q,AA,E,AA,R"
                />
              </div>
            </div>
          </SectionCard>

          {/* Items + runes */}
          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard title="Items (max 6)" icon={Sparkles}>
              <MultiSelect
                placeholder="Select items…"
                values={config.items}
                options={items}
                onChange={(v) => update("items", v)}
                max={6}
                loading={metaLoading}
                withIcons
              />
            </SectionCard>
            <SectionCard title="Runes" icon={Sparkles}>
              <MultiSelect
                placeholder="Select runes…"
                values={config.runes}
                options={runes}
                onChange={(v) => update("runes", v)}
                grouped
                loading={metaLoading}
                withIcons
              />
            </SectionCard>
          </div>

          {/* Advanced */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-6 py-4 text-left"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4 w-4 text-primary" />
                Advanced — ranks, branches, custom stats
              </span>
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 opacity-60" />
              ) : (
                <ChevronDown className="h-4 w-4 opacity-60" />
              )}
            </button>
            <AnimatePresence initial={false}>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <CardContent className="grid gap-4 pt-0 md:grid-cols-3">
                    <KeyNumberEditor
                      label="Ability ranks"
                      values={config.ranks || {}}
                      onChange={(v) => update("ranks", v)}
                      placeholderKey="Q"
                    />
                    <KeyStringEditor
                      label="Branches"
                      values={config.branches || {}}
                      onChange={(v) => update("branches", v)}
                      placeholderKey="R"
                      placeholderValue="maximum"
                    />
                    <KeyNumberEditor
                      label="Custom stats"
                      values={config.stats || {}}
                      onChange={(v) => update("stats", v)}
                      placeholderKey="LEVEL"
                    />
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* CTA */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={copyShare}>
                <Copy className="h-4 w-4" /> Copy config
              </Button>
              <Button variant="outline" size="sm" onClick={exportJson} disabled={!result}>
                <Download className="h-4 w-4" /> Export JSON
              </Button>
            </div>
            <Button
              size="xl"
              variant="hero"
              onClick={runSimulation}
              disabled={simulating || apiStatus === "offline"}
              className="w-full sm:w-auto"
            >
              {simulating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Running…
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" /> Run Simulation
                </>
              )}
            </Button>
          </div>
        </div>

        {/* RIGHT: results */}
        <div className="space-y-6">
          {apiStatus === "offline" && (
            <Card className="border-destructive/40 bg-destructive/10">
              <CardContent className="flex items-start gap-3 p-4 text-sm">
                <WifiOff className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-destructive">Backend offline</div>
                  <div className="mt-1 text-xs text-foreground/80 break-all">
                    Couldn't reach <span className="font-mono">{COMBAT_API_BASE_URL}</span>.
                    Start the simulation API and it will reconnect automatically.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="border-destructive/50 bg-destructive/10">
              <CardContent className="flex items-start gap-3 p-4 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-destructive">Simulation failed</div>
                  <div className="mt-1 text-foreground/80 break-words">{error}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={runSimulation}
                    disabled={simulating || apiStatus === "offline"}
                  >
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {simulating && !result && <ResultsSkeleton />}

          {result && (
            <div className="space-y-6" data-results-area>
              <ResultsSummary summary={result.summary} />
              {/* future graph panels (DPS over time, damage-source pie) slot in here */}
              <TimelineViewer events={result.timeline || []} />
              <FinalStatePanel state={result.final_state || {}} />
            </div>
          )}

          {!result && !simulating && !error && apiStatus !== "offline" && (
            <Card className="border-dashed border-border/60 bg-card/40">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Swords className="h-8 w-8 text-primary/60" />
                <div className="font-medium text-foreground">No simulation yet</div>
                <div>Configure your loadout and hit Run Simulation.</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
        </TabsContent>

        <TabsContent value="sandbox" className="mt-0">
          <InteractiveSandbox
            config={config}
            update={update}
            champions={champions}
            items={items}
            runes={runes}
            targets={targets}
            summoners={summoners}
            critModes={critModes}
            metaLoading={metaLoading}
            apiStatus={apiStatus}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─────────────── result components ─────────────── */

function ApiStatusBadge({ status }: { status: ApiStatus }) {
  const map = {
    checking: { label: "Checking…", cls: "bg-muted/30 text-muted-foreground border-border", dot: "bg-muted-foreground" },
    online: { label: "Backend Connected", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
    offline: { label: "Backend Offline", cls: "bg-destructive/10 text-destructive border-destructive/40", dot: "bg-destructive" },
  }[status];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${map.cls}`}
      title={COMBAT_API_BASE_URL}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${map.dot} ${status === "online" ? "animate-pulse" : ""}`} />
      {map.label}
    </div>
  );
}

function PresetCard({
  title,
  subtitle,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-lg border border-border/60 bg-gradient-to-br ${accent} p-4 text-left transition hover:border-primary/50 hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.5)]`}
    >
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      <div className="mt-3 text-[10px] uppercase tracking-wider text-primary opacity-80 group-hover:opacity-100">
        Load preset →
      </div>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = "primary",
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  accent?: "primary" | "accent" | "emerald" | "destructive";
}) {
  const accentMap: Record<string, string> = {
    primary: "from-primary/20 to-primary/0 text-primary",
    accent: "from-accent/20 to-accent/0 text-accent",
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-400",
    destructive: "from-destructive/20 to-destructive/0 text-destructive",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-lg border border-border/60 bg-card/60 p-4 backdrop-blur-sm`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentMap[accent]}`} />
      <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="relative mt-2 text-2xl font-bold text-foreground">{value}</div>
    </motion.div>
  );
}

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = display;
    const to = value;
    const dur = 600;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

function ResultsSummary({ summary }: { summary: SimulationResult["summary"] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard
        icon={Swords}
        label="Total damage"
        value={<AnimatedNumber value={summary.total_damage} />}
      />
      <StatCard
        icon={Activity}
        label="DPS"
        value={<AnimatedNumber value={summary.dps} />}
        accent="accent"
      />
      <StatCard
        icon={Timer}
        label="Duration"
        value={<><AnimatedNumber value={summary.duration} />s</>}
      />
      <StatCard
        icon={Heart}
        label="Remaining HP"
        value={<AnimatedNumber value={summary.remaining_hp} />}
        accent={summary.lethal ? "destructive" : "emerald"}
      />
      <div className="col-span-2">
        <div
          className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-bold uppercase tracking-widest ${
            summary.lethal
              ? "border-destructive/50 bg-destructive/15 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
          }`}
        >
          <Skull className="h-4 w-4" />
          {summary.lethal ? "Lethal" : "Not Lethal"}
        </div>
      </div>
    </div>
  );
}

/**
 * Damage-type tone helpers (future-ready). Backend may emit damage_type:
 * "physical" | "magic" | "true". We expose stable tone tokens so a richer
 * color system can plug in without touching the renderer.
 */
function damageTypeTone(type?: string): {
  dot: string;
  text: string;
  border: string;
  bg: string;
  label?: string;
} {
  switch ((type || "").toLowerCase()) {
    case "physical":
      return {
        dot: "bg-orange-400",
        text: "text-orange-300",
        border: "border-orange-500/30",
        bg: "bg-orange-500/5",
        label: "PHYS",
      };
    case "magic":
      return {
        dot: "bg-sky-400",
        text: "text-sky-300",
        border: "border-sky-500/30",
        bg: "bg-sky-500/5",
        label: "MAG",
      };
    case "true":
      return {
        dot: "bg-fuchsia-400",
        text: "text-fuchsia-300",
        border: "border-fuchsia-500/30",
        bg: "bg-fuchsia-500/5",
        label: "TRUE",
      };
    default:
      return {
        dot: "bg-primary",
        text: "text-primary",
        border: "border-primary/30",
        bg: "bg-primary/5",
      };
  }
}

function TimelineViewer({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <SectionCard title="Timeline" icon={Timer}>
        <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
          No timeline events returned.
        </div>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Timeline" icon={Timer}>
      <ol className="relative space-y-3 border-l border-border/60 pl-5">
        {events.map((e, i) => {
          const t = getEventTime(e);
          const name = getEventLabel(e);
          const dmg = getEventDamage(e);
          const isDamage = dmg != null && dmg > 0;
          const tone = damageTypeTone(e.damage_type);
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.025, 0.5), duration: 0.25, ease: "easeOut" }}
              className={`group relative rounded-md border p-3 transition-colors ${
                isDamage
                  ? `${tone.border} ${tone.bg} hover:border-opacity-70`
                  : "border-border/50 bg-muted/10 hover:border-border"
              }`}
            >
              <span
                className={`absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                  isDamage ? tone.dot : "bg-muted-foreground/50"
                }`}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {Number(t).toFixed(2)}s
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                  {e.source && (
                    <span className="hidden truncate text-[10px] uppercase tracking-wider text-muted-foreground/80 sm:inline">
                      · {e.source}
                    </span>
                  )}
                  {isDamage && tone.label && (
                    <span
                      className={`rounded-sm border px-1 py-px text-[9px] font-bold tracking-wider ${tone.border} ${tone.text}`}
                    >
                      {tone.label}
                    </span>
                  )}
                </div>
                {dmg != null && (
                  <span
                    className={`font-mono text-base font-bold tabular-nums ${
                      isDamage ? tone.text : "text-muted-foreground"
                    }`}
                  >
                    {isDamage ? "−" : ""}
                    {dmg.toFixed(1)}
                  </span>
                )}
              </div>
              {e.notes && (
                <div className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                  {e.notes}
                </div>
              )}
            </motion.li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

function FinalStatePanel({ state }: { state: Record<string, unknown> }) {
  const entries = Object.entries(state);
  return (
    <SectionCard title="Final state" icon={Activity}>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground">No state returned.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div
              key={k}
              className="rounded-md border border-border/50 bg-background/40 p-2"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {k}
              </div>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-foreground/90">
                {typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/* ─────────────── key/value editors ─────────────── */

function KeyNumberEditor({
  label,
  values,
  onChange,
  placeholderKey,
}: {
  label: string;
  values: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  placeholderKey: string;
}) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="space-y-1.5">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <Input value={k} disabled className="h-8 flex-1 text-xs" />
            <Input
              type="number"
              value={v}
              onChange={(e) => onChange({ ...values, [k]: Number(e.target.value) })}
              className="h-8 w-20 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...values };
                delete next[k];
                onChange(next);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            placeholder={placeholderKey}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            className="h-8 flex-1 text-xs"
          />
          <Input
            type="number"
            placeholder="0"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            className="h-8 w-20 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (!newKey) return;
              onChange({ ...values, [newKey]: Number(newVal) || 0 });
              setNewKey("");
              setNewVal("");
            }}
            className="text-primary hover:text-primary/80"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyStringEditor({
  label,
  values,
  onChange,
  placeholderKey,
  placeholderValue,
}: {
  label: string;
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  placeholderKey: string;
  placeholderValue: string;
}) {
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="space-y-1.5">
        {Object.entries(values).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <Input value={k} disabled className="h-8 w-16 text-xs" />
            <Input
              value={v}
              onChange={(e) => onChange({ ...values, [k]: e.target.value })}
              className="h-8 flex-1 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const next = { ...values };
                delete next[k];
                onChange(next);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Input
            placeholder={placeholderKey}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            className="h-8 w-16 text-xs"
          />
          <Input
            placeholder={placeholderValue}
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            className="h-8 flex-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (!newKey) return;
              onChange({ ...values, [newKey]: newVal });
              setNewKey("");
              setNewVal("");
            }}
            className="text-primary hover:text-primary/80"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
/* ─────────────── Interactive Sandbox ─────────────── */

const SANDBOX_STORAGE_KEY = "combat-lab:sandbox-state";

type SandboxProps = {
  config: SimulateRequest;
  update: <K extends keyof SimulateRequest>(key: K, val: SimulateRequest[K]) => void;
  champions: Champion[];
  items: Item[];
  runes: Rune[];
  targets: TargetProfile[];
  summoners: Summoner[];
  critModes: readonly CritMode[];
  metaLoading: boolean;
  apiStatus: ApiStatus;
  devMode: boolean;
  setDevMode: React.Dispatch<React.SetStateAction<boolean>>;
};

function buildAttackerStats(config: SimulateRequest): Record<string, number> {
  const merged: Record<string, number> = { ...DEFAULT_ATTACKER_STATS };
  if (typeof config.ad === "number") merged.AD = config.ad;
  if (config.stats) {
    for (const [k, v] of Object.entries(config.stats)) {
      if (typeof v === "number") merged[k.toUpperCase().replace(/\s+/g, "_")] = v;
    }
  }
  if (config.ranks) {
    for (const [k, v] of Object.entries(config.ranks)) {
      if (typeof v === "number") merged[`${k.toUpperCase()}_RANK`] = v;
    }
  }
  return merged;
}

function numericMap(src: Record<string, unknown> | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!src) return out;
  for (const [k, v] of Object.entries(src)) {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function InteractiveSandbox({
  config,
  update,
  champions,
  items,
  runes,
  targets,
  summoners,
  critModes,
  metaLoading,
  apiStatus,
}: SandboxProps) {
  const [state, setState] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [scopes, setScopes] = useState<Record<string, TargetScopeInfo>>({});
  const [attackerStats, setAttackerStats] = useState<Record<string, number | string>>({});
  const [actions, setActions] = useState<CombatAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [hijackTarget, setHijackTarget] = useState<string>("Malphite");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [lastRequest, setLastRequest] = useState<unknown>(null);
  const [lastResponse, setLastResponse] = useState<unknown>(null);
  const [lastEndpoint, setLastEndpoint] = useState<string>("");
  const [lastAction, setLastAction] = useState<
    | { kind: "basic-attack" }
    | { kind: "active"; action_id: string }
    | null
  >(null);
  const [activeTargetScope, setActiveTargetScope] = useState<string>("PRIMARY");
  const [previewBuildStats, setPreviewBuildStats] = useState<Record<string, number>>({});
  const [previewRuntimeStats, setPreviewRuntimeStats] = useState<Record<string, number>>({});
  const [summonerPicks, setSummonerPicks] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("combat-lab:summoners");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 2) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("combat-lab:summoners", JSON.stringify(summonerPicks));
    } catch {}
  }, [summonerPicks]);
  const timelineRef = useRef<HTMLDivElement>(null);

  // load actions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setActionsLoading(true);
      try {
        const data = await combatApi.combatLabActions();
        if (!cancelled) setActions(data);
      } catch {
        if (!cancelled) setActions([]);
      } finally {
        if (!cancelled) setActionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // restore last sandbox snapshot
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SANDBOX_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.state) setState(parsed.state);
      if (Array.isArray(parsed?.events)) setEvents(parsed.events);
      if (parsed?.scopes) setScopes(parsed.scopes);
      if (parsed?.attackerStats) setAttackerStats(parsed.attackerStats);
    } catch {}
  }, []);

  // persist snapshot
  useEffect(() => {
    try {
      localStorage.setItem(
        SANDBOX_STORAGE_KEY,
        JSON.stringify({ state, events, scopes, attackerStats })
      );
    } catch {}
  }, [state, events, scopes, attackerStats]);

  const visibleActions = useMemo(() => {
    const champ = (config.champion || "").toLowerCase();
    return actions.filter((a) => {
      if (Array.isArray(a.champions) && a.champions.length > 0) {
        return a.champions.some((c) => c.toLowerCase() === champ);
      }
      if (a.champion) {
        return a.champion.toLowerCase() === champ;
      }
      return true;
    });
  }, [actions, config.champion]);

  const hasChampionSpecificActions = useMemo(() => {
    const champ = (config.champion || "").toLowerCase();
    return actions.some((a) => {
      if (Array.isArray(a.champions) && a.champions.length > 0) {
        return a.champions.some((c) => c.toLowerCase() === champ);
      }
      if (a.champion) {
        return a.champion.toLowerCase() === champ;
      }
      return false;
    });
  }, [actions, config.champion]);

  const applyResponse = (res: SandboxStepResponse) => {
    if (res.state) setState(res.state);
    if (res.remaining_by_scope) setScopes(res.remaining_by_scope);
    if (res.attacker_stats) setAttackerStats(res.attacker_stats);
    if (Array.isArray(res.events) && res.events.length) {
      setEvents((prev) => [...prev, ...res.events!]);
      // scroll to bottom of timeline
      requestAnimationFrame(() => {
        timelineRef.current?.scrollTo({
          top: timelineRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  };

  const sendStep = async (
    kind: "basic-attack" | "active",
    action_id?: string,
    extra?: Record<string, unknown>
  ) => {
    if (!config.champion) {
      toast({ title: "Pick a champion first", variant: "destructive" });
      return;
    }
    if (!config.target_profile) {
      toast({ title: "Pick a target profile first", variant: "destructive" });
      return;
    }
    setError(null);
    setBusy(action_id || kind);
    setLastAction(kind === "basic-attack" ? { kind } : { kind, action_id: action_id || "" });
    try {
      // Source of truth: backend runtime_stats from build-preview.
      // Developer mode allows manual overrides via config.ad / config.attack_speed / config.stats.
      const backendStats = { ...previewBuildStats, ...previewRuntimeStats };
      const overrides = devMode ? buildAttackerStats(config) : {};
      const attacker_stats: Record<string, number> =
        Object.keys(backendStats).length > 0
          ? { ...backendStats, ...overrides }
          : buildAttackerStats(config);
      const target_stats = { ...DEFAULT_TARGET_STATS };
      const safeState = state ?? {};
      let payload: unknown;
      let endpoint: string;
      let res: SandboxStepResponse;
      if (kind === "basic-attack") {
        endpoint = "/api/combat-lab/basic-attack";
        payload = {
          champion_name: config.champion,
          item_names: config.items,
          rune_names: config.runes,
          attacker_stats,
          target_stats,
          state: safeState,
          current_time: 0,
        } as CombatLabBasicAttackRequest;
        setLastEndpoint(endpoint);
        setLastRequest(payload);
        res = await combatApi.basicAttack(payload as CombatLabBasicAttackRequest);
      } else {
        endpoint = "/api/combat-lab/active";
        const sylasExtra: Record<string, unknown> = {};
        if (config.champion === "Sylas") {
          sylasExtra.copied_champion = hijackTarget || "Malphite";
          sylasExtra.hijack_target = hijackTarget || "Malphite";
        }
        payload = {
          champion_name: config.champion,
          attacker_stats,
          target_stats,
          state: safeState,
          active_name: action_id || "",
          target_scope: activeTargetScope || "PRIMARY",
          piercing_arrow_charge_bonus_percent: 0,
          ...extra,
          ...sylasExtra,
        } as CombatLabActiveRequest;
        setLastEndpoint(endpoint);
        setLastRequest(payload);
        res = await combatApi.active(payload as CombatLabActiveRequest);
      }
      setLastResponse(res);
      applyResponse(res);
    } catch (e: any) {
      setError(e?.message || `${kind} failed`);
      setLastResponse({ error: e?.message || String(e) });
    } finally {
      setBusy(null);
    }
  };

  const retryLast = () => {
    if (!lastAction) return;
    if (lastAction.kind === "basic-attack") sendStep("basic-attack");
    else sendStep("active", lastAction.action_id);
  };

  const copyJson = async (data: unknown, label: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data ?? {}, null, 2));
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const copyDebugReport = () => {
    const report = {
      champion: config.champion,
      items: config.items,
      runes: config.runes,
      target_profile: config.target_profile,
      endpoint: lastEndpoint,
      last_request: lastRequest,
      last_response: lastResponse,
      current_state: state,
      events_collected: events.length,
      scopes,
      attacker_stats: attackerStats,
      error,
      api_base: COMBAT_API_BASE_URL,
      timestamp: new Date().toISOString(),
    };
    copyJson(report, "Debug report");
  };

  const resetCombat = () => {
    setState(null);
    setEvents([]);
    setScopes({});
    setAttackerStats({});
    setError(null);
    setLastRequest(null);
    setLastResponse(null);
    setLastEndpoint("");
    setLastAction(null);
    try {
      localStorage.removeItem(SANDBOX_STORAGE_KEY);
    } catch {}
    toast({ title: "Combat reset", description: "Sandbox state cleared." });
  };

  const offline = apiStatus === "offline";

  const metaFallback =
    !metaLoading &&
    (champions.length === 0 || items.length === 0 || runes.length === 0);

  const scopeOptions = useMemo(() => {
    const set = new Set<string>(["PRIMARY"]);
    for (const k of Object.keys(scopes)) set.add(k);
    return Array.from(set);
  }, [scopes]);

  // Track previous runtime state to highlight changed keys after an action.
  const prevStatesRef = useRef<Record<string, unknown>>({});
  const currentStates = useMemo(() => {
    if (!state) return {} as Record<string, unknown>;
    const s: any = state;
    return (s.states && typeof s.states === "object" ? s.states : s) as Record<string, unknown>;
  }, [state]);
  const changedKeys = useMemo(() => {
    const out = new Set<string>();
    const prev = prevStatesRef.current || {};
    for (const [k, v] of Object.entries(currentStates)) {
      if (prev[k] !== v) out.add(k);
    }
    return out;
  }, [currentStates]);
  useEffect(() => {
    prevStatesRef.current = currentStates;
  }, [currentStates]);

  return (
    <div className="space-y-6">
      {/* TOP: Build Configuration + Champion Profile + Live Stats */}
      <div className="grid gap-6 lg:grid-cols-7">
        <div className="space-y-6 lg:col-span-2">
        <SectionCard title="Build Configuration" icon={Swords}>
          <div className="space-y-3">
            <SearchSelect
              label="Champion"
              placeholder="Select champion…"
              value={config.champion}
              options={champions}
              onChange={(v) => update("champion", v)}
              loading={metaLoading}
              withIcons
            />
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Level
                </Label>
                {(config.stats?.LEVEL ?? 18) >= 19 && (
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-500/40 text-amber-400 bg-amber-500/10">
                    Extended
                  </Badge>
                )}
              </div>
              <Input
                type="number"
                min={1}
                max={20}
                value={config.stats?.LEVEL ?? 18}
                onChange={(e) => {
                  const lvl = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                  update("stats", { ...(config.stats || {}), LEVEL: lvl });
                }}
              />
            </div>
            <SearchSelect
              label="Target profile"
              placeholder="Select target…"
              value={config.target_profile}
              options={targets}
              onChange={(v) => update("target_profile", v)}
              loading={metaLoading}
            />
            <MultiSelect
              label="Items (max 6)"
              placeholder="Select items…"
              values={config.items}
              options={items}
              onChange={(v) => update("items", v)}
              max={6}
              loading={metaLoading}
              withIcons
            />
            <MultiSelect
              label="Runes"
              placeholder="Select runes…"
              values={config.runes}
              options={runes}
              onChange={(v) => update("runes", v)}
              grouped
              loading={metaLoading}
              withIcons
            />
            <SummonerPicker
              options={summoners}
              values={summonerPicks}
              onChange={setSummonerPicks}
              loading={metaLoading}
            />
            {devMode ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Developer Overrides
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">AD</Label>
                    <Input
                      type="number"
                      value={config.ad ?? 0}
                      onChange={(e) => update("ad", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">AS</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={config.attack_speed ?? 0}
                      onChange={(e) => update("attack_speed", Number(e.target.value))}
                    />
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Overrides are merged on top of backend runtime_stats when sending actions.
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-2 text-[10px] text-muted-foreground">
                Stats come from backend build-preview. Toggle Developer mode below to override AD / AS manually.
              </div>
            )}
            <div>
              <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">Crit mode</Label>
              <div className="flex flex-wrap gap-1.5">
                {critModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => update("crit_mode", m as CritMode)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      config.crit_mode === m
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <ChampionProfile
            championId={config.champion}
            championLabel={champions.find((c) => (c.id ?? c.name) === config.champion)?.name}
          />
        </div>

        <div className="lg:col-span-3">
          <LiveStatsPanel
            config={config}
            summonerPicks={summonerPicks}
            combatState={state}
            runtimeAttackerStats={attackerStats}
            runtimeStates={currentStates}
            changedKeys={changedKeys}
            onPreviewStats={(b, r) => {
              setPreviewBuildStats(b);
              setPreviewRuntimeStats(r);
            }}
          />
        </div>
      </div>

      {/* BELOW: everything else, full width */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <SectionCard
          title="Actions"
          icon={Hand}
          className="h-full"
          right={
            <Button size="sm" variant="outline" onClick={resetCombat} className="h-7 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Reset Combat
            </Button>
          }
        >
          <div className="space-y-2">
            {config.champion && (
              <div className="text-[11px] text-muted-foreground">
                Showing actions for{" "}
                <span className="font-medium text-foreground/80">{config.champion}</span>
              </div>
            )}
            <ActionButton
              label="Basic Attack"
              hint="Auto-attack the primary target"
              icon={Swords}
              tone="primary"
              busy={busy === "basic-attack"}
              disabled={!!busy || offline}
              onClick={() => sendStep("basic-attack")}
            />
            {visibleActions.length > 0 && (
              <div className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
                <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active target scope
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {scopeOptions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setActiveTargetScope(s)}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        activeTargetScope === s
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {config.champion === "Sylas" && (
              <div className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2">
                <Label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Hijack target
                </Label>
                <Input
                  value={hijackTarget}
                  onChange={(e) => setHijackTarget(e.target.value)}
                  placeholder="Malphite"
                  className="h-8 text-xs"
                />
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Champion to hijack ultimate from. Defaults to Malphite if empty.
                </div>
              </div>
            )}
            {actionsLoading && (
              <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-3 text-xs text-muted-foreground">
                Loading champion actions…
              </div>
            )}
            {!actionsLoading && config.champion && !hasChampionSpecificActions && (
              <div className="rounded-md border border-dashed border-border/50 bg-background/30 p-3 text-xs text-muted-foreground">
                No special runtime actions for this champion.
              </div>
            )}
            {visibleActions.map((a) => (
              <ActionButton
                key={a.id}
                label={a.label || a.name || a.id}
                hint={a.description}
                icon={Flame}
                tone="accent"
                busy={busy === a.id}
                disabled={!!busy || offline}
                onClick={() => sendStep("active", a.id, a.extra)}
              />
            ))}
          </div>
        </SectionCard>
        <DamageBreakdownPanel events={events} className="h-full" />
        </div>
        {offline && (
          <Card className="border-destructive/40 bg-destructive/10">
            <CardContent className="flex items-start gap-3 p-4 text-sm">
              <WifiOff className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-destructive">Backend offline</div>
                <div className="mt-1 text-xs text-foreground/80 break-all">
                  Couldn't reach <span className="font-mono">{COMBAT_API_BASE_URL}</span>.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {metaFallback && !offline && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="flex items-start gap-3 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-amber-300">Metadata partially unavailable</div>
                <div className="mt-1 text-xs text-foreground/80">
                  Backend metadata endpoints returned empty results. Champion / item / rune
                  selectors may be missing entries.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-card/40 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            <span>Developer mode</span>
            <span className="text-[10px] text-muted-foreground/70">— raw request / response</span>
          </div>
          <button
            type="button"
            onClick={() => setDevMode((v) => !v)}
            className={`rounded-full border px-3 py-0.5 text-[11px] font-semibold transition-colors ${
              devMode
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
            }`}
          >
            {devMode ? "ON" : "OFF"}
          </button>
        </div>

        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="flex items-start gap-3 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-destructive">Action failed</div>
                <div className="mt-1 text-foreground/80 break-words">{error}</div>
                {lastEndpoint && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Endpoint: <span className="font-mono">{lastEndpoint}</span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {lastAction && (
                    <Button size="sm" variant="outline" onClick={retryLast} disabled={!!busy}>
                      <RotateCcw className="h-3.5 w-3.5" /> Retry
                    </Button>
                  )}
                  {devMode && lastRequest && (
                    <Button size="sm" variant="outline" onClick={() => copyJson(lastRequest, "Last request")}>
                      <Copy className="h-3.5 w-3.5" /> Copy request
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <TargetsPanel scopes={scopes} state={state} />

        <RuntimeStatePanel state={state} changedKeys={changedKeys} />

        <CombatHeader events={events} state={state} />

        <SandboxTimeline events={events} containerRef={timelineRef} />

        {devMode && (
          <>
            <DeveloperPanel
              endpoint={lastEndpoint}
              request={lastRequest}
              response={lastResponse}
              state={state}
              onCopyRequest={() => copyJson(lastRequest, "Last request")}
              onCopyResponse={() => copyJson(lastResponse, "Last response")}
              onCopyState={() => copyJson(state, "Current state")}
              onCopyReport={copyDebugReport}
            />
            <EngineCoveragePanel devMode={devMode} />
            <ChampionConfidencePanel devMode={devMode} />
          </>
        )}

        {state && (
          <FinalStatePanel state={state as Record<string, unknown>} />
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  icon: Icon,
  tone = "primary",
  busy,
  disabled,
  onClick,
}: {
  label: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "primary" | "accent";
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneCls =
    tone === "accent"
      ? "border-accent/40 bg-gradient-to-br from-accent/15 to-accent/0 text-accent hover:border-accent/70"
      : "border-primary/40 bg-gradient-to-br from-primary/15 to-primary/0 text-primary hover:border-primary/70";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-[0_0_20px_-8px_hsl(var(--primary)/0.5)] disabled:cursor-not-allowed disabled:opacity-50 ${toneCls}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/30 bg-background/30">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-foreground">{label}</span>
        {hint && (
          <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

/* ─────────────── Targets ─────────────── */

const TARGET_SLOTS: { key: string; label: string; sub: string }[] = [
  { key: "PRIMARY", label: "Primary Target", sub: "Main focus" },
  { key: "RUNAANS_BOLT_1", label: "Runaan's Bolt 1", sub: "Secondary" },
  { key: "RUNAANS_BOLT_2", label: "Runaan's Bolt 2", sub: "Secondary" },
];

function pickScope(
  scopes: Record<string, TargetScopeInfo>,
  key: string
): TargetScopeInfo | undefined {
  if (scopes[key]) return scopes[key];
  // tolerate case variants
  const found = Object.entries(scopes).find(
    ([k]) => k.toLowerCase() === key.toLowerCase()
  );
  return found?.[1];
}

function TargetsPanel({
  scopes,
  state,
}: {
  scopes: Record<string, TargetScopeInfo>;
  state: Record<string, unknown> | null;
}) {
  return (
    <SectionCard title="Targets" icon={TargetIcon}>
      <div className="grid gap-3 sm:grid-cols-3">
        {TARGET_SLOTS.map((slot) => {
          const data = pickScope(scopes, slot.key) || deriveScopeFromState(state, slot.key);
          return <TargetCard key={slot.key} slot={slot} data={data} />;
        })}
      </div>
    </SectionCard>
  );
}

const SCOPE_STATE_PREFIX: Record<string, string> = {
  PRIMARY: "TARGET",
  RUNAANS_BOLT_1: "RUNAANS_BOLT_1_TARGET",
  RUNAANS_BOLT_2: "RUNAANS_BOLT_2_TARGET",
};

function deriveScopeFromState(
  state: Record<string, unknown> | null,
  scopeKey: string
): TargetScopeInfo | undefined {
  if (!state) return undefined;
  const states = (state as any).states && typeof (state as any).states === "object"
    ? ((state as any).states as Record<string, unknown>)
    : (state as Record<string, unknown>);
  const prefix = SCOPE_STATE_PREFIX[scopeKey];
  if (!prefix) return undefined;
  const hpKey = `${prefix}_REMAINING_HP`;
  const maxKey = `${prefix}_MAX_HP`;
  const hp = typeof states[hpKey] === "number" ? (states[hpKey] as number) : undefined;
  const max = typeof states[maxKey] === "number" ? (states[maxKey] as number) : undefined;
  if (hp == null && max == null) return undefined;
  const pct = hp != null && max != null && max > 0 ? (hp / max) * 100 : undefined;
  return {
    current_hp: hp,
    max_hp: max,
    remaining_pct: pct,
    status: hp != null && hp <= 0 ? "dead" : "active",
  };
}

function TargetCard({
  slot,
  data,
}: {
  slot: { key: string; label: string; sub: string };
  data?: TargetScopeInfo;
}) {
  const inactive = !data;
  const hp = typeof data?.current_hp === "number" ? data!.current_hp! : null;
  const max = typeof data?.max_hp === "number" ? data!.max_hp! : null;
  const pct =
    typeof data?.remaining_pct === "number"
      ? data!.remaining_pct!
      : hp != null && max != null && max > 0
      ? (hp / max) * 100
      : null;
  const status = data?.status || (inactive ? "inactive" : "active");
  const dead = pct != null && pct <= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-lg border p-3 backdrop-blur-sm transition ${
        inactive
          ? "border-dashed border-border/50 bg-background/30 opacity-60"
          : dead
          ? "border-destructive/50 bg-destructive/10"
          : "border-border/60 bg-card/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Crosshair className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {slot.key}
            </span>
          </div>
          <div className="mt-0.5 truncate text-sm font-bold text-foreground">{slot.label}</div>
        </div>
        <Badge
          variant="outline"
          className={`text-[9px] uppercase tracking-wider ${
            dead
              ? "border-destructive/50 text-destructive"
              : inactive
              ? "border-border/50 text-muted-foreground"
              : "border-emerald-500/40 text-emerald-400"
          }`}
        >
          {dead ? "dead" : status}
        </Badge>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">HP</span>
          <span className="font-mono tabular-nums text-foreground">
            {hp != null && max != null
              ? `${Math.max(0, Math.round(hp))} / ${Math.round(max)}`
              : "—"}
          </span>
        </div>
        <Progress
          value={pct != null ? Math.max(0, Math.min(100, pct)) : 0}
          className={`h-1.5 ${dead ? "[&>div]:bg-destructive" : ""}`}
        />
        <div className="text-right text-[10px] text-muted-foreground tabular-nums">
          {pct != null ? `${pct.toFixed(1)}%` : "—"}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────── Runtime State ─────────────── */

function RuntimeStatePanel({
  state,
  changedKeys,
}: {
  state: Record<string, unknown> | null;
  changedKeys?: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => extractRuntimeStateEntries(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (e) => e.key.toLowerCase().includes(q) || e.label.toLowerCase().includes(q)
    );
  }, [all, query]);
  const grouped = useMemo(() => groupRuntimeEntries(filtered), [filtered]);
  return (
    <SectionCard
      title="Runtime State"
      icon={Layers}
      right={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {all.length} keys
        </span>
      }
    >
      {!state ? (
        <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
          Perform an action to start tracking state.
        </div>
      ) : (
        <div className="space-y-3">
          {all.length > 6 && (
            <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter state keys…"
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-muted-foreground">
              No matches.
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.label}>
                  <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="h-px flex-1 bg-border/60" />
                    <span className="font-semibold">{g.label}</span>
                    <span className="text-muted-foreground/70">{g.entries.length}</span>
                    <span className="h-px flex-1 bg-border/60" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {g.entries.map((e) => (
                      <StateCard
                        key={e.key}
                        entry={e}
                        changed={changedKeys?.has(e.key)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

type RuntimeEntry = {
  key: string;
  label: string;
  value: number | string;
  max?: number;
  raw?: unknown;
};

function humanizeKey(k: string) {
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bGuinsoo\b/i, "Guinsoo")
    .replace(/\bKaisa\b/i, "Kai'Sa")
    .replace(/\bKalista\b/i, "Kalista")
    .replace(/\bYi\b/i, "Yi");
}

const RUNTIME_SKIP_TOP = new Set([
  "timeline",
  "events",
  "remaining_by_scope",
  "attacker_stats",
  "config",
  "scopes",
]);

function extractRuntimeStateEntries(
  state: Record<string, unknown> | null
): RuntimeEntry[] {
  if (!state) return [];
  const out: RuntimeEntry[] = [];
  // Prefer state.states if present (canonical backend shape).
  const statesObj =
    (state as any).states && typeof (state as any).states === "object"
      ? ((state as any).states as Record<string, unknown>)
      : null;
  const pushLeaf = (key: string, v: unknown) => {
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      out.push({
        key,
        label: humanizeKey(key),
        value: typeof v === "boolean" ? (v ? "yes" : "no") : (v as number | string),
      });
    }
  };
  if (statesObj) {
    for (const [k, v] of Object.entries(statesObj)) pushLeaf(k, v);
  } else {
    const visit = (obj: unknown, prefix = "") => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (prefix === "" && RUNTIME_SKIP_TOP.has(k.toLowerCase())) continue;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          visit(v, key);
        } else {
          pushLeaf(key, v);
        }
      }
    };
    visit(state);
  }
  // Sort: important patterns first.
  const importance = (k: string) => {
    const u = k.toUpperCase();
    if (/SILVER_BOLTS|KAISA_PLASMA|VARUS_BLIGHT|KALISTA_REND|DIANA_MOONSILVER|MASTERYI_DOUBLE_STRIKE|GUINSOO|RUNAANS_BOLT/.test(u)) return 0;
    if (/STACK|COUNT|CHARGES|READY|PHANTOM/.test(u)) return 1;
    return 2;
  };
  out.sort((a, b) => {
    const d = importance(a.key) - importance(b.key);
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });
  return out;
}

function StateCard({ entry, changed }: { entry: RuntimeEntry; changed?: boolean }) {
  const numeric = typeof entry.value === "number";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-md border p-2.5 transition-colors ${
        changed
          ? "border-primary/60 bg-primary/10 shadow-[0_0_18px_-6px_hsl(var(--primary)/0.6)]"
          : "border-border/60 bg-gradient-to-br from-primary/5 to-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {entry.label}
        </span>
        {changed ? (
          <span className="rounded-sm border border-primary/50 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-primary">
            new
          </span>
        ) : numeric ? (
          <Layers className="h-3 w-3 text-primary/70" />
        ) : null}
      </div>
      <div className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
        {numeric ? (entry.value as number).toString() : String(entry.value)}
      </div>
    </motion.div>
  );
}

/* ─────────────── Sandbox Timeline ─────────────── */

function getEventScope(e: TimelineEvent): string | null {
  const s = (e as any).target_scope || (e as any).scope || (e as any).target;
  return typeof s === "string" ? s : null;
}

function isPhantomHit(e: TimelineEvent): boolean {
  const name = getEventLabel(e).toLowerCase();
  if (name.includes("phantom")) return true;
  return Boolean((e as any).phantom || (e as any).is_phantom);
}

function scopeBadge(scope: string) {
  const upper = scope.toUpperCase();
  if (upper.startsWith("RUNAAN"))
    return { label: upper.replace("RUNAANS_", "BOLT "), cls: "border-cyan-500/40 text-cyan-300" };
  if (upper === "PRIMARY")
    return { label: "PRIMARY", cls: "border-amber-500/40 text-amber-300" };
  return { label: upper, cls: "border-border text-muted-foreground" };
}

function SandboxTimeline({
  events,
  containerRef,
}: {
  events: TimelineEvent[];
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  type Filter = "all" | "damage" | "champion" | "item" | "rune" | "state";
  const [filter, setFilter] = useState<Filter>("all");
  const classify = (e: TimelineEvent): Filter[] => {
    const tags: Filter[] = [];
    if (typeof getEventDamage(e) === "number" && (getEventDamage(e) as number) > 0) tags.push("damage");
    const src = (e.source || (e as any).type || "").toString().toLowerCase();
    const name = getEventLabel(e).toLowerCase();
    if (/rune|electrocute|conqueror|press_the_attack|lethal/.test(src + " " + name)) tags.push("rune");
    if (/item|guinsoo|runaan|kraken|botrk|bork|ie|infinity|shadowflame|lichbane/.test(src + " " + name)) tags.push("item");
    if (/champion|q_cast|w_cast|e_cast|r_cast|silver_bolts|plasma|blight|rend|moonsilver|double_strike/.test(src + " " + name)) tags.push("champion");
    if (/state|stack|charge|proc/.test(name)) tags.push("state");
    return tags;
  };
  const filtered = filter === "all" ? events : events.filter((e) => classify(e).includes(filter));
  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "damage", label: "Damage" },
    { id: "champion", label: "Champion" },
    { id: "item", label: "Item" },
    { id: "rune", label: "Rune" },
    { id: "state", label: "State" },
  ];
  return (
    <SectionCard
      title="Combat Timeline"
      icon={Timer}
      right={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {filtered.length}/{events.length} events
        </span>
      }
    >
      {events.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Filter className="h-3 w-3 text-muted-foreground" />
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                filter === f.id
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-background/40 px-3 py-8 text-center text-xs text-muted-foreground">
          No combat yet — press Basic Attack or an active to begin.
        </div>
      ) : (
        <div
          ref={containerRef}
          className="max-h-[460px] overflow-y-auto pr-1"
        >
          <ol className="relative space-y-2 border-l border-border/60 pl-4">
            {filtered.map((e, i) => {
              const t = getEventTime(e);
              const name = getEventLabel(e);
              const dmg = getEventDamage(e);
              const isDamage = dmg != null && dmg > 0;
              const tone = damageTypeTone(e.damage_type);
              const scope = getEventScope(e);
              const phantom = isPhantomHit(e);
              const meta = extractEventMetadata(e);
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className={`relative rounded-md border p-2.5 ${
                    phantom
                      ? "border-violet-500/40 bg-violet-500/5"
                      : isDamage
                      ? `${tone.border} ${tone.bg}`
                      : "border-border/50 bg-muted/10"
                  }`}
                >
                  <span
                    className={`absolute -left-[21px] top-3 h-2 w-2 rounded-full ring-2 ring-background ${
                      phantom ? "bg-violet-400" : isDamage ? tone.dot : "bg-muted-foreground/50"
                    }`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {Number(t).toFixed(2)}s
                      </span>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {name}
                      </span>
                      {e.source && (
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                          · {e.source}
                        </span>
                      )}
                      {isDamage && tone.label && (
                        <span className={`rounded-sm border px-1 py-px text-[9px] font-bold tracking-wider ${tone.border} ${tone.text}`}>
                          {tone.label}
                        </span>
                      )}
                      {scope && (() => {
                        const sb = scopeBadge(scope);
                        return (
                          <span className={`rounded-sm border px-1 py-px text-[9px] font-bold tracking-wider ${sb.cls}`}>
                            {sb.label}
                          </span>
                        );
                      })()}
                      {phantom && (
                        <span className="rounded-sm border border-violet-500/40 px-1 py-px text-[9px] font-bold tracking-wider text-violet-300">
                          PHANTOM HIT
                        </span>
                      )}
                    </div>
                    {dmg != null && (
                      <span
                        className={`font-mono text-sm font-bold tabular-nums ${
                          isDamage ? tone.text : "text-muted-foreground"
                        }`}
                      >
                        {isDamage ? "−" : ""}
                        {dmg.toFixed(1)}
                      </span>
                    )}
                  </div>
                  {e.notes && (
                    <div className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {e.notes}
                    </div>
                  )}
                  {meta.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {meta.map((m) => (
                        <span
                          key={m.key}
                          className="rounded border border-border/50 bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          <span className="text-foreground/70">{m.key}:</span>{" "}
                          <span className="font-mono">{m.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </motion.li>
              );
            })}
          </ol>
        </div>
      )}
    </SectionCard>
  );
}

const META_SKIP = new Set([
  "time",
  "t",
  "timestamp",
  "event",
  "name",
  "type",
  "icon",
  "damage",
  "final_damage",
  "damage_type",
  "source",
  "notes",
  "target_scope",
  "scope",
  "target",
  "phantom",
  "is_phantom",
]);

function extractEventMetadata(e: TimelineEvent): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (META_SKIP.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "number") out.push({ key: k, value: v.toString() });
    else if (typeof v === "string") out.push({ key: k, value: v });
    else if (typeof v === "boolean") out.push({ key: k, value: v ? "yes" : "no" });
  }
  return out.slice(0, 6);
}

/* ─────────────── Future chart placeholders ─────────────── */

function FuturePanels() {
  // unchanged
  return <FuturePanelsInner />;
}

function DeveloperPanel({
  endpoint,
  request,
  response,
  state,
  onCopyRequest,
  onCopyResponse,
  onCopyState,
  onCopyReport,
}: {
  endpoint: string;
  request: unknown;
  response: unknown;
  state: Record<string, unknown> | null;
  onCopyRequest: () => void;
  onCopyResponse: () => void;
  onCopyState: () => void;
  onCopyReport: () => void;
}) {
  return (
    <SectionCard
      title="Developer Mode"
      icon={Activity}
      right={
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onCopyReport}>
            <Copy className="h-3 w-3" /> Debug report
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {endpoint && (
          <div className="text-[11px] text-muted-foreground">
            Last endpoint: <span className="font-mono text-foreground/90">{endpoint}</span>
          </div>
        )}
        <DevJsonBlock label="Last Request" data={request} onCopy={onCopyRequest} />
        <DevJsonBlock label="Last Response" data={response} onCopy={onCopyResponse} />
        <DevJsonBlock label="Current State" data={state} onCopy={onCopyState} />
      </div>
    </SectionCard>
  );
}

function DevJsonBlock({
  label,
  data,
  onCopy,
}: {
  label: string;
  data: unknown;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50">
      <div className="flex items-center justify-between border-b border-border/50 px-2.5 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-2.5 py-2 text-[10px] leading-snug text-foreground/90">
        {data == null ? "—" : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function FuturePanelsInner() {
  const slots = [
    { label: "Damage Breakdown", icon: BarChart3 },
    { label: "Damage Sources", icon: PieChart },
    { label: "DPS Graph", icon: LineChart },
    { label: "Damage Timeline", icon: Activity },
  ];
  return (
    <SectionCard title="Analytics (coming soon)" icon={BarChart3}>
      <div className="grid gap-2 sm:grid-cols-2">
        {slots.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-md border border-dashed border-border/50 bg-background/30 p-3"
          >
            <s.icon className="h-4 w-4 text-primary/60" />
            <div>
              <div className="text-xs font-semibold text-foreground/80">{s.label}</div>
              <div className="text-[10px] text-muted-foreground">Wiring up to combat events…</div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/* ─────────────── Metadata Audit (Phase 1) ─────────────── */

function MetadataAuditPanel({
  loading,
  apiStatus,
  champions,
  items,
  runes,
  targets,
  summoners,
  actions,
}: {
  loading: boolean;
  apiStatus: ApiStatus;
  champions: Champion[];
  items: Item[];
  runes: Rune[];
  targets: TargetProfile[];
  summoners: Summoner[];
  actions: CombatAction[];
}) {
  const [open, setOpen] = useState(false);
  const rows: { label: string; count: number; icon: React.ElementType }[] = [
    { label: "Champions", count: champions.length, icon: Swords },
    { label: "Items", count: items.length, icon: Sparkles },
    { label: "Runes", count: runes.length, icon: Flame },
    { label: "Summoners", count: summoners.length, icon: Wand2 },
    { label: "Target Profiles", count: targets.length, icon: TargetIcon },
    { label: "Actions", count: actions.length, icon: Hand },
  ];
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <Card className="mb-6 border-border/60 bg-card/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" />
          Metadata Audit
          <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            {loading ? "loading…" : apiStatus === "offline" ? "offline" : `${total} entries`}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
              {rows.map((r) => {
                const empty = !loading && r.count === 0;
                return (
                  <div
                    key={r.label}
                    className={`rounded-md border px-3 py-2 ${
                      empty
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border/60 bg-background/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <r.icon className="h-3 w-3" />
                      {r.label}
                    </div>
                    <div
                      className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${
                        empty ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {loading ? "…" : r.count}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ─────────────── Summoner picker (Phase 2) ─────────────── */

function SummonerPicker({
  options,
  values,
  onChange,
  loading,
}: {
  options: Summoner[];
  values: string[];
  onChange: (v: string[]) => void;
  loading: boolean;
}) {
  const toggle = (name: string) => {
    if (values.includes(name)) {
      onChange(values.filter((v) => v !== name));
    } else if (values.length < 2) {
      onChange([...values, name]);
    } else {
      onChange([values[1], name]);
    }
  };
  return (
    <div>
      <Label className="mb-1.5 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Wand2 className="h-3 w-3" />
        Summoner spells (max 2)
      </Label>
      {loading ? (
        <Skeleton className="h-8 w-full" />
      ) : options.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
          No summoner metadata returned.
        </div>
      ) : (
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-border/50 bg-background/40 p-2">
          {options.map((s) => {
            const active = values.includes(s.name);
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => toggle(s.name)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      {values.length > 0 && (
        <div className="mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Selected: <span className="text-foreground">{values.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Combat header (Phase 3) ─────────────── */

function CombatHeader({
  events,
  state,
}: {
  events: TimelineEvent[];
  state: Record<string, unknown> | null;
}) {
  const lastTime = events.length > 0 ? getEventTime(events[events.length - 1]) : 0;
  const stateTime = state && typeof (state as any).current_time === "number"
    ? ((state as any).current_time as number)
    : (state as any)?.states && typeof (state as any).states.CURRENT_TIME === "number"
    ? ((state as any).states.CURRENT_TIME as number)
    : null;
  const totalDamage = events.reduce((a, e) => {
    const d = getEventDamage(e);
    return typeof d === "number" && d > 0 ? a + d : a;
  }, 0);
  const stats: { label: string; value: string; icon: React.ElementType }[] = [
    { label: "Combat Time", value: `${(stateTime ?? lastTime).toFixed(2)}s`, icon: Timer },
    { label: "Events", value: String(events.length), icon: Activity },
    { label: "Damage", value: totalDamage.toFixed(1), icon: Flame },
    {
      label: "State Keys",
      value: state
        ? String(
            ((state as any).states && typeof (state as any).states === "object"
              ? Object.keys((state as any).states)
              : Object.keys(state)
            ).length
          )
        : "0",
      icon: Layers,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border/60 bg-gradient-to-br from-primary/5 to-transparent px-3 py-2"
        >
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <s.icon className="h-3 w-3" />
            {s.label}
          </div>
          <div className="mt-0.5 font-mono text-base font-bold tabular-nums text-foreground">
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Live Stats (Phase 2A) ─────────────── */

type LiveStatDef = {
  key: string;        // canonical key (uppercase, underscored)
  label: string;      // friendly label
  aliases?: string[]; // alternate keys to look up in stat sources
  fmt?: "int" | "float" | "pct";
};

const LIVE_STAT_DEFS: LiveStatDef[] = [
  { key: "HP", label: "HP", aliases: ["HEALTH", "MAX_HP"], fmt: "int" },
  { key: "MANA", label: "Mana", aliases: ["MP", "MAX_MANA"], fmt: "int" },
  { key: "AD", label: "Attack Damage", aliases: ["ATTACK_DAMAGE"], fmt: "int" },
  { key: "BONUS_AD", label: "Bonus AD", aliases: ["BONUS AD"], fmt: "int" },
  { key: "AP", label: "Ability Power", aliases: ["ABILITY_POWER"], fmt: "int" },
  { key: "ATTACK_SPEED", label: "Attack Speed", aliases: ["ATTACK_SPEED_RATIO", "AS"], fmt: "float" },
  { key: "CRIT_CHANCE", label: "Crit Chance", aliases: ["CRIT", "CRITICAL_STRIKE_CHANCE"], fmt: "pct" },
  { key: "CRIT_DAMAGE", label: "Crit Damage", aliases: ["CRITICAL_DAMAGE"], fmt: "pct" },
  { key: "ARMOR", label: "Armor", fmt: "int" },
  { key: "MR", label: "Magic Resist", aliases: ["MAGIC_RESIST"], fmt: "int" },
  { key: "ABILITY_HASTE", label: "Ability Haste", aliases: ["AH", "CDR"], fmt: "int" },
  { key: "MOVE_SPEED", label: "Move Speed", aliases: ["MOVEMENT_SPEED", "MS"], fmt: "int" },
  { key: "ATTACK_RANGE", label: "Attack Range", aliases: ["RANGE"], fmt: "int" },
];

function normalizeStatKey(k: string) {
  return k.toUpperCase().replace(/\s+/g, "_");
}

function lookupStat(
  sources: Array<Record<string, unknown> | undefined>,
  def: LiveStatDef
): number | null {
  const candidates = [def.key, ...(def.aliases || [])].map(normalizeStatKey);
  for (const src of sources) {
    if (!src) continue;
    const map: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) map[normalizeStatKey(k)] = v;
    for (const c of candidates) {
      const v = map[c];
      if (typeof v === "number" && !Number.isNaN(v)) return v;
    }
  }
  return null;
}

function formatStat(v: number | null, fmt?: LiveStatDef["fmt"]): string {
  if (v == null) return "—";
  if (fmt === "pct") return `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;
  if (fmt === "float") return v.toFixed(2).replace(/\.00$/, "");
  return Math.round(v).toString();
}

function LiveStatsPanel({
  config,
  summonerPicks,
  combatState,
  runtimeAttackerStats,
  runtimeStates,
  changedKeys,
  onPreviewStats,
}: {
  config: SimulateRequest;
  summonerPicks: string[];
  combatState: Record<string, unknown> | null;
  runtimeAttackerStats: Record<string, number | string>;
  runtimeStates: Record<string, unknown>;
  changedKeys: Set<string>;
  onPreviewStats?: (build: Record<string, number>, runtime: Record<string, number>) => void;
}) {
  const [mode, setMode] = useState<"build" | "runtime">("build");
  const [devMode, setDevMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<CombatLabBuildPreviewRequest | null>(null);
  const [lastResponse, setLastResponse] = useState<CombatLabBuildPreviewResponse | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  // Per-source preview responses (Dev Mode only). Derived from extra build-preview calls
  // with subsets of the loadout so we can show exactly which group contributed which stat.
  const [itemsOnly, setItemsOnly] = useState<Record<string, number> | null>(null);
  const [runesOnly, setRunesOnly] = useState<Record<string, number> | null>(null);
  const [summOnly, setSummOnly] = useState<Record<string, number> | null>(null);

  const level =
    typeof config.stats?.LEVEL === "number" ? Math.max(1, Math.min(20, config.stats.LEVEL)) : 18;

  const payload: CombatLabBuildPreviewRequest | null = useMemo(() => {
    if (!config.champion) return null;
    return {
      champion_name: config.champion,
      level,
      item_names: config.items || [],
      rune_names: config.runes || [],
      summoner_names: summonerPicks || [],
      base_stats: {},
      state: combatState && typeof combatState === "object" ? combatState : {},
    };
  }, [config.champion, level, config.items, config.runes, summonerPicks, combatState]);

  const payloadKey = useMemo(() => (payload ? JSON.stringify(payload) : ""), [payload]);

  useEffect(() => {
    if (!payload) {
      setLastResponse(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      setLastRequest(payload);
      combatApi
        .buildPreview(payload)
        .then((res) => {
          if (cancelled) return;
          setLastResponse(res);
          if (onPreviewStats) {
            onPreviewStats(
              numericMap(res?.result?.build_stats as any),
              numericMap(res?.result?.runtime_stats as any)
            );
          }
        })
        .catch((e) => {
          if (cancelled) return;
          setLastResponse(null);
          setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [payloadKey, retryNonce]);

  // Dev-mode source breakdown: run extra build-preview calls with subsets.
  // Each subset's build_stats minus base_stats = that group's contribution.
  useEffect(() => {
    if (!devMode || !payload) {
      setItemsOnly(null);
      setRunesOnly(null);
      setSummOnly(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const make = (overrides: Partial<CombatLabBuildPreviewRequest>) => ({
        ...payload,
        item_names: [],
        rune_names: [],
        summoner_names: [],
        state: {},
        ...overrides,
      });
      const tasks: Array<[
        "items" | "runes" | "summ",
        CombatLabBuildPreviewRequest
      ]> = [];
      if ((payload.item_names || []).length)
        tasks.push(["items", make({ item_names: payload.item_names })]);
      if ((payload.rune_names || []).length)
        tasks.push(["runes", make({ rune_names: payload.rune_names })]);
      if ((payload.summoner_names || []).length)
        tasks.push(["summ", make({ summoner_names: payload.summoner_names })]);
      const results = await Promise.allSettled(
        tasks.map(([, req]) => combatApi.buildPreview(req))
      );
      if (cancelled) return;
      const next: Record<string, Record<string, number> | null> = {
        items: null,
        runes: null,
        summ: null,
      };
      results.forEach((r, i) => {
        const tag = tasks[i][0];
        if (r.status === "fulfilled") {
          next[tag] = numericMap(r.value?.result?.build_stats as any);
        }
      });
      setItemsOnly(next.items);
      setRunesOnly(next.runes);
      setSummOnly(next.summ);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [devMode, payloadKey]);

  const buildStats = lastResponse?.result?.build_stats || {};
  const runtimeStats = lastResponse?.result?.runtime_stats || {};
  const baseStats = lastResponse?.result?.base_stats || {};
  const loadoutStats = lastResponse?.result?.loadout_stats || {};
  const hasRuntime = Object.keys(runtimeStats).length > 0;
  const verified = !!lastResponse && Object.keys(buildStats).length > 0 && !error;

  const sources: Array<Record<string, unknown>> =
    mode === "runtime" && hasRuntime ? [runtimeStats] : [buildStats];

  // Identify runtime buff / temp-modifier keys for the runtime view.
  const buffEntries = useMemo(() => {
    const out: { key: string; value: string; changed: boolean }[] = [];
    for (const [k, v] of Object.entries(runtimeStates)) {
      const u = k.toUpperCase();
      if (
        !/BUFF|STACK|CHARGE|CONQUEROR|LETHAL|TEMPO|PROC|RAGEBLADE|EMPOWER|MODIFIER|COUNT|READY|BOLT|BLIGHT|REND|SILVER|PHANTOM|GUINSOO|RUNAAN|KRAKEN|KAISA|VAYNE|VARUS|KALISTA/.test(
          u
        )
      )
        continue;
      if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
        out.push({
          key: humanizeKey(k),
          value: typeof v === "boolean" ? (v ? "yes" : "no") : String(v),
          changed: changedKeys.has(k),
        });
      }
    }
    return out.slice(0, 16);
  }, [runtimeStates, changedKeys]);

  // Per-stat source breakdown for tooltips + Source Breakdown panel.
  const computeBreakdown = (def: LiveStatDef) => {
    const baseV = lookupStat([baseStats], def);
    const itemsV = itemsOnly ? lookupStat([itemsOnly], def) : null;
    const runesV = runesOnly ? lookupStat([runesOnly], def) : null;
    const summV = summOnly ? lookupStat([summOnly], def) : null;
    const buildV = lookupStat([buildStats], def);
    const runtimeV = lookupStat([runtimeStats], def);
    const rows: { label: string; value: number }[] = [];
    if (baseV != null) rows.push({ label: "Champion Base", value: baseV });
    if (itemsV != null && baseV != null && Math.abs(itemsV - baseV) > 0.001)
      rows.push({ label: "Items", value: itemsV - baseV });
    if (runesV != null && baseV != null && Math.abs(runesV - baseV) > 0.001)
      rows.push({ label: "Runes", value: runesV - baseV });
    if (summV != null && baseV != null && Math.abs(summV - baseV) > 0.001)
      rows.push({ label: "Summoners", value: summV - baseV });
    if (
      runtimeV != null &&
      buildV != null &&
      Math.abs(runtimeV - buildV) > 0.001
    )
      rows.push({ label: "Runtime Modifiers", value: runtimeV - buildV });
    return { rows, buildV, runtimeV };
  };

  const tooltipFor = (def: LiveStatDef): string => {
    const { rows, buildV, runtimeV } = computeBreakdown(def);
    if (!rows.length) return `${def.label}: backend source unavailable`;
    const lines = rows.map(
      (r) =>
        `${r.label}: ${r.value >= 0 ? "+" : ""}${formatStat(r.value, def.fmt)}`
    );
    if (buildV != null) lines.push(`Build total: ${formatStat(buildV, def.fmt)}`);
    if (runtimeV != null && buildV != null && Math.abs(runtimeV - buildV) > 0.001)
      lines.push(`Runtime: ${formatStat(runtimeV, def.fmt)}`);
    return `${def.label}\n${lines.join("\n")}`;
  };

  return (
    <SectionCard
      title="Live Stats"
      icon={Activity}
      right={
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              verified
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                : "border-amber-500/50 bg-amber-500/10 text-amber-400"
            }`}
            title={
              verified
                ? "Stats sourced from POST /api/combat-lab/build-preview"
                : "Backend preview unavailable — UI is showing fallback / cached values"
            }
          >
            {verified ? "Backend Verified" : "Fallback Values"}
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <button
            type="button"
            onClick={() => setDevMode((v) => !v)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              devMode
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
            }`}
            title="Toggle Developer Mode"
          >
            Dev
          </button>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/40 p-0.5">
            {(["build", "runtime"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                disabled={m === "runtime" && !hasRuntime}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === m
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "build" ? "Build" : "Runtime"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {!config.champion && (
        <div className="mb-3 rounded-md border border-dashed border-border/50 bg-background/30 px-3 py-4 text-center text-xs text-muted-foreground">
          Select a champion to load real build stats from the backend.
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-bold uppercase tracking-wider text-destructive">
              Build preview failed
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => setRetryNonce((n) => n + 1)}
            >
              <RotateCcw className="h-3 w-3" /> Retry
            </Button>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            POST {COMBAT_API_BASE_URL}/api/combat-lab/build-preview
          </div>
          <div className="mt-1 font-mono text-[11px] text-destructive/90 break-all">{error}</div>
          {lastRequest && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] text-muted-foreground">
                Request payload
              </summary>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-tight">
                {JSON.stringify(lastRequest, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {LIVE_STAT_DEFS.map((def) => {
          const v = lookupStat(sources, def);
          const isChanged =
            mode === "runtime" &&
            [def.key, ...(def.aliases || [])].some((k) =>
              changedKeys.has(normalizeStatKey(k))
            );
          // Build → Runtime delta indicator (shown in build mode when runtime differs).
          const buildV = lookupStat([buildStats], def);
          const runtimeV = lookupStat([runtimeStats], def);
          const showDelta =
            mode === "build" &&
            hasRuntime &&
            buildV != null &&
            runtimeV != null &&
            Math.abs(buildV - runtimeV) > 0.001;
          const positive = showDelta && (runtimeV as number) > (buildV as number);
          return (
            <div
              key={def.key}
              title={tooltipFor(def)}
              className={`rounded-md border px-2 py-1.5 transition-colors ${
                isChanged
                  ? "border-primary/60 bg-primary/10"
                  : v == null
                  ? "border-border/40 bg-background/20 opacity-70"
                  : "border-border/50 bg-background/40"
              }`}
            >
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {def.label}
              </div>
              <div className="font-mono text-sm font-bold tabular-nums text-foreground">
                {formatStat(v, def.fmt)}
              </div>
              {showDelta && (
                <div className="mt-0.5 flex items-center gap-1 font-mono text-[10px] tabular-nums">
                  <span className="text-muted-foreground/80">
                    {formatStat(buildV, def.fmt)}
                  </span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className={positive ? "text-emerald-400" : "text-amber-400"}>
                    {formatStat(runtimeV, def.fmt)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {devMode && verified && (
        <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Source Breakdown
            </div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              backend-derived
            </div>
          </div>
          <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {LIVE_STAT_DEFS.map((def) => {
              const { rows, buildV } = computeBreakdown(def);
              if (!rows.length) return null;
              return (
                <div
                  key={def.key}
                  className="rounded border border-border/40 bg-background/30 p-1.5"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/80">
                      {def.label}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {buildV != null ? `= ${formatStat(buildV, def.fmt)}` : ""}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {rows.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center justify-between font-mono text-[10px] tabular-nums"
                      >
                        <span className="text-muted-foreground">{r.label}</span>
                        <span
                          className={
                            r.label === "Champion Base"
                              ? "text-foreground/80"
                              : r.value >= 0
                              ? "text-emerald-400"
                              : "text-amber-400"
                          }
                        >
                          {r.label === "Champion Base"
                            ? formatStat(r.value, def.fmt)
                            : `${r.value >= 0 ? "+" : ""}${formatStat(r.value, def.fmt)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[9px] text-muted-foreground">
            Contributions derived from extra build-preview calls per group (Items / Runes / Summoners). No
            stats calculated client-side.
          </div>
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Runtime effects
        </div>
        {buffEntries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/50 bg-background/30 px-2 py-2 text-[11px] text-muted-foreground">
            No active stacks, buffs, or counters yet. Take an action to populate runtime state.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border/50">
            <table className="w-full text-[10px]">
              <thead className="bg-background/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold">Source</th>
                  <th className="px-2 py-1 text-right font-semibold">Value</th>
                  <th className="px-2 py-1 text-right font-semibold">Stacks</th>
                </tr>
              </thead>
              <tbody>
                {buffEntries.map((b) => {
                  const u = b.key.toUpperCase();
                  const looksLikeStack =
                    /STACK|COUNT|CHARGE|BOLT|REND|PROC/.test(u);
                  return (
                    <tr
                      key={b.key}
                      className={`border-t border-border/40 ${
                        b.changed ? "bg-primary/5" : "bg-background/20"
                      }`}
                    >
                      <td className="px-2 py-1 text-foreground/80">{b.key}</td>
                      <td className="px-2 py-1 text-right font-mono text-foreground">
                        {looksLikeStack ? "—" : b.value}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted-foreground">
                        {looksLikeStack ? b.value : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {mode === "build" && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Real backend build_stats. Updates automatically when champion, level,
          items, runes, or summoners change.
        </div>
      )}
      {devMode && (
        <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-background/40 p-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary">
            Developer Mode
          </div>
          <details open>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              Last request
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-tight">
              {lastRequest ? JSON.stringify(lastRequest, null, 2) : "—"}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              Last response
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-tight">
              {lastResponse ? JSON.stringify(lastResponse, null, 2) : "—"}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              build_stats
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-tight">
              {JSON.stringify(buildStats, null, 2)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              runtime_stats
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px] leading-tight">
              {JSON.stringify(runtimeStats, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </SectionCard>
  );
}

/* ─────────────── Runtime state grouping ─────────────── */

type RuntimeGroup = { label: string; entries: RuntimeEntry[] };

function classifyStateKey(key: string): RuntimeGroup["label"] {
  const u = key.toUpperCase();
  if (/TARGET|RUNAANS_BOLT/.test(u)) return "Target States";
  if (/GUINSOO|RUNAAN|KRAKEN|BOTRK|BORK|IE|INFINITY|SHADOWFLAME|LICHBANE|RAGEBLADE|ITEM/.test(u))
    return "Item States";
  if (/ELECTROCUTE|CONQUEROR|LETHAL|TEMPO|PRESS_THE_ATTACK|RUNE/.test(u))
    return "Rune States";
  if (/CURRENT_TIME|TICK|GLOBAL|SYSTEM/.test(u)) return "System States";
  return "Champion States";
}

const GROUP_ORDER = [
  "Champion States",
  "Item States",
  "Rune States",
  "Target States",
  "System States",
];

function groupRuntimeEntries(entries: RuntimeEntry[]): RuntimeGroup[] {
  const buckets: Record<string, RuntimeEntry[]> = {};
  for (const e of entries) {
    const label = classifyStateKey(e.key);
    (buckets[label] ||= []).push(e);
  }
  return GROUP_ORDER.filter((g) => buckets[g]?.length).map((label) => ({
    label,
    entries: buckets[label],
  }));
}

/* ─────────────── Damage Breakdown (Phase 2A) ─────────────── */

function eventCategory(e: TimelineEvent): "item" | "rune" | "basic" | "champion" {
  const ctx = ((e.source || "") + " " + getEventLabel(e)).toLowerCase();
  if (/rune|electrocute|conqueror|press_the_attack|lethal|tempo/.test(ctx)) return "rune";
  if (/guinsoo|runaan|kraken|botrk|bork|infinity|shadowflame|lichbane|rageblade|item/.test(ctx))
    return "item";
  if (/basic|auto|aa|attack(?!_speed)/.test(ctx)) return "basic";
  return "champion";
}

const CATEGORY_LABELS: Record<string, string> = {
  basic: "Basic Attack",
  champion: "Champion Damage",
  item: "Item Damage",
  rune: "Rune Damage",
};

function DamageBreakdownPanel({ events, className }: { events: TimelineEvent[]; className?: string }) {
  const damageEvents = events.filter(
    (e) => typeof getEventDamage(e) === "number" && (getEventDamage(e) as number) > 0
  );
  const total = damageEvents.reduce((a, e) => a + (getEventDamage(e) as number), 0);

  const bySource = new Map<string, { cat: string; total: number }>();
  const byType = new Map<string, number>();
  for (const e of damageEvents) {
    const dmg = getEventDamage(e) as number;
    const label = getEventLabel(e);
    const cat = eventCategory(e);
    const existing = bySource.get(label);
    if (existing) existing.total += dmg;
    else bySource.set(label, { cat, total: dmg });
    const t = (e.damage_type || "unknown").toString().toLowerCase();
    byType.set(t, (byType.get(t) || 0) + dmg);
  }
  const sources = Array.from(bySource.entries())
    .map(([label, v]) => ({ label, cat: v.cat, total: v.total }))
    .sort((a, b) => b.total - a.total);
  const types = Array.from(byType.entries())
    .map(([type, value]) => ({ type, value }))
    .sort((a, b) => b.value - a.value);

  const typeTone = (t: string) =>
    t === "physical"
      ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
      : t === "magic"
      ? "border-violet-500/40 text-violet-300 bg-violet-500/10"
      : t === "true"
      ? "border-rose-500/40 text-rose-300 bg-rose-500/10"
      : "border-border bg-muted/30 text-muted-foreground";

  return (
    <SectionCard
      title="Damage Breakdown"
      icon={BarChart3}
      className={className}
      right={
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {total > 0 ? `${total.toFixed(1)} total` : "no damage yet"}
        </span>
      }
    >
      {total === 0 ? (
        <div className="rounded-md border border-dashed border-border/50 bg-background/30 px-3 py-6 text-center text-xs text-muted-foreground">
          Damage will appear here as actions occur.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              By Source
            </div>
            <div className="space-y-1.5">
              {sources.map((s) => {
                const pct = (s.total / total) * 100;
                return (
                  <div
                    key={s.label}
                    className="rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-semibold text-foreground">
                          {s.label}
                        </span>
                        <span className="rounded-sm border border-border/60 px-1 py-px text-[9px] uppercase tracking-wider text-muted-foreground">
                          {CATEGORY_LABELS[s.cat] || s.cat}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
                        <span className="text-foreground">{s.total.toFixed(1)}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-1 h-1" />
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              By Type
            </div>
            <div className="space-y-1.5">
              {types.map((t) => {
                const pct = (t.value / total) * 100;
                return (
                  <div
                    key={t.type}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${typeTone(t.type)}`}
                  >
                    <span className="font-bold uppercase tracking-wider">
                      {t.type}
                    </span>
                    <div className="flex items-baseline gap-2 font-mono tabular-nums">
                      <span>{t.value.toFixed(1)}</span>
                      <span className="text-[10px] opacity-80">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ─────────────── Engine Coverage (Developer Mode) ─────────────── */

function EngineCoveragePanel({ devMode }: { devMode: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CoverageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeList, setActiveList] = useState<
    "tested-champions" | "tested-items" | "tested-runes" | "special" | "generic"
  >("tested-champions");

  const fetchCoverage = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await combatApi.coverage();
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load coverage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!devMode) return;
    // Load once when devMode is active and no data/error yet
    if (!data && !error && !loading) {
      fetchCoverage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devMode]);

  const summary = data?.summary;

  const summaryCards = summary
    ? [
        { label: "Champions", value: summary.champion_count },
        { label: "Items", value: summary.item_count },
        { label: "Runes", value: summary.rune_count },
        { label: "Champion Runtime Profiles", value: summary.champion_runtime_profile_count },
        { label: "Item Effects", value: summary.item_effect_count },
        { label: "Rune Effects", value: summary.rune_effect_count },
        { label: "Tested Champions", value: summary.tested_champion_count },
        { label: "Tested Items", value: summary.tested_item_count },
        { label: "Tested Runes", value: summary.tested_rune_count },
        { label: "Special Attention Champions", value: summary.special_champion_count },
        { label: "Generic / Formula-Driven Champions", value: summary.generic_champion_count },
      ]
    : [];

  const q = query.trim().toLowerCase();

  const testedChampions: CoverageChampion[] = useMemo(() => {
    const arr = data?.champions?.special_attention || [];
    const filtered = arr.filter((c) => c.tested);
    if (!q) return filtered;
    return filtered.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, q]);

  const specialChampions: CoverageChampion[] = useMemo(() => {
    const arr = data?.champions?.special_attention || [];
    if (!q) return arr;
    return arr.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, q]);

  const genericChampions: CoverageChampion[] = useMemo(() => {
    const arr = data?.champions?.generic_or_formula_driven || [];
    if (!q) return arr;
    return arr.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, q]);

  const testedItems: string[] = useMemo(() => {
    const arr = data?.items?.tested || [];
    if (!q) return arr;
    return arr.filter((n) => n.toLowerCase().includes(q));
  }, [data, q]);

  const testedRunes: string[] = useMemo(() => {
    const arr = data?.runes?.tested || [];
    if (!q) return arr;
    return arr.filter((n) => n.toLowerCase().includes(q));
  }, [data, q]);

  const listTabs: {
    id: typeof activeList;
    label: string;
    count: number;
  }[] = [
    { id: "tested-champions", label: "Tested Champions", count: testedChampions.length },
    { id: "tested-items", label: "Tested Items", count: testedItems.length },
    { id: "tested-runes", label: "Tested Runes", count: testedRunes.length },
    { id: "special", label: "Special Attention", count: specialChampions.length },
    { id: "generic", label: "Generic / Formula-Driven", count: genericChampions.length },
  ];

  const renderList = () => {
    switch (activeList) {
      case "tested-champions":
        return (
          <div className="space-y-2">
            {testedChampions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No tested champions.</div>
            ) : (
              testedChampions.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5"
                >
                  <span className="text-xs font-semibold text-foreground">{c.name}</span>
                  <Badge variant="outline" className="text-[9px] h-5 border-emerald-500/40 text-emerald-400">
                    Tested
                  </Badge>
                </div>
              ))
            )}
          </div>
        );
      case "tested-items":
        return (
          <div className="flex flex-wrap gap-1.5">
            {testedItems.length === 0 ? (
              <div className="text-xs text-muted-foreground">No tested items.</div>
            ) : (
              testedItems.map((n) => (
                <Chip key={n} label={n} tone="primary" />
              ))
            )}
          </div>
        );
      case "tested-runes":
        return (
          <div className="flex flex-wrap gap-1.5">
            {testedRunes.length === 0 ? (
              <div className="text-xs text-muted-foreground">No tested runes.</div>
            ) : (
              testedRunes.map((n) => (
                <Chip key={n} label={n} tone="accent" />
              ))
            )}
          </div>
        );
      case "special":
        return (
          <div className="space-y-2">
            {specialChampions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No special attention champions.</div>
            ) : (
              specialChampions.map((c) => (
                <div
                  key={c.name}
                  className="rounded-md border border-border/50 bg-background/40 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">{c.name}</span>
                    <div className="flex items-center gap-1.5">
                      {c.status && (
                        <span className="text-[10px] text-muted-foreground">{c.status}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[9px] h-5 ${
                          c.tested
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-amber-500/40 text-amber-400"
                        }`}
                      >
                        {c.tested ? "Tested" : "Untested"}
                      </Badge>
                    </div>
                  </div>
                  {c.special_notes && (
                    <div className="mt-1 text-[10px] text-muted-foreground">{c.special_notes}</div>
                  )}
                  {typeof c.runtime_profile_count === "number" && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Runtime profiles: <span className="font-mono text-foreground/80">{c.runtime_profile_count}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        );
      case "generic":
        return (
          <div className="space-y-2">
            {genericChampions.length === 0 ? (
              <div className="text-xs text-muted-foreground">No generic champions.</div>
            ) : (
              genericChampions.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5"
                >
                  <span className="text-xs font-semibold text-foreground">{c.name}</span>
                  {c.status && (
                    <span className="text-[10px] text-muted-foreground">{c.status}</span>
                  )}
                </div>
              ))
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="h-4 w-4 text-primary" />
          Engine Coverage
          <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            {loading ? "loading…" : error ? "error" : summary ? `${summary.champion_count} entries` : "dev only"}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {error && (
                <Card className="border-destructive/50 bg-destructive/10">
                  <CardContent className="flex items-start gap-3 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-destructive">Coverage endpoint failed</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        GET {COMBAT_API_BASE_URL}/api/combat-lab/audit/coverage
                      </div>
                      <div className="mt-1 text-foreground/80 break-words">{error}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-[11px]"
                        onClick={fetchCoverage}
                        disabled={loading}
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!error && (
                <>
                  {/* Summary cards */}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {loading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))
                      : summaryCards.map((s) => (
                          <div
                            key={s.label}
                            className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
                          >
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {s.label}
                            </div>
                            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                              {s.value}
                            </div>
                          </div>
                        ))}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter coverage lists…"
                      className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* List tabs */}
                  <div className="flex flex-wrap gap-1.5">
                    {listTabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveList(t.id)}
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                          activeList === t.id
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {t.label} ({t.count})
                      </button>
                    ))}
                  </div>

                  {/* Active list */}
                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {listTabs.find((t) => t.id === activeList)?.label}
                    </div>
                    {loading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    ) : (
                      renderList()
                    )}
                  </div>

                  {/* Disclaimer */}
                  <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2 text-[10px] text-muted-foreground">
                    Coverage reflects backend engine metadata and automated regression status.
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ─────────────── Champion Confidence (Developer Mode) ─────────────── */

function tierBadgeCls(tier: string) {
  switch (tier) {
    case "high_confidence":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    case "medium_confidence":
      return "border-blue-500/40 bg-blue-500/10 text-blue-400";
    case "smoke_validated":
      return "border-amber-500/40 bg-amber-500/10 text-amber-400";
    case "needs_review":
      return "border-red-500/40 bg-red-500/10 text-red-400";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function tierLabel(tier: string) {
  switch (tier) {
    case "high_confidence":
      return "High Confidence";
    case "medium_confidence":
      return "Medium Confidence";
    case "smoke_validated":
      return "Smoke Validated";
    case "needs_review":
      return "Needs Review";
    default:
      return tier;
  }
}

function ChampionConfidencePanel({ devMode }: { devMode: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChampionConfidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const fetchConfidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await combatApi.championConfidence();
      setData(res);
    } catch (e: any) {
      setError(e?.message || "Failed to load champion confidence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!devMode) return;
    if (!data && !error && !loading) {
      fetchConfidence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devMode]);

  const summary = data?.summary;

  const summaryCards = summary
    ? [
        { label: "Total Champions", value: summary.total_champions },
        { label: "High Confidence", value: summary.high_confidence },
        { label: "Medium Confidence", value: summary.medium_confidence },
        { label: "Smoke Validated", value: summary.smoke_validated },
        { label: "Needs Review", value: summary.needs_review },
        { label: "Basic Attack Pass", value: summary.basic_attack_pass },
        { label: "Rotation Pass", value: summary.rotation_pass },
      ]
    : [];

  const q = query.trim().toLowerCase();

  const filteredChampions: ChampionConfidence[] = useMemo(() => {
    const arr = data?.champions || [];
    if (!q) return arr;
    return arr.filter(
      (c) =>
        c.champion.toLowerCase().includes(q) ||
        (c.status && c.status.toLowerCase().includes(q)) ||
        tierLabel(c.confidence_tier).toLowerCase().includes(q)
    );
  }, [data, q]);

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Crosshair className="h-4 w-4 text-primary" />
          Champion Confidence
          <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            {loading ? "loading…" : error ? "error" : summary ? `${summary.total_champions} entries` : "dev only"}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 opacity-60" /> : <ChevronDown className="h-4 w-4 opacity-60" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              {error && (
                <Card className="border-destructive/50 bg-destructive/10">
                  <CardContent className="flex items-start gap-3 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-destructive">Champion confidence endpoint failed</div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        GET {COMBAT_API_BASE_URL}/api/combat-lab/audit/champion-confidence
                      </div>
                      <div className="mt-1 text-foreground/80 break-words">{error}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 h-7 text-[11px]"
                        onClick={fetchConfidence}
                        disabled={loading}
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!error && (
                <>
                  {/* Summary cards */}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {loading
                      ? Array.from({ length: 7 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))
                      : summaryCards.map((s) => (
                          <div
                            key={s.label}
                            className="rounded-md border border-border/60 bg-background/40 px-3 py-2"
                          >
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {s.label}
                            </div>
                            <div className="mt-0.5 font-mono text-lg font-bold tabular-nums text-foreground">
                              {s.value}
                            </div>
                          </div>
                        ))}
                  </div>

                  {/* Search */}
                  <div className="flex items-center gap-2 rounded-md border border-border/50 bg-background/40 px-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter champions by name, tier, or status…"
                      className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Champion table */}
                  <div className="overflow-x-auto rounded-md border border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/40">
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Champion</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Confidence Tier</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Score</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Tested</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Basic Attack</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Rotation</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Runtime Profiles</th>
                          <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Interactions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i} className="border-b border-border/40">
                              <td colSpan={9} className="px-3 py-2">
                                <Skeleton className="h-5 w-full" />
                              </td>
                            </tr>
                          ))
                        ) : filteredChampions.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-3 py-6 text-center text-xs text-muted-foreground">
                              No champions match your filter.
                            </td>
                          </tr>
                        ) : (
                          filteredChampions.map((c) => (
                            <tr key={c.champion} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                              <td className="px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">{c.champion}</td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className={`text-[9px] h-5 ${tierBadgeCls(c.confidence_tier)}`}>
                                  {tierLabel(c.confidence_tier)}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs font-mono tabular-nums text-foreground">
                                {typeof c.confidence_score === "number" ? c.confidence_score.toFixed(1) : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{c.status || "—"}</td>
                              <td className="px-3 py-2">
                                {c.tested ? (
                                  <Badge variant="outline" className="text-[9px] h-5 border-emerald-500/40 text-emerald-400">Yes</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[9px] h-5 border-amber-500/40 text-amber-400">No</Badge>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {c.basic_attack_pass ? (
                                  <span className="text-[10px] text-emerald-400">Pass</span>
                                ) : (
                                  <span className="text-[10px] text-red-400">Fail</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {c.rotation_pass ? (
                                  <span className="text-[10px] text-emerald-400">Pass</span>
                                ) : (
                                  <span className="text-[10px] text-red-400">Fail</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs font-mono tabular-nums text-foreground">
                                {typeof c.runtime_profile_count === "number" ? c.runtime_profile_count : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs font-mono tabular-nums text-foreground">
                                {typeof c.interactions === "number" ? c.interactions : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Explanation */}
                  <div className="rounded-md border border-border/50 bg-background/30 px-3 py-2 text-[10px] text-muted-foreground">
                    Smoke validated means the champion loads, basic attacks, and completes a standard rotation without crashing. It does not guarantee every champion-specific edge case is fully verified.
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
