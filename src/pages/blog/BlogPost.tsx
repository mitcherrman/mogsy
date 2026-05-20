import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { useBlogPost, useBlogList } from "@/hooks/blog/useBlogPosts";
import BlogThemeWrapper from "@/components/blog/BlogThemeWrapper";
import BlogRenderer from "@/components/blog/BlogRenderer";
import BlogPostCard from "@/components/blog/BlogPostCard";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { BlogContent, BlogTheme } from "@/lib/blog/types";
import { SITE_URL } from "@/lib/site-config";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data: post, isLoading } = useBlogPost(slug);
  const { data: related = [] } = useBlogList({ limit: 4 });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = (data ?? []).map((r) => r.role as string);
      setIsAdmin(roles.includes("admin") || roles.includes("master_admin"));
    });
  }, [user]);

  useEffect(() => {
    if (!post?.id) return;
    // fire-and-forget view ping
    supabase.from("blog_post_views").insert({ post_id: post.id }).then(() => {});
  }, [post?.id]);

  if (isLoading) {
    return <div className="min-h-dvh bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!post || post.status !== "published") {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 text-muted-foreground">
        <p>Post not found.</p>
        <Link to="/blog" className="text-primary hover:underline">Back to blog</Link>
      </div>
    );
  }

  const canonicalPath = `/blog/${post.slug}`;
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const heroImage = post.og_image_url || post.cover_url || undefined;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    headline: post.title,
    name: post.title,
    description: post.seo_description || post.subtitle || undefined,
    image: heroImage ? [heroImage] : undefined,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    inLanguage: "en",
    url: canonicalUrl,
    keywords: (post.tags ?? []).join(", ") || undefined,
    articleSection: post.category || (post.tags?.[0] ?? undefined),
    author: { "@type": "Organization", name: "Mogsy", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Mogsy",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/mogsy-logo.png` },
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return (
    <div className="min-h-dvh bg-background">
      <SEOHead
        title={post.seo_title || `${post.title} — Mogsy`}
        description={post.seo_description || post.subtitle || `${post.title} on Mogsy.`}
        path={canonicalPath}
        image={heroImage}
        type="article"
        keywords={(post.tags ?? []).join(", ") || undefined}
        article={{
          publishedTime: post.published_at,
          modifiedTime: post.updated_at,
          section: post.category || post.tags?.[0] || null,
          tags: post.tags ?? [],
          author: "Mogsy",
        }}
        jsonLd={[articleLd, breadcrumbLd]}
      />

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

      {isAdmin && (
        <Link
          to={`/admin/blog/${post.id}`}
          aria-label="Edit this post"
          className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-50 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:opacity-90 min-h-11"
        >
          <Pencil className="h-4 w-4" /> Edit post
        </Link>
      )}
    </div>
  );
}