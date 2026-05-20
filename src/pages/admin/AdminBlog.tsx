import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, Eye, Pencil, Search, Trash2, EyeOff, Send, FileX } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminBlogList } from "@/hooks/blog/useBlogPosts";
import type { BlogEditorMode, BlogPostStatus } from "@/lib/blog/types";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `post-${Date.now()}`;
}

type StatusFilter = "all" | BlogPostStatus;

export default function AdminBlog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const { data: posts = [], refetch } = useAdminBlogList();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMode, setNewMode] = useState<BlogEditorMode>("blocks");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = (data ?? []).map((r) => r.role as string);
      const ok = roles.includes("admin") || roles.includes("master_admin");
      setAllowed(ok);
      setChecking(false);
      if (!ok) { toast.error("Access denied"); navigate("/"); }
    });
  }, [user, navigate]);

  async function createPost() {
    if (!user) return;
    const title = newTitle.trim() || "Untitled post";
    const slug = slugify(title) + "-" + Math.random().toString(36).slice(2, 6);
    const initialContent =
      newMode === "blocks" ? { mode: "blocks", blocks: [] } :
      newMode === "rich" ? { mode: "rich", doc: { type: "doc", content: [{ type: "paragraph" }] }, widgets: {} } :
      { mode: "canvas", w: 1200, h: 1600, nodes: [] };
    const { data, error } = await supabase.from("blog_posts").insert({
      slug, title, author_user_id: user.id, editor_mode: newMode,
      content: initialContent as any, theme: { preset: "editorial" } as any, status: "draft",
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success("Post created");
    setCreating(false); setNewTitle("");
    refetch();
    navigate(`/admin/blog/${data.id}`);
  }

  if (checking) return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">…</div>;
  if (!allowed) return null;

  const allTags = Array.from(new Set(posts.flatMap((p) => p.tags ?? []))).sort();

  const q = search.toLowerCase().trim();
  const filtered = posts.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false;
    if (!q) return true;
    return (
      (p.title ?? "").toLowerCase().includes(q) ||
      (p.slug ?? "").toLowerCase().includes(q) ||
      (p.subtitle ?? "").toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  async function bulkSetStatus(status: BlogPostStatus) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const patch: any = { status };
    if (status === "published") patch.published_at = new Date().toISOString();
    const { error } = await supabase.from("blog_posts").update(patch).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} post${ids.length !== 1 ? "s" : ""} → ${status}`);
    setSelected(new Set());
    refetch();
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${ids.length} post${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const { error } = await supabase.from("blog_posts").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} deleted`);
    setSelected(new Set());
    refetch();
  }

  async function deleteOne(id: string, title: string) {
    if (!confirm(`Delete "${title || "(untitled)"}"?`)) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    refetch();
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Blog</h1>
            <p className="text-sm text-muted-foreground">{posts.length} total · {filtered.length} shown</p>
          </div>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
            <Plus className="h-4 w-4" /> New post
          </button>
        </div>

        {creating && (
          <div className="rounded-2xl border border-border bg-card p-4 mb-6 space-y-3">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Post title" className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
            <div className="flex gap-2">
              {(["blocks", "rich", "canvas"] as BlogEditorMode[]).map((m) => (
                <button key={m} onClick={() => setNewMode(m)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${newMode === m ? "border-primary text-primary bg-primary/10" : "border-border"}`}>
                  {m === "blocks" ? "Blocks (Notion-style)" : m === "rich" ? "Rich text + widgets" : "Freeform canvas"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm text-muted-foreground">Cancel</button>
              <button onClick={createPost} className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm">Create</button>
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="rounded-2xl border border-border bg-card p-3 mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, slug, subtitle, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {(["all", "draft", "scheduled", "published"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="h-9 px-2 rounded-lg border border-border bg-background text-xs"
              >
                <option value="">All tags</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border">
              <span className="text-xs font-semibold text-primary mr-2">{selected.size} selected</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("published")}>
                <Send className="h-3 w-3 mr-1" /> Publish
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("draft")}>
                <FileX className="h-3 w-3 mr-1" /> Move to draft
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkSetStatus("scheduled")}>
                <EyeOff className="h-3 w-3 mr-1" /> Mark scheduled
              </Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={bulkDelete}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Header row */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            <span className="flex-1">Post</span>
            <span className="w-16 text-right">Views</span>
            <span className="w-28 hidden sm:inline">Updated</span>
            <span className="w-24 text-right">Actions</span>
          </div>
        )}

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12">
              {posts.length === 0 ? "No posts yet." : "No posts match your filters."}
            </p>
          )}
          {filtered.map((p) => (
            <div key={p.id} className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors ${selected.has(p.id) ? "border-primary" : "border-border"}`}>
              <Checkbox
                checked={selected.has(p.id)}
                onCheckedChange={() => toggleOne(p.id)}
                aria-label="Select post"
              />
              {p.cover_url ? (
                <img src={p.cover_url} alt="" className="hidden sm:block h-10 w-10 rounded-md object-cover bg-muted shrink-0" />
              ) : (
                <div className="hidden sm:flex h-10 w-10 rounded-md bg-muted shrink-0 items-center justify-center">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${p.status === "published" ? "bg-primary/10 text-primary" : p.status === "scheduled" ? "bg-secondary/10 text-secondary" : "bg-muted text-muted-foreground"}`}>{p.status}</span>
                  <span className="font-semibold truncate">{p.title || "(untitled)"}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.editor_mode} · /{p.slug}
                  {p.tags?.length ? <span className="ml-2">· {p.tags.slice(0, 3).join(", ")}{p.tags.length > 3 ? "…" : ""}</span> : null}
                </div>
              </div>
              <div className="w-16 text-right text-xs text-muted-foreground tabular-nums">{p.views ?? 0}</div>
              <div className="w-28 hidden sm:block text-[11px] text-muted-foreground">
                {new Date(p.updated_at).toLocaleDateString()}
              </div>
              <div className="w-24 flex items-center justify-end gap-0.5">
                {p.status === "published" && (
                  <Link to={`/blog/${p.slug}`} className="p-1.5 rounded hover:bg-muted" title="View"><Eye className="h-4 w-4" /></Link>
                )}
                <Link to={`/admin/blog/${p.id}`} className="p-1.5 rounded hover:bg-muted" title="Edit"><Pencil className="h-4 w-4" /></Link>
                <button
                  onClick={() => deleteOne(p.id, p.title)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}