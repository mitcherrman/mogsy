import { Link } from "react-router-dom";
import type { BlogPostRow } from "@/lib/blog/types";
import { getBlogTheme } from "@/lib/blog/themes";

export default function BlogPostCard({ post, size = "md" }: { post: BlogPostRow; size?: "sm" | "md" | "lg" }) {
  const theme = getBlogTheme(post.theme?.preset);
  const aspect = size === "lg" ? "aspect-[16/9]" : size === "sm" ? "aspect-square" : "aspect-[4/3]";
  return (
    <Link
      to={`/blog/${post.slug}`}
      title={post.title}
      className={`group block ${size === "sm" ? "rounded-lg" : "rounded-2xl"} overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors`}
    >
      <div className={`${aspect} relative overflow-hidden`} style={{ background: theme.vars["--blog-bg"] }}>
        {post.cover_url ? (
          <img src={post.cover_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: theme.vars["--blog-accent"] }}>
            <span className={`${size === "sm" ? "text-xl" : "text-3xl"} font-bold opacity-40`}>{post.title?.slice(0, 1) || "M"}</span>
          </div>
        )}
        {size === "sm" && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <p className="text-[10px] font-semibold text-white line-clamp-2 leading-tight">{post.title}</p>
          </div>
        )}
      </div>
      {size !== "sm" && (
        <div className="p-4">
          {post.tags?.length > 0 && (
            <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">{post.tags[0]}</div>
          )}
          <h3 className="font-bold text-foreground line-clamp-2 leading-tight">{post.title}</h3>
          {post.subtitle && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{post.subtitle}</p>}
          {post.published_at && (
            <p className="text-xs text-muted-foreground mt-2">{new Date(post.published_at).toLocaleDateString()}</p>
          )}
        </div>
      )}
    </Link>
  );
}