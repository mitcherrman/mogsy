import { Link } from "react-router-dom";
import type { BlogPostRow } from "@/lib/blog/types";
import { getBlogTheme } from "@/lib/blog/themes";

export default function BlogPostCard({ post, size = "md" }: { post: BlogPostRow; size?: "sm" | "md" | "lg" }) {
  const theme = getBlogTheme(post.theme?.preset);
  const aspect = size === "lg" ? "aspect-[16/9]" : size === "sm" ? "aspect-square" : "aspect-[4/3]";
  const padding = size === "sm" ? "p-2" : "p-4";
  const titleCls = size === "sm" ? "text-xs leading-tight" : "leading-tight";
  return (
    <Link to={`/blog/${post.slug}`} className={`group block ${size === "sm" ? "rounded-lg" : "rounded-2xl"} overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors`}>
      <div className={`${aspect} relative overflow-hidden`} style={{ background: theme.vars["--blog-bg"] }}>
        {post.cover_url ? (
          <img src={post.cover_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: theme.vars["--blog-accent"] }}>
            <span className={`${size === "sm" ? "text-xl" : "text-3xl"} font-bold opacity-40`}>{post.title?.slice(0, 1) || "M"}</span>
          </div>
        )}
      </div>
      <div className={padding}>
        {size !== "sm" && post.tags?.length > 0 && (
          <div className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-1">{post.tags[0]}</div>
        )}
        <h3 className={`font-bold text-foreground line-clamp-2 ${titleCls}`}>{post.title}</h3>
        {size !== "sm" && post.subtitle && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{post.subtitle}</p>}
        {size !== "sm" && post.published_at && (
          <p className="text-xs text-muted-foreground mt-2">{new Date(post.published_at).toLocaleDateString()}</p>
        )}
      </div>
    </Link>
  );
}