import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MessageSquare, Check, Clock, Tag, X, ChevronDown, ChevronUp,
  Search, Filter, BarChart3, Save, Trash2, Archive, ToggleLeft, ToggleRight,
  Plus, Minus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ENTRY_INTENT_LABELS,
  FEEDBACK_CATEGORIES,
  FEEDBACK_SEVERITY_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackEntryIntent,
  type FeedbackSeverity,
} from "@/lib/feedback/contract";
import {
  capturedFields,
  diagnosticFields,
  reportOrigin,
  type CapturedField,
} from "@/lib/feedback/adminReportView";

/**
 * The row as `admin_list_feedback()` actually returns it.
 *
 * This interface used to name twelve columns and stopped there, so every
 * column FB1 added — the entry intent, the severity, the route, the
 * diagnostics, the evidence — was arriving from the database and being thrown
 * away before it reached the screen. That is the whole reason the admin list
 * looked like it predated FB1: it did not.
 *
 * `admin_list_feedback` is `RETURNS SETOF public.feedback`, so widening this
 * interface is the entire change needed to surface a column. It costs no
 * migration and no RPC edit, which is why FB1-4's own `report_context` needed
 * nothing here either beyond being named.
 */
interface FeedbackRow {
  id: string;
  profile_id: string;
  entry_intent: string;
  type: string;
  category: string;
  legacy_category: string | null;
  page_reference: string | null;
  page_url: string | null;
  title: string;
  body: string;
  status: string;
  priority: string;
  severity: string | null;
  reproducibility: string | null;
  expected_result: string | null;
  actual_result: string | null;
  evidence_url: string | null;
  screenshot_path: string | null;
  client_meta: unknown;
  report_context: unknown;
  admin_notes: string;
  is_archived: boolean;
  upvotes: number;
  created_at: string;
  updated_at?: string;
  display_name?: string;
  avatar_url?: string;
}

interface FeedbackConfig {
  is_enabled: boolean;
  categories: string[];
  /**
   * LEGACY. `page_reference` was a fixed list the pre-FB1 form asked the user
   * to pick from ("Play", "Swipe", "Shop", "Aura Check"). FB1 replaced it with
   * `page_url`, captured automatically from the route, and no current
   * submission path writes `page_reference` at all. The editor below is kept
   * because historical rows still carry those values and the owner may want to
   * curate them, but it no longer SEEDS a vocabulary: shipping a hard-coded
   * fallback naming products that do not exist is how a dead taxonomy stays
   * alive in a dropdown for a year.
   */
  page_options: string[];
}

/* The shipped status vocabulary, now imported rather than restated so this
   file and the FB1 contract cannot drift. */
const STATUS_OPTIONS = [...FEEDBACK_STATUSES];
const PRIORITY_OPTIONS = ["low", "normal", "high", "critical"];

/** Origin filter — the question the owner actually triages by. */
const ORIGIN_FILTERS = [
  { value: "all", label: "All origins" },
  { value: "question_report", label: "Question reports" },
  { value: "page_report", label: "Page issues" },
  { value: "center", label: "Feedback Center" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-500",
  "in-progress": "bg-amber-500/20 text-amber-500",
  planned: "bg-purple-500/20 text-purple-500",
  completed: "bg-green-500/20 text-green-500",
  declined: "bg-muted text-muted-foreground",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  normal: "text-foreground",
  high: "text-amber-500",
  critical: "text-destructive font-bold",
};

const ORIGIN_BADGE: Record<string, string> = {
  question: "bg-amber-500/20 text-amber-500 border-amber-500/30",
  page: "bg-sky-500/20 text-sky-500 border-sky-500/30",
  center: "bg-muted text-muted-foreground",
};

/**
 * A captured-context block.
 *
 * Long values (the prompt, the choice list) get their own full-width
 * pre-wrapped box; everything else is a two-column label/value row. Choices
 * arrive newline-joined from `capturedFields`, so `whitespace-pre-wrap` is
 * what turns them back into a list without this component having to know that
 * one particular field is an array.
 */
function CapturedBlock({ title, fields }: { title: string; fields: CapturedField[] }) {
  if (!fields.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <dl className="mt-2 space-y-1.5">
        {fields.map(field => (
          <div
            key={field.key}
            data-testid={`feedback-field-${field.key}`}
            className={field.block ? "space-y-0.5" : "flex gap-2"}
          >
            <dt className={`text-[10px] uppercase tracking-wide text-muted-foreground ${field.block ? "" : "w-32 shrink-0"}`}>
              {field.label}
            </dt>
            <dd className={`min-w-0 text-xs text-foreground ${field.block ? "whitespace-pre-wrap rounded bg-muted/40 p-2" : "break-words"}`}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  /**
   * The fallback used only until app_settings.feedback_config loads.
   *
   * It was a list of five type/area hybrids ("Bug Report", "UI/UX") and ten
   * page names from a product that no longer exists ("Swipe", "Shop",
   * "Multiplayer", "Aura Check"). None of them is a value any current
   * submission can carry: FB1 narrowed `category` to product area and
   * retired `page_reference` in favour of an auto-captured route. The
   * category fallback is now the FB1 contract's own taxonomy — the same list
   * the database seeds — and the page fallback is empty, so a slow config
   * load can no longer put a dead vocabulary in a filter.
   */
  const [config, setConfig] = useState<FeedbackConfig>({
    is_enabled: true,
    categories: [...FEEDBACK_CATEGORIES],
    page_options: [],
  });
  const [newCategory, setNewCategory] = useState("");
  const [newPage, setNewPage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => { loadData(); }, [showArchived]);

  // Real-time refresh on new feedback so admins see it immediately
  useEffect(() => {
    const channel = supabase
      .channel("admin-feedback-stream")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications", filter: "type=eq.feedback" },
        () => { loadData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const loadData = async () => {
    setLoading(true);

    // Config
    const { data: cfgData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "feedback_config")
      .single();
    if (cfgData?.value) setConfig(cfgData.value as unknown as FeedbackConfig);

    // Feedback (admin-only RPC returns admin_notes too)
    const { data: fbData } = await supabase.rpc("admin_list_feedback", {
      _show_archived: showArchived,
    });

    if (fbData && fbData.length > 0) {
      const profileIds = [...new Set(fbData.map(f => f.profile_id))];
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", profileIds);
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      /* `as unknown as` and not a plain assertion: `report_context` is not in
         the generated types yet, because src/integrations/supabase/types.ts
         must describe the LIVE database and FB1-4's migration is applied by
         hand. Same pattern, and same reason, as the untyped-RPC casts in
         src/lib/feedback/client.ts. Regenerating types after the migration
         lands makes the double cast unnecessary; it is confined to this one
         mapping so that clean-up is a one-line edit. */
      setItems(fbData.map(f => ({
        ...(f as unknown as FeedbackRow),
        display_name: profileMap.get(f.profile_id)?.display_name || "Unknown",
        avatar_url: profileMap.get(f.profile_id)?.avatar_url || null,
      })));
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  /** The four columns the admin surface is allowed to write. Narrowing the
   *  parameter is what keeps a widened FeedbackRow from making every captured
   *  field look editable from here. */
  type AdminWritable = Pick<FeedbackRow, "status" | "priority" | "admin_notes" | "is_archived">;

  const updateFeedback = async (id: string, updates: Partial<AdminWritable>) => {
    const { error } = await supabase.from("feedback").update(updates).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    toast.success("Updated");
  };

  const deleteFeedback = async (id: string) => {
    await supabase.from("feedback").delete().eq("id", id);
    setItems(prev => prev.filter(f => f.id !== id));
    toast.success("Deleted");
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    await supabase.from("app_settings").upsert({
      key: "feedback_config",
      value: config as any,
      updated_at: new Date().toISOString(),
    });
    setSavingConfig(false);
    toast.success("Config saved");
  };

  // Stats
  const stats = {
    total: items.length,
    open: items.filter(f => f.status === "open").length,
    inProgress: items.filter(f => f.status === "in-progress").length,
    completed: items.filter(f => f.status === "completed").length,
  };

  // Filtered items
  const filtered = items.filter(f => {
    if (filter !== "all" && f.status !== filter) return false;
    if (categoryFilter !== "all" && f.category !== categoryFilter) return false;
    if (originFilter !== "all") {
      const isCenter = f.entry_intent !== "question_report" && f.entry_intent !== "page_report";
      if (originFilter === "center" ? !isCenter : f.entry_intent !== originFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Search reaches the captured snapshot too. A question report's title is
      // "Incorrect answer — Ranked"; the words the owner remembers are in the
      // prompt, and a search that could not find them would make the whole
      // capture unreachable except by scrolling.
      const haystack = [
        f.title,
        f.body,
        f.display_name ?? "",
        f.page_url ?? "",
        JSON.stringify(f.report_context ?? {}),
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    }
    return true;
  });

  if (loading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-xl font-black text-foreground">{stats.total}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-xl font-black text-blue-500">{stats.open}</div>
          <div className="text-[10px] text-muted-foreground">Open</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-xl font-black text-amber-500">{stats.inProgress}</div>
          <div className="text-[10px] text-muted-foreground">In Progress</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-xl font-black text-green-500">{stats.completed}</div>
          <div className="text-[10px] text-muted-foreground">Done</div>
        </div>
      </div>

      {/* Config toggle */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <button onClick={() => setShowConfig(!showConfig)} className="w-full flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Feedback Configuration
          </h3>
          <span className="text-xs text-muted-foreground">{showConfig ? "Hide" : "Show"}</span>
        </button>

        {showConfig && (
          <div className="mt-4 space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <span className="text-sm font-semibold text-foreground">Feedback Board Enabled</span>
              <Switch checked={config.is_enabled} onCheckedChange={v => setConfig(prev => ({ ...prev, is_enabled: v }))} />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Categories</label>
              <div className="flex flex-wrap gap-1.5">
                {config.categories.map(c => (
                  <Badge key={c} variant="outline" className="gap-1 pr-1">
                    {c}
                    <button onClick={() => setConfig(prev => ({ ...prev, categories: prev.categories.filter(x => x !== c) }))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category..." className="h-8 text-xs flex-1" onKeyDown={e => {
                  if (e.key === "Enter" && newCategory.trim()) {
                    setConfig(prev => ({ ...prev, categories: [...prev.categories, newCategory.trim()] }));
                    setNewCategory("");
                  }
                }} />
                <Button size="sm" className="h-8 text-xs" disabled={!newCategory.trim()} onClick={() => {
                  setConfig(prev => ({ ...prev, categories: [...prev.categories, newCategory.trim()] }));
                  setNewCategory("");
                }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Page options */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Page References <span className="normal-case font-normal">(legacy)</span>
              </label>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Pre-FB1 vocabulary. Nothing writes <code>page_reference</code> any
                more — every submission records its route automatically in{" "}
                <code>page_url</code>. Kept only so historical values stay
                curatable.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {config.page_options.map(p => (
                  <Badge key={p} variant="outline" className="gap-1 pr-1">
                    {p}
                    <button onClick={() => setConfig(prev => ({ ...prev, page_options: prev.page_options.filter(x => x !== p) }))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input value={newPage} onChange={e => setNewPage(e.target.value)} placeholder="New page..." className="h-8 text-xs flex-1" onKeyDown={e => {
                  if (e.key === "Enter" && newPage.trim()) {
                    setConfig(prev => ({ ...prev, page_options: [...prev.page_options, newPage.trim()] }));
                    setNewPage("");
                  }
                }} />
                <Button size="sm" className="h-8 text-xs" disabled={!newPage.trim()} onClick={() => {
                  setConfig(prev => ({ ...prev, page_options: [...prev.page_options, newPage.trim()] }));
                  setNewPage("");
                }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <Button onClick={saveConfig} disabled={savingConfig} className="gap-1.5">
              <Save className="h-4 w-4" /> {savingConfig ? "Saving..." : "Save Config"}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="h-8 text-xs w-40"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {config.categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={originFilter} onValueChange={setOriginFilter}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Origin" />
          </SelectTrigger>
          <SelectContent>
            {ORIGIN_FILTERS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setShowArchived(!showArchived)}
        >
          <Archive className="h-3 w-3" /> {showArchived ? "Archived" : "Active"}
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No feedback found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(fb => {
            const isExpanded = expandedId === fb.id;
            const origin = reportOrigin(fb);
            return (
              <motion.div
                key={fb.id}
                layout
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : fb.id)}
                  className="w-full p-3 text-left flex items-start gap-3"
                >
                  <UserAvatar src={fb.avatar_url || null} name={fb.display_name || ""} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h3 className="text-sm font-bold text-foreground truncate">{fb.title}</h3>
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[fb.status]}`}>{fb.status}</Badge>
                      <span className={`text-[10px] ${PRIORITY_COLORS[fb.priority]}`}>{fb.priority}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{fb.body}</p>
                    {/* ORIGIN FIRST. Where a report came from decides whether
                        it is worth opening now — "Question Report · Incorrect
                        answer · Ranked" is actionable at a glance in a way that
                        a bare "Ranked" category badge never was. */}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge
                        data-testid={`feedback-origin-${origin.kind}`}
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 h-4 ${ORIGIN_BADGE[origin.kind]}`}
                      >
                        {origin.label}
                      </Badge>
                      {origin.kind === "center" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">{fb.category}</Badge>
                      )}
                      {/* Legacy only: no current submission path writes it. */}
                      {fb.page_reference && <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">📍 {fb.page_reference}</Badge>}
                      <span className="text-[10px] text-muted-foreground">{fb.display_name}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(fb.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold">{fb.upvotes}</span>
                  </div>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="border-t border-border px-4 py-3 space-y-3 bg-muted/20"
                  >
                    {/* The submitter's own words, always first and always
                        labelled as theirs — the captured context below is the
                        client's observation, and the two must never read as
                        one voice. */}
                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">
                        {origin.kind === "question" ? "Player's comment" : "Description"}
                      </label>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{fb.body}</p>
                    </div>

                    <CapturedBlock
                      title={origin.kind === "page" ? "Captured page" : "Captured question"}
                      fields={capturedFields(fb)}
                    />

                    {/* Feedback Center extras. Absent on in-product reports by
                        construction — neither reporter asks for a severity or
                        a repro, because a question report has neither. */}
                    {(fb.severity || fb.reproducibility || fb.expected_result
                      || fb.actual_result || fb.evidence_url) && (
                      <CapturedBlock
                        title="Reported details"
                        fields={[
                          fb.severity && {
                            key: "severity", label: "Severity",
                            value: FEEDBACK_SEVERITY_LABELS[fb.severity as FeedbackSeverity] ?? fb.severity,
                          },
                          fb.reproducibility && {
                            key: "reproducibility", label: "Reproducible", value: fb.reproducibility,
                          },
                          fb.expected_result && {
                            key: "expected", label: "Expected", value: fb.expected_result, block: true,
                          },
                          fb.actual_result && {
                            key: "actual", label: "Actual", value: fb.actual_result, block: true,
                          },
                          fb.evidence_url && {
                            key: "evidence", label: "Evidence", value: fb.evidence_url,
                          },
                        ].filter(Boolean) as CapturedField[]}
                      />
                    )}

                    <CapturedBlock
                      title="Diagnostics"
                      fields={[
                        ...diagnosticFields(fb.client_meta),
                        { key: "intent", label: "Entry intent",
                          value: ENTRY_INTENT_LABELS[fb.entry_intent as FeedbackEntryIntent] ?? fb.entry_intent },
                        { key: "triage_type", label: "Triage type", value: fb.type },
                        ...(fb.page_url ? [{ key: "page_url", label: "Route", value: fb.page_url }] : []),
                        ...(fb.screenshot_path
                          ? [{ key: "screenshot", label: "Screenshot", value: fb.screenshot_path }] : []),
                        ...(fb.legacy_category
                          ? [{ key: "legacy_category", label: "Legacy category", value: fb.legacy_category }] : []),
                        { key: "created", label: "Created", value: new Date(fb.created_at).toLocaleString() },
                      ]}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Status</label>
                        <Select value={fb.status} onValueChange={v => updateFeedback(fb.id, { status: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Priority</label>
                        <Select value={fb.priority} onValueChange={v => updateFeedback(fb.id, { priority: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Admin Notes</label>
                      <Textarea
                        value={fb.admin_notes || ""}
                        onChange={e => setItems(prev => prev.map(f => f.id === fb.id ? { ...f, admin_notes: e.target.value } : f))}
                        placeholder="Internal notes..."
                        rows={2}
                        className="text-xs resize-none"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-1.5 h-7 text-xs gap-1"
                        onClick={() => updateFeedback(fb.id, { admin_notes: fb.admin_notes })}
                      >
                        <Save className="h-3 w-3" /> Save Notes
                      </Button>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => updateFeedback(fb.id, { is_archived: !fb.is_archived })}
                      >
                        <Archive className="h-3 w-3" /> {fb.is_archived ? "Unarchive" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => deleteFeedback(fb.id)}
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}