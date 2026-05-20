import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Save, Eye, Trash2, Settings as Cog } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminBlogPost } from "@/hooks/blog/useBlogPosts";
import type { BlogContent, BlogPostRow, BlogTheme } from "@/lib/blog/types";
import { BLOG_THEMES, FONT_PAIRS } from "@/lib/blog/themes";
import BlocksEditor from "@/components/blog/editors/BlocksEditor";
import RichEditor from "@/components/blog/editors/RichEditor";
import CanvasEditor from "@/components/blog/editors/CanvasEditor";
import BlogRenderer from "@/components/blog/BlogRenderer";
import BlogThemeWrapper from "@/components/blog/BlogThemeWrapper";

export default function AdminBlogEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: post, isLoading, refetch } = useAdminBlogPost(id);
  const [draft, setDraft] = useState<BlogPostRow | null>(null);
  const [tab, setTab] = useState<"editor" | "settings" | "preview">("editor");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (post) setDraft(post); }, [post]);

  const theme = useMemo<BlogTheme>(() => (draft?.theme as BlogTheme) ?? { preset: "editorial" }, [draft]);

  function setField<K extends keyof BlogPostRow>(k: K, v: BlogPostRow[K]) {
    setDraft((d) => d ? { ...d, [k]: v } : d);
  }
  function setTheme(patch: Partial<BlogTheme>) {
    setField("theme", { ...theme, ...patch } as any);
  }

  async function save(nextStatus?: BlogPostRow["status"]) {
    if (!draft) return;
    setSaving(true);
    const payload: any = {
      slug: draft.slug, title: draft.title, subtitle: draft.subtitle,
      cover_url: draft.cover_url, editor_mode: draft.editor_mode,
      content: draft.content as any, theme: draft.theme as any,
      tags: draft.tags, category: draft.category,
      seo_title: draft.seo_title, seo_description: draft.seo_description, og_image_url: draft.og_image_url,
      status: nextStatus ?? draft.status,
      published_at: nextStatus === "published" ? new Date().toISOString() : draft.published_at,
    };
    const { error } = await supabase.from("blog_posts").update(payload).eq("id", draft.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(nextStatus === "published" ? "Published" : "Saved");
    refetch();
  }

  async function destroy() {
    if (!draft || !confirm("Delete this post?")) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", draft.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted"); navigate("/admin/blog");
  }

  if (isLoading || !draft) return <div className="min-h-dvh flex items-center justify-center text-muted-foreground">…</div>;

  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <Link to="/admin/blog" aria-label="Back to blog list" className="p-1.5 rounded hover:bg-muted shrink-0"><ArrowLeft className="h-4 w-4" /></Link>
          <input
            value={draft.title}
            onChange={(e) => setField("title", e.target.value)}
            placeholder="Post title"
            aria-label="Post title"
            className="order-3 sm:order-none w-full sm:flex-1 sm:min-w-0 px-2 py-1.5 rounded bg-transparent text-base sm:text-lg font-bold focus:outline-none focus:bg-muted/50"
          />
          <div className="hidden sm:flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{draft.editor_mode}</span>
            <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${draft.status === "published" ? "bg-primary/10 text-primary" : "bg-muted"}`}>{draft.status}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className={`sm:hidden px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${draft.status === "published" ? "bg-primary/10 text-primary" : "bg-muted"}`}>{draft.status}</span>
            <button onClick={() => save()} disabled={saving} className="px-2.5 sm:px-3 py-1.5 rounded-full border border-border text-xs sm:text-sm font-semibold inline-flex items-center gap-1 min-h-9 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Save</span><span className="xs:hidden sr-only">Save</span></button>
            {draft.status !== "published" ? (
              <button onClick={() => save("published")} disabled={saving} className="px-2.5 sm:px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-semibold min-h-9">Publish</button>
            ) : (
              <button onClick={() => save("draft")} className="px-2.5 sm:px-3 py-1.5 rounded-full border border-border text-xs sm:text-sm font-semibold min-h-9">Unpublish</button>
            )}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 flex gap-1 border-t border-border overflow-x-auto">
          {(["editor", "settings", "preview"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 sm:px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t === "editor" ? "Editor" : t === "settings" ? "Settings" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {tab === "editor" && (
          <BlogThemeWrapper theme={theme} className="rounded-2xl p-3 sm:p-6">
            {draft.editor_mode === "blocks" && (
              <BlocksEditor value={(draft.content as any) ?? { mode: "blocks", blocks: [] }} onChange={(v) => setField("content", v as any)} />
            )}
            {draft.editor_mode === "rich" && (
              <RichEditor value={(draft.content as any) ?? { mode: "rich", doc: { type: "doc", content: [{ type: "paragraph" }] }, widgets: {} }} onChange={(v) => setField("content", v as any)} />
            )}
            {draft.editor_mode === "canvas" && (
              <CanvasEditor value={(draft.content as any) ?? { mode: "canvas", w: 1200, h: 1600, nodes: [] }} onChange={(v) => setField("content", v as any)} />
            )}
          </BlogThemeWrapper>
        )}

        {tab === "settings" && (
          <div className="max-w-2xl mx-auto space-y-5">
            <Section title="Basics">
              <FieldRow label="Slug"><input className={inputCls} value={draft.slug} onChange={(e) => setField("slug", e.target.value)} /></FieldRow>
              <FieldRow label="Subtitle"><input className={inputCls} value={draft.subtitle ?? ""} onChange={(e) => setField("subtitle", e.target.value)} /></FieldRow>
              <FieldRow label="Cover image URL"><input className={inputCls} value={draft.cover_url ?? ""} onChange={(e) => setField("cover_url", e.target.value)} /></FieldRow>
              <FieldRow label="Tags (comma-separated)">
                <input className={inputCls} value={(draft.tags ?? []).join(", ")} onChange={(e) => setField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
              </FieldRow>
              <FieldRow label="Category"><input className={inputCls} value={draft.category ?? ""} onChange={(e) => setField("category", e.target.value)} /></FieldRow>
            </Section>
            <Section title="Theme">
              <FieldRow label="Preset">
                <select className={inputCls} value={theme.preset ?? "editorial"} onChange={(e) => setTheme({ preset: e.target.value })}>
                  {BLOG_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Font pair">
                <select className={inputCls} value={theme.headingFont ?? "space-grotesk-dm-sans"} onChange={(e) => setTheme({ headingFont: e.target.value, bodyFont: e.target.value })}>
                  {Object.entries(FONT_PAIRS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FieldRow>
              <FieldRow label="Accent color"><input type="color" className={inputCls} value={theme.accent ?? "#a78bfa"} onChange={(e) => setTheme({ accent: e.target.value })} /></FieldRow>
              <FieldRow label="Cover treatment">
                <select className={inputCls} value={theme.cover ?? "full-bleed"} onChange={(e) => setTheme({ cover: e.target.value as any })}>
                  <option value="full-bleed">Full bleed</option>
                  <option value="boxed">Boxed</option>
                  <option value="split">Split</option>
                </select>
              </FieldRow>
            </Section>
            <Section title="SEO">
              <FieldRow label="SEO title"><input className={inputCls} value={draft.seo_title ?? ""} onChange={(e) => setField("seo_title", e.target.value)} /></FieldRow>
              <FieldRow label="SEO description"><textarea className={inputCls} rows={3} value={draft.seo_description ?? ""} onChange={(e) => setField("seo_description", e.target.value)} /></FieldRow>
              <FieldRow label="OG image URL"><input className={inputCls} value={draft.og_image_url ?? ""} onChange={(e) => setField("og_image_url", e.target.value)} /></FieldRow>
            </Section>
            <button onClick={destroy} className="text-destructive text-sm inline-flex items-center gap-1 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Delete post</button>
          </div>
        )}

        {tab === "preview" && (
          <BlogThemeWrapper theme={theme} className="rounded-2xl">
            <div className="max-w-3xl mx-auto px-4 py-10">
              <h1 className="text-4xl md:text-6xl font-bold leading-tight">{draft.title}</h1>
              {draft.subtitle && <p className="text-lg blog-muted mt-3">{draft.subtitle}</p>}
              <div className="mt-10">
                <BlogRenderer content={draft.content as BlogContent} />
              </div>
            </div>
          </BlogThemeWrapper>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm";
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Cog className="h-3 w-3" /> {title}</div>
    {children}
  </div>;
}
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block">
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    <div className="mt-1">{children}</div>
  </label>;
}