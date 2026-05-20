import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBlogPost, useBlogList } from "@/hooks/blog/useBlogPosts";
import BlogThemeWrapper from "@/components/blog/BlogThemeWrapper";
import BlogRenderer from "@/components/blog/BlogRenderer";
import BlogPostCard from "@/components/blog/BlogPostCard";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import type { BlogContent, BlogTheme } from "@/lib/blog/types";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { data: post, isLoading } = useBlogPost(slug);
  const { data: related = [] } = useBlogList({ limit: 4 });

  useEffect(() => {
    if (!post?.id) return;
    // fire-and-forget view ping
    supabase.from("blog_post_views").insert({ post_id: post.id }).then(() => {});
  }, [post?.id]);

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!post || post.status !== "published") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Post not found.</p>
        <Link to="/blog" className="text-primary hover:underline">Back to blog</Link>
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.subtitle,
    image: post.og_image_url || post.cover_url,
    datePublished: post.published_at,
    dateModified: post.updated_at,
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title={post.seo_title || `${post.title} — Mogsy`}
        description={post.seo_description || post.subtitle || ""}
        image={post.og_image_url || post.cover_url || undefined}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <BlogThemeWrapper theme={post.theme as BlogTheme}>
        {post.cover_url && (post.theme as BlogTheme)?.cover !== "boxed" && (
          <div className="w-full aspect-[21/9] max-h-[60vh] overflow-hidden">
            <img src={post.cover_url} alt={post.title} className="w-full h-full object-cover" />
          </div>
        )}
        <article className="max-w-3xl mx-auto px-4 py-10">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm blog-muted hover:opacity-80 mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to blog
          </Link>
          {post.tags?.length > 0 && (
            <div className="text-xs uppercase tracking-widest blog-accent font-bold mb-3">{post.tags[0]}</div>
          )}
          <h1 className="text-4xl md:text-6xl font-bold leading-tight">{post.title}</h1>
          {post.subtitle && <p className="text-lg blog-muted mt-3">{post.subtitle}</p>}
          {post.published_at && (
            <p className="text-xs blog-muted mt-4">{new Date(post.published_at).toLocaleDateString(undefined, { dateStyle: "long" })}</p>
          )}
          {(post.theme as BlogTheme)?.cover === "boxed" && post.cover_url && (
            <img src={post.cover_url} alt={post.title} className="w-full rounded-2xl mt-8 aspect-[16/9] object-cover" />
          )}
          <div className="mt-10">
            <BlogRenderer content={post.content as BlogContent} />
          </div>
        </article>
      </BlogThemeWrapper>

      {related.filter((r) => r.id !== post.id).length > 0 && (
        <div className="max-w-7xl mx-auto px-4 pb-16">
          <h2 className="text-lg font-bold text-foreground mb-4">Keep reading</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {related.filter((r) => r.id !== post.id).slice(0, 3).map((p) => (
              <BlogPostCard key={p.id} post={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}