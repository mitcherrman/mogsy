import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Loader2,
  RefreshCw,
  Server,
  Swords,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { COMBAT_API_BASE_URL } from "@/lib/combat-lab/api";

/* ─────────────── helpers ─────────────── */

const FALLBACK_API = "http://127.0.0.1:8000";
const ENV_API =
  (import.meta.env.VITE_COMBAT_API_URL as string | undefined) || "";

type FetchResult = {
  ok: boolean;
  status?: number;
  url: string;
  durationMs: number;
  data?: any;
  error?: string;
};

async function timedFetch(
  path: string,
  init?: RequestInit
): Promise<FetchResult> {
  const url = `${COMBAT_API_BASE_URL}${path}`;
  const start = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const dur = performance.now() - start;
    let data: any = null;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        url,
        durationMs: dur,
        data,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    return { ok: true, status: res.status, url, durationMs: dur, data };
  } catch (err: any) {
    return {
      ok: false,
      url,
      durationMs: performance.now() - start,
      error: err?.message || String(err),
    };
  }
}

function countOf(data: any): number | null {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return data.items.length;
    if (Array.isArray(data.data)) return data.data.length;
    if (Array.isArray(data.actions)) return data.actions.length;
    // grouped { tree: [...] }
    const vals = Object.values(data);
    if (vals.length && vals.every((v) => Array.isArray(v))) {
      return vals.reduce<number>((a, v) => a + (v as any[]).length, 0);
    }
  }
  return null;
}

/* ─────────────── small UI primitives ─────────────── */

function Panel({
  title,
  icon: Icon,
  right,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
        {right}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/40 bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {k}
      </span>
      <span className="break-all font-mono text-xs text-foreground">{v}</span>
    </div>
  );
}

function StatusPill({
  state,
  labels = { ok: "OK", fail: "FAIL", pending: "…" },
}: {
  state: "ok" | "fail" | "pending" | "idle";
  labels?: { ok?: string; fail?: string; pending?: string; idle?: string };
}) {
  if (state === "pending") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        {labels.pending}
      </Badge>
    );
  }
  if (state === "ok") {
    return (
      <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-3 w-3" />
        {labels.ok}
      </Badge>
    );
  }
  if (state === "fail") {
    return (
      <Badge className="gap-1 border-rose-500/30 bg-rose-500/15 text-rose-300 hover:bg-rose-500/20">
        <XCircle className="h-3 w-3" />
        {labels.fail}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      {labels.idle || "idle"}
    </Badge>
  );
}

function JsonViewer({
  data,
  defaultOpen = false,
  label = "JSON",
}: {
  data: unknown;
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const text = useMemo(() => {
    if (data === undefined) return "undefined";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {label}
            <span className="ml-1 text-foreground/50">
              ({text.length.toLocaleString()} chars)
            </span>
          </button>
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={copy}
        >
          <Clipboard className="h-3 w-3" />
          Copy
        </Button>
      </div>
      <CollapsibleContent>
        <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border/40 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─────────────── meta + interactive definitions ─────────────── */

const META_ENDPOINTS = [
  { key: "champions", label: "Champions", path: "/api/meta/champions" },
  { key: "items", label: "Items", path: "/api/meta/items" },
  { key: "runes", label: "Runes", path: "/api/meta/runes" },
  { key: "targets", label: "Target Profiles", path: "/api/meta/target-profiles" },
  { key: "summoners", label: "Summoners", path: "/api/meta/summoners" },
  { key: "options", label: "Options", path: "/api/meta/options" },
  { key: "actions", label: "Combat Lab Actions", path: "/api/meta/combat-lab-actions" },
] as const;

type InteractiveTest = {
  id: string;
  label: string;
  path: string;
  body: Record<string, unknown>;
};

const baseConfig = {
  items: [] as string[],
  runes: [] as string[],
  target_profile: "Tank",
  stats: { LEVEL: 18 },
  ad: 100,
  attack_speed: 1.5,
  crit_mode: "expected" as const,
};

const INTERACTIVE_TESTS: InteractiveTest[] = [
  {
    id: "basic",
    label: "Basic Attack",
    path: "/api/combat-lab/basic-attack",
    body: { champion: "Ashe", ...baseConfig, state: null },
  },
  {
    id: "vayne",
    label: "Vayne + Guinsoo",
    path: "/api/combat-lab/basic-attack",
    body: {
      champion: "Vayne",
      ...baseConfig,
      items: ["Guinsoo's Rageblade"],
      state: null,
    },
  },
  {
    id: "kaisa",
    label: "Kai'Sa + Guinsoo",
    path: "/api/combat-lab/basic-attack",
    body: {
      champion: "Kai'Sa",
      ...baseConfig,
      items: ["Guinsoo's Rageblade"],
      state: null,
    },
  },
  {
    id: "varus",
    label: "Varus + Runaan's",
    path: "/api/combat-lab/basic-attack",
    body: {
      champion: "Varus",
      ...baseConfig,
      items: ["Runaan's Hurricane"],
      state: null,
    },
  },
  {
    id: "kalista",
    label: "Kalista + Runaan + Rend",
    path: "/api/combat-lab/active",
    body: {
      champion: "Kalista",
      ...baseConfig,
      items: ["Runaan's Hurricane"],
      action_id: "rend",
      state: null,
    },
  },
  {
    id: "yi",
    label: "Master Yi + Guinsoo",
    path: "/api/combat-lab/basic-attack",
    body: {
      champion: "Master Yi",
      ...baseConfig,
      items: ["Guinsoo's Rageblade"],
      state: null,
    },
  },
];

/* ─────────────── page ─────────────── */

type LastCall = {
  url: string;
  method: string;
  payload?: unknown;
  response?: unknown;
  error?: string;
  status?: number;
  durationMs?: number;
  at: string;
};

export default function CombatLabDiagnostics() {
  const frontendUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const mode = import.meta.env.MODE;

  const [health, setHealth] = useState<FetchResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [metaResults, setMetaResults] = useState<
    Record<string, FetchResult | undefined>
  >({});
  const [metaLoading, setMetaLoading] = useState(false);

  const [interactive, setInteractive] = useState<
    Record<string, FetchResult | undefined>
  >({});
  const [interactiveLoading, setInteractiveLoading] = useState<string | null>(
    null
  );

  const [lastCall, setLastCall] = useState<LastCall | null>(null);

  const recordCall = (call: LastCall) => setLastCall(call);

  const runHealth = async () => {
    setHealthLoading(true);
    const res = await timedFetch("/api/health");
    setHealth(res);
    recordCall({
      url: res.url,
      method: "GET",
      response: res.data,
      error: res.error,
      status: res.status,
      durationMs: res.durationMs,
      at: new Date().toISOString(),
    });
    setHealthLoading(false);
  };

  const runMeta = async () => {
    setMetaLoading(true);
    const next: Record<string, FetchResult> = {};
    for (const ep of META_ENDPOINTS) {
      const res = await timedFetch(ep.path);
      next[ep.key] = res;
      setMetaResults((s) => ({ ...s, [ep.key]: res }));
    }
    recordCall({
      url: `${COMBAT_API_BASE_URL}/api/meta/*`,
      method: "GET",
      response: Object.fromEntries(
        Object.entries(next).map(([k, v]) => [
          k,
          { ok: v.ok, status: v.status, count: countOf(v.data) },
        ])
      ),
      at: new Date().toISOString(),
    });
    setMetaLoading(false);
  };

  const runInteractive = async (t: InteractiveTest) => {
    setInteractiveLoading(t.id);
    const res = await timedFetch(t.path, {
      method: "POST",
      body: JSON.stringify(t.body),
    });
    setInteractive((s) => ({ ...s, [t.id]: res }));
    recordCall({
      url: res.url,
      method: "POST",
      payload: t.body,
      response: res.data,
      error: res.error,
      status: res.status,
      durationMs: res.durationMs,
      at: new Date().toISOString(),
    });
    setInteractiveLoading(null);
  };

  // Auto-run health + meta once on mount
  useEffect(() => {
    runHealth();
    runMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyDebugReport = async () => {
    const report = {
      timestamp: new Date().toISOString(),
      frontend: {
        url: frontendUrl,
        mode,
      },
      api: {
        env_var: ENV_API || null,
        fallback: FALLBACK_API,
        base_url: COMBAT_API_BASE_URL,
      },
      health: health
        ? {
            ok: health.ok,
            status: health.status,
            url: health.url,
            duration_ms: Math.round(health.durationMs),
            data: health.data,
            error: health.error,
          }
        : null,
      meta: Object.fromEntries(
        META_ENDPOINTS.map((ep) => {
          const r = metaResults[ep.key];
          return [
            ep.key,
            r
              ? {
                  ok: r.ok,
                  status: r.status,
                  url: r.url,
                  duration_ms: Math.round(r.durationMs),
                  count: countOf(r.data),
                  error: r.error,
                }
              : null,
          ];
        })
      ),
      interactive: Object.fromEntries(
        INTERACTIVE_TESTS.map((t) => {
          const r = interactive[t.id];
          return [
            t.id,
            r
              ? {
                  ok: r.ok,
                  status: r.status,
                  url: r.url,
                  duration_ms: Math.round(r.durationMs),
                  error: r.error,
                  sample: r.data,
                }
              : null,
          ];
        })
      ),
      last_call: lastCall,
    };
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Debug report copied",
        description: "Paste it into ChatGPT or a bug report.",
      });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const healthState: "ok" | "fail" | "pending" | "idle" = healthLoading
    ? "pending"
    : !health
    ? "idle"
    : health.ok
    ? "ok"
    : "fail";

  return (
    <div className="px-4 md:px-0 py-6 md:py-10">
      <SEOHead
        title="Combat Lab Diagnostics — Mogsy"
        description="Developer diagnostics for the Combat Lab backend integration."
      />

      {/* Header */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary/80">
            <Activity className="h-3.5 w-3.5" />
            Combat Lab · Diagnostics
          </div>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Backend integration console
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Probes the Railway combat engine, verifies metadata endpoints, and
            runs canned interactive scenarios. All math stays server-side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1">
            <Link to="/combat-lab">
              <ArrowLeft className="h-4 w-4" />
              Back to Combat Lab
            </Link>
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1"
            onClick={copyDebugReport}
          >
            <Clipboard className="h-4 w-4" />
            Copy Debug Report
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Environment */}
        <Panel title="Environment" icon={Server}>
          <KV k="Frontend URL" v={frontendUrl || "—"} />
          <KV
            k="VITE_COMBAT_API_URL"
            v={
              ENV_API ? (
                ENV_API
              ) : (
                <span className="text-amber-300">not set</span>
              )
            }
          />
          <KV k="Fallback API" v={FALLBACK_API} />
          <KV
            k="Final API Base"
            v={
              <span className="text-emerald-300">{COMBAT_API_BASE_URL}</span>
            }
          />
          <KV k="App Mode" v={mode} />
        </Panel>

        {/* Health */}
        <Panel
          title="API Health"
          icon={health?.ok ? Wifi : WifiOff}
          right={
            <div className="flex items-center gap-2">
              <StatusPill
                state={healthState}
                labels={{
                  ok: "Connected",
                  fail: "Offline",
                  pending: "Checking",
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={runHealth}
                disabled={healthLoading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${healthLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          }
        >
          <KV k="Request URL" v={health?.url || `${COMBAT_API_BASE_URL}/api/health`} />
          {health?.durationMs !== undefined && (
            <KV k="Latency" v={`${Math.round(health.durationMs)} ms`} />
          )}
          {health?.error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {health.error}
            </div>
          )}
          {health?.data !== undefined && (
            <JsonViewer data={health.data} label="Response" defaultOpen />
          )}
        </Panel>

        {/* Metadata */}
        <Panel
          title="Metadata Endpoints"
          icon={Zap}
          right={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={runMeta}
              disabled={metaLoading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${metaLoading ? "animate-spin" : ""}`}
              />
              Re-test
            </Button>
          }
        >
          <div className="space-y-2">
            {META_ENDPOINTS.map((ep) => {
              const r = metaResults[ep.key];
              const state: "ok" | "fail" | "pending" | "idle" = metaLoading && !r
                ? "pending"
                : !r
                ? "idle"
                : r.ok
                ? "ok"
                : "fail";
              const count = r?.ok ? countOf(r.data) : null;
              return (
                <motion.div
                  key={ep.key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md border border-border/40 bg-background/40 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {ep.label}
                      </div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {ep.path}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {count !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          {count} items
                        </span>
                      )}
                      {r?.durationMs !== undefined && (
                        <span className="text-[11px] text-muted-foreground">
                          {Math.round(r.durationMs)}ms
                        </span>
                      )}
                      <StatusPill state={state} />
                    </div>
                  </div>
                  {r?.error && (
                    <div className="mt-1 text-[11px] text-rose-300">
                      {r.error}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Panel>

        {/* Interactive */}
        <Panel title="Interactive Scenarios" icon={Swords}>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTERACTIVE_TESTS.map((t) => {
              const r = interactive[t.id];
              const loading = interactiveLoading === t.id;
              const state: "ok" | "fail" | "pending" | "idle" = loading
                ? "pending"
                : !r
                ? "idle"
                : r.ok
                ? "ok"
                : "fail";
              return (
                <button
                  key={t.id}
                  onClick={() => runInteractive(t)}
                  disabled={loading}
                  className="group flex flex-col gap-1 rounded-md border border-border/40 bg-background/40 p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.label}</span>
                    <StatusPill state={state} />
                  </div>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    POST {t.path}
                  </span>
                  {r?.durationMs !== undefined && (
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(r.durationMs)}ms
                      {r.status ? ` · ${r.status}` : ""}
                    </span>
                  )}
                  {r?.error && (
                    <span className="text-[10px] text-rose-300">{r.error}</span>
                  )}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Last call */}
        <div className="lg:col-span-2">
          <Panel title="Last Request / Response" icon={Activity}>
            {!lastCall ? (
              <div className="text-sm text-muted-foreground">
                Run any test above to populate this panel.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <KV k="Method" v={lastCall.method} />
                  <KV k="URL" v={lastCall.url} />
                  {lastCall.status !== undefined && (
                    <KV k="Status" v={String(lastCall.status)} />
                  )}
                  {lastCall.durationMs !== undefined && (
                    <KV
                      k="Duration"
                      v={`${Math.round(lastCall.durationMs)} ms`}
                    />
                  )}
                  <KV k="At" v={lastCall.at} />
                </div>
                {lastCall.error && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {lastCall.error}
                  </div>
                )}
                {lastCall.payload !== undefined && (
                  <JsonViewer data={lastCall.payload} label="Request Payload" />
                )}
                {lastCall.response !== undefined && (
                  <JsonViewer
                    data={lastCall.response}
                    label="Response"
                    defaultOpen
                  />
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}