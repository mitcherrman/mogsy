import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  type OptionsMeta,
  type SimulateRequest,
  type SimulationResult,
  type TimelineEvent,
  type CritMode,
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
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
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
      const [ch, it, ru, tg, op] = await Promise.all([
        settle(combatApi.champions(), [] as Champion[]),
        settle(combatApi.items(), [] as Item[]),
        settle(combatApi.runes(), [] as Rune[]),
        settle(combatApi.targetProfiles(), [] as TargetProfile[]),
        settle(combatApi.options(), {} as OptionsMeta),
      ]);
      if (cancelled) return;
      setChampions(ch);
      setItems(it);
      setRunes(ru);
      setTargets(tg);
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
    <div className="px-4 md:px-0 py-6 md:py-10">
      <SEOHead
        title="Combat Lab — Mogsy"
        description="League of Legends combat simulator. Build combos, pick items and runes, and benchmark damage with the Mogsy Combat Lab."
      />

      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80">
            <Swords className="h-3.5 w-3.5" />
            Combat Lab
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            League of Legends damage simulator
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Configure a champion, build a combo, then run a deterministic
            backend simulation. All math runs server-side.
          </p>
        </div>
        <ApiStatusBadge status={apiStatus} />
      </div>

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