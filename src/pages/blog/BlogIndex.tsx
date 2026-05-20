import { useState } from "react";
import { Search, BookOpen, ArrowRight } from "lucide-react";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import BlogPostCard from "@/components/blog/BlogPostCard";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import { Link } from "react-router-dom";
import { getBlogTheme } from "@/lib/blog/themes";

export default function BlogIndex() {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);
  const { data: posts = [], isLoading } = useBlogList({ limit: 60, search: search || undefined, tag });
  // Stable tag list — derived from an unfiltered query so categories don't
  // disappear/jump when the user selects a tag or types a search.
  const { data: allPosts = [] } = useBlogList({ limit: 100 });
  const allTags = Array.from(new Set(allPosts.flatMap((p) => p.tags ?? []))).slice(0, 12);

  const [hero, ...rest] = posts;

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead
        title="Mogsy Blog — Rankings, Tier Lists & Pop Culture Deep Dives"
        description="Anime tier lists, video game rankings, movie debates and Marvel hot takes — explore community-ranked stories from Mogsy."
        path="/blog"
        keywords="anime tier list, video game rankings, movie tier list, marvel ranking, pop culture, mogsy"
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Mogsy Blog",
            url: `${SITE_URL}/blog`,
            description: "Rankings, tier lists, and deep dives from the Mogsy community.",
            publisher: { "@type": "Organization", name: "Mogsy", url: SITE_URL },
            blogPost: posts.slice(0, 20).map((p) => ({
              "@type": "BlogPosting",
              headline: p.title,
              url: `${SITE_URL}/blog/${p.slug}`,
              datePublished: p.published_at,
              image: p.cover_url || undefined,
            })),
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
            ],
          },
        ]}
      />
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-1 text-primary">
          <BookOpen className="h-4 w-4" />
          <span className="text-[10px] uppercase tracking-widest font-bold">The Blog</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Stories from Mogsy</h1>
        <p className="text-xs text-muted-foreground mt-1 max-w-xl">Rankings, recaps, and ridiculous deep dives.</p>

        <div className="mt-3 flex flex-col gap-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts…"
              className="w-full pl-9 pr-3 py-1.5 rounded-full border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 min-h-[24px]">
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
              <FeaturedHero post={hero} />
            )}
            {rest.length > 0 && (
              <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-1.5">
                {rest.map((p) => <BlogPostCard key={p.id} post={p} size="sm" />)}
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
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/40"}`}
    >
      {children}
    </button>
  );
}

function FeaturedHero({ post }: { post: import("@/lib/blog/types").BlogPostRow }) {
  const theme = getBlogTheme(post.theme?.preset);
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group mt-3 w-full max-w-3xl grid grid-cols-2 md:grid-cols-[1fr_1.2fr] gap-0 rounded-xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors max-h-[50dvh]"
    >
      <div
        className="relative overflow-hidden"
        style={{ background: theme.vars["--blog-bg"] }}
      >
        {post.cover_url ? (
          <img
            src={post.cover_url}
            alt={post.title}
            className="block w-full h-auto max-h-[50dvh] object-contain"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: theme.vars["--blog-accent"] }}>
            <span className="text-3xl font-bold opacity-40">{post.title?.slice(0, 1) || "M"}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] uppercase tracking-widest font-bold">
          Featured
        </div>
      </div>
      <div className="p-3 md:p-4 flex flex-col justify-center">
        {post.tags?.length > 0 && (
          <div className="text-[9px] uppercase tracking-widest text-primary font-semibold mb-1">{post.tags[0]}</div>
        )}
        <h2 className="font-bold text-foreground text-sm md:text-base leading-tight line-clamp-2">{post.title}</h2>
        {post.subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{post.subtitle}</p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          {post.published_at && <span>{new Date(post.published_at).toLocaleDateString()}</span>}
          <span className="ml-auto inline-flex items-center gap-1 text-primary font-semibold text-[10px]">
            Read <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Link>
  );
}