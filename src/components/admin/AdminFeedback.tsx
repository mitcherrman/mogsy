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

interface FeedbackRow {
  id: string;
  profile_id: string;
  category: string;
  page_reference: string | null;
  title: string;
  body: string;
  status: string;
  priority: string;
  admin_notes: string;
  is_archived: boolean;
  upvotes: number;
  created_at: string;
  display_name?: string;
  avatar_url?: string;
}

interface FeedbackConfig {
  is_enabled: boolean;
  categories: string[];
  page_options: string[];
}

const STATUS_OPTIONS = ["open", "in-progress", "planned", "completed", "declined"];
const PRIORITY_OPTIONS = ["low", "normal", "high", "critical"];

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

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [config, setConfig] = useState<FeedbackConfig>({
    is_enabled: true,
    categories: ["Bug Report", "Feature Request", "UI/UX", "Content", "General"],
    page_options: ["Home", "Play", "Swipe", "Profile", "Leaderboard", "Shop", "Settings", "Multiplayer", "Aura Check", "Other"],
  });
  const [newCategory, setNewCategory] = useState("");
  const [newPage, setNewPage] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => { loadData(); }, [showArchived]);

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

      setItems(fbData.map(f => ({
        ...f as FeedbackRow,
        display_name: profileMap.get(f.profile_id)?.display_name || "Unknown",
        avatar_url: profileMap.get(f.profile_id)?.avatar_url || null,
      })));
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  const updateFeedback = async (id: string, updates: Partial<FeedbackRow>) => {
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
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return f.title.toLowerCase().includes(q) || f.body.toLowerCase().includes(q) || f.display_name?.toLowerCase().includes(q);
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
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Page References</label>
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
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">{fb.display_name}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">{fb.category}</Badge>
                      {fb.page_reference && <Badge variant="outline" className="text-[10px] px-1 py-0 h-3.5">📍 {fb.page_reference}</Badge>}
                      <span className="text-[10px] text-muted-foreground ml-auto">{new Date(fb.created_at).toLocaleDateString()}</span>
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
                    <p className="text-sm text-foreground whitespace-pre-wrap">{fb.body}</p>

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