import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, FileText, Eye, Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminBlogList } from "@/hooks/blog/useBlogPosts";
import type { BlogEditorMode } from "@/lib/blog/types";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `post-${Date.now()}`;
}

export default function AdminBlog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const { data: posts = [], refetch } = useAdminBlogList();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMode, setNewMode] = useState<BlogEditorMode>("blocks");

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

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-primary" /> Blog</h1>
            <p className="text-sm text-muted-foreground">Author-only sandbox for posts.</p>
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

        <div className="space-y-2">
          {posts.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No posts yet.</p>}
          {posts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${p.status === "published" ? "bg-primary/10 text-primary" : p.status === "scheduled" ? "bg-secondary/10 text-secondary" : "bg-muted text-muted-foreground"}`}>{p.status}</span>
                  <span className="font-semibold truncate">{p.title || "(untitled)"}</span>
                </div>
                <div className="text-xs text-muted-foreground">{p.editor_mode} · /{p.slug}</div>
              </div>
              {p.status === "published" && (
                <Link to={`/blog/${p.slug}`} className="p-2 rounded hover:bg-muted"><Eye className="h-4 w-4" /></Link>
              )}
              <Link to={`/admin/blog/${p.id}`} className="p-2 rounded hover:bg-muted"><Pencil className="h-4 w-4" /></Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}