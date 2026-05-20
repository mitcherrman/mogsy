import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPostRow } from "@/lib/blog/types";

// Lean projection for list views — excludes the heavy `content` jsonb so the
// blog index doesn't ship every post's full body over the wire.
const LIST_COLUMNS =
  "id, slug, title, subtitle, cover_url, theme, tags, category, status, published_at, views, seo_title, seo_description, og_image_url, created_at, updated_at";

export function useBlogList(opts: { limit?: number; tag?: string; search?: string } = {}) {
  const { limit = 50, tag, search } = opts;
  return useQuery({
    queryKey: ["blog-list", limit, tag, search],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from("blog_posts")
        .select(LIST_COLUMNS)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(limit);
      if (tag) q = q.contains("tags", [tag]);
      if (search) q = q.ilike("title", `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BlogPostRow[];
    },
  });
}

/** Tiny projection — just the tag arrays. Used to build the filter pills
 *  without re-downloading every post when the user types/searches. */
export function useBlogTags() {
  return useQuery({
    queryKey: ["blog-tags"],
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("tags")
        .eq("status", "published")
        .limit(200);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of data ?? []) {
        for (const t of (row as any).tags ?? []) set.add(t);
      }
      return Array.from(set);
    },
  });
}

export function useBlogPost(slug?: string) {
  return useQuery({
    queryKey: ["blog-post", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BlogPostRow | null;
    },
  });
}

/** Admin/editor: fetch all posts including drafts/scheduled. RLS will filter on the server. */
export function useAdminBlogList() {
  return useQuery({
    queryKey: ["admin-blog-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlogPostRow[];
    },
  });
}

export function useAdminBlogPost(id?: string) {
  return useQuery({
    queryKey: ["admin-blog-post", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as unknown as BlogPostRow | null;
    },
  });
}