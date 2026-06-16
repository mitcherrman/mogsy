import { useMemo, useState } from "react";
import { Copy, Check, Search, FileText, Filter, ArrowDownUp } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOL_CHANGELOG,
  LOL_CHANGE_SCOPES,
  LOL_CHANGE_TYPES,
  entriesToMarkdown,
  entryToMarkdown,
  type LolChangeEntry,
  type LolChangeScope,
  type LolChangeType,
} from "@/lib/lol-changelog";

const GOLD = "#c9a84c";

type SortMode = "newest" | "oldest" | "title";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const fwd = diffMs >= 0;
  if (mins < 60) return `${mins}m ${fwd ? "ago" : "from now"}`;
  if (hours < 48) return `${hours}h ${fwd ? "ago" : "from now"}`;
  return `${days}d ${fwd ? "ago" : "from now"}`;
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

const TYPE_COLORS: Record<LolChangeType, string> = {
  feature: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  fix: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  ui: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  theme: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  security: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  refactor: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  docs: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
    >
      {children}
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copy(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#c9a84c]/40 bg-black/40 px-2.5 py-1 text-xs font-semibold text-[#c9a84c] hover:border-[#c9a84c] hover:bg-[#c9a84c]/10 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function LolDocumentation() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LolChangeType | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<LolChangeScope | "all">("all");
  const [sort, setSort] = useState<SortMode>("newest");

  const filtered = useMemo<LolChangeEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const rows = LOL_CHANGELOG.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (scopeFilter !== "all" && !e.scopes.includes(scopeFilter)) return false;
      if (!q) return true;
      const hay = [
        e.title,
        e.summary,
        e.type,
        e.scopes.join(" "),
        (e.details ?? []).join(" "),
        (e.files ?? []).join(" "),
        (e.routes ?? []).join(" "),
        e.timestamp,
      ]
        .join(" \n ")
        .toLowerCase();
      return hay.includes(q);
    });
    rows.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sort === "newest" ? tb - ta : ta - tb;
    });
    return rows;
  }, [query, typeFilter, scopeFilter, sort]);

  const filteredMd = useMemo(() => entriesToMarkdown(filtered), [filtered]);
  const fullMd = useMemo(() => entriesToMarkdown(LOL_CHANGELOG), []);

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead
        title="Mogsy LoL — League Documentation & Changelog"
        description="A searchable, filterable log of every Lovable change made to Mogsy's League of Legends pages. Copy entries straight into ChatGPT for context."
        path="/lol/docs"
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428] via-[#091428] to-[#0a0a1a] p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="rounded-xl border border-[#c9a84c]/40 bg-black/40 p-3">
              <FileText className="h-6 w-6" style={{ color: GOLD }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: GOLD }}>
                Mogsy x LoL · Docs
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">League Documentation</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
                A timestamped log of every Lovable change to the LoL hub, tier list, Combat Lab and Quiz. Search, filter, and copy entries straight into ChatGPT so it knows the current state.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton text={filteredMd} label={`Copy ${filtered.length} filtered`} />
            <CopyButton text={fullMd} label={`Copy full log (${LOL_CHANGELOG.length})`} />
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-3 flex flex-col md:flex-row gap-2 md:items-center sticky top-14 z-10 backdrop-blur">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, summary, files, routes…"
              className="pl-9 bg-black/40 border-[#c9a84c]/20 focus-visible:ring-[#c9a84c]/40"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
              <SelectTrigger className="w-[140px] bg-black/40 border-[#c9a84c]/20">
                <Filter className="h-3.5 w-3.5 mr-1.5" style={{ color: GOLD }} />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {LOL_CHANGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
              <SelectTrigger className="w-[160px] bg-black/40 border-[#c9a84c]/20">
                <Filter className="h-3.5 w-3.5 mr-1.5" style={{ color: GOLD }} />
                <SelectValue placeholder="Scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scopes</SelectItem>
                {LOL_CHANGE_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
              <SelectTrigger className="w-[150px] bg-black/40 border-[#c9a84c]/20">
                <ArrowDownUp className="h-3.5 w-3.5 mr-1.5" style={{ color: GOLD }} />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="title">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
            {(query || typeFilter !== "all" || scopeFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setTypeFilter("all");
                  setScopeFilter("all");
                }}
                className="text-xs"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Entry list */}
        <div className="mt-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No changes match your filters.
            </div>
          ) : (
            filtered.map((e, i) => (
              <article
                key={`${e.timestamp}-${i}`}
                className="rounded-xl border border-border bg-card/60 hover:border-[#c9a84c]/40 transition-colors p-4 md:p-5"
              >
                <header className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <Pill className={TYPE_COLORS[e.type]}>{e.type}</Pill>
                      {e.scopes.map((s) => (
                        <Pill key={s} className="border-[#c9a84c]/30 text-[#c9a84c] bg-[#c9a84c]/5">
                          {s}
                        </Pill>
                      ))}
                    </div>
                    <h2 className="text-base md:text-lg font-bold text-foreground leading-snug">{e.title}</h2>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <time dateTime={e.timestamp}>{formatLocal(e.timestamp)}</time>
                      <span className="mx-2 opacity-50">·</span>
                      <span>{formatRelative(e.timestamp)}</span>
                    </div>
                  </div>
                  <CopyButton text={entryToMarkdown(e)} label="Copy entry" />
                </header>

                <p className="mt-3 text-sm text-foreground/90 whitespace-pre-line">{e.summary}</p>

                {e.details && e.details.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                    {e.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                )}

                {(e.routes?.length || e.files?.length) && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {e.routes && e.routes.length > 0 && (
                      <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
                        <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: GOLD }}>
                          Routes
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {e.routes.map((r) => (
                            <code
                              key={r}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/50 border border-border text-foreground/90"
                            >
                              {r}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                    {e.files && e.files.length > 0 && (
                      <div className="rounded-md border border-border/60 bg-black/30 p-2.5">
                        <div className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: GOLD }}>
                          Files
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {e.files.map((f) => (
                            <code
                              key={f}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-black/50 border border-border text-foreground/90 break-all"
                            >
                              {f}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <div className="mt-6 text-[11px] text-muted-foreground text-center">
          To add a new entry, edit <code className="font-mono">src/lib/lol-changelog.ts</code> and prepend to <code className="font-mono">LOL_CHANGELOG</code>.
        </div>
      </div>
    </div>
  );
}