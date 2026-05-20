import { useBlogItem } from "@/hooks/blog/useBlogData";

export default function ItemCardBlock({ itemId, layout = "vertical" }: { itemId?: string; layout?: "vertical" | "horizontal" }) {
  const { data: item, isLoading } = useBlogItem(itemId);
  if (!itemId) return <div className="blog-surface rounded-xl p-4 text-center blog-muted">Pick an item</div>;
  if (isLoading) return <div className="blog-surface rounded-xl p-4 animate-pulse h-32" />;
  if (!item) return <div className="blog-surface rounded-xl p-4 blog-muted">Item not found</div>;

  if (layout === "horizontal") {
    return (
      <div className="blog-surface rounded-xl overflow-hidden flex items-stretch">
        {item.image_url && <img src={item.image_url} alt={item.name} className="w-32 h-32 object-cover shrink-0" loading="lazy" />}
        <div className="p-4 flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider blog-muted">{item.league_name}</div>
          <div className="text-lg font-bold truncate">{item.name}</div>
          {item.subtitle && <div className="text-sm blog-muted line-clamp-2">{item.subtitle}</div>}
          <div className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold blog-accent">✦ Aura {item.elo}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="blog-surface rounded-2xl overflow-hidden">
      {item.image_url && (
        <div className="aspect-[4/3] overflow-hidden">
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-widest blog-muted">{item.league_name}</div>
        <div className="text-xl font-bold mt-1">{item.name}</div>
        {item.subtitle && <div className="text-sm blog-muted mt-1">{item.subtitle}</div>}
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold blog-accent-bg">✦ {item.elo}</div>
      </div>
    </div>
  );
}
