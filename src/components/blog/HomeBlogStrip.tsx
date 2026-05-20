import { Link } from "react-router-dom";
import { BookOpen, ChevronRight } from "lucide-react";
import { useBlogList } from "@/hooks/blog/useBlogPosts";
import BlogPostCard from "./BlogPostCard";

export default function HomeBlogStrip() {
  const { data: posts = [] } = useBlogList({ limit: 3 });
  if (!posts.length) return null;
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Latest from the blog
        </h2>
        <Link to="/blog" className="text-xs text-primary hover:underline flex items-center gap-1">
          See all <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {posts.map((p) => <BlogPostCard key={p.id} post={p} />)}
      </div>
    </section>
  );
}