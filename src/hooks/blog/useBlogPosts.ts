import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPostRow } from "@/lib/blog/types";

export function useBlogList(opts: { limit?: number; tag?: string; search?: string } = {}) {
  const { limit = 50, tag, search } = opts;
  return useQuery({
    queryKey: ["blog-list", limit, tag, search],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("blog_posts")
        .select("*")
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