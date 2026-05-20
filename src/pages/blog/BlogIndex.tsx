import { useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import BlogPostCard from "@/components/blog/BlogPostCard";
import SEOHead from "@/components/SEOHead";

export default function BlogIndex() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const { data: posts = [], isLoading } = useBlogList({ limit: 60, search: search || undefined, tag });
  const allTags = Array.from(new Set(posts.flatMap((p) => p.tags ?? []))).slice(0, 12);

  const [hero, ...rest] = posts;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead title="Blog — Mogsy" description="Stories, rankings, and deep dives from the Mogsy team." />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs uppercase tracking-widest font-bold">The Blog</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-foreground">Stories from Mogsy</h1>
        <p className="text-muted-foreground mt-2 max-w-xl">Rankings, recaps, and ridiculous deep dives.</p>

        <div className="mt-6 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <TagPill active={!tag} onClick={() => setTag(undefined)}>All</TagPill>
              {allTags.map((t) => (
                <TagPill key={t} active={tag === t} onClick={() => setTag(t)}>{t}</TagPill>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="mt-10 text-center text-muted-foreground">Loading…</div>
        ) : posts.length === 0 ? (
          <div className="mt-10 text-center text-muted-foreground">No posts yet.</div>
        ) : (
          <>
            {hero && (
              <div className="mt-8">
                <BlogPostCard post={hero} size="lg" />
              </div>
            )}
            {rest.length > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {rest.map((p) => <BlogPostCard key={p.id} post={p} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TagPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}
    >
      {children}
    </button>
  );
}