import type { BlogBlock, BlockStyle } from "@/lib/blog/types";
import ItemCardBlock from "./data-blocks/ItemCardBlock";
import ProfileCardBlock from "./data-blocks/ProfileCardBlock";
import LeaderboardBlock from "./data-blocks/LeaderboardBlock";
import ChartBlock from "./data-blocks/ChartBlock";

function styleToCss(s?: BlockStyle): React.CSSProperties {
  if (!s) return {};
  return {
    textAlign: s.align,
    fontFamily: s.fontFamily,
    color: s.color,
    background: s.background,
    paddingTop: s.paddingY,
    paddingBottom: s.paddingY,
    paddingLeft: s.paddingX,
    paddingRight: s.paddingX,
    maxWidth: s.maxWidth,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    letterSpacing: s.letterSpacing,
    fontStyle: s.italic ? "italic" : undefined,
    textTransform: s.uppercase ? "uppercase" : undefined,
    marginInline: s.maxWidth ? "auto" : undefined,
  };
}

function animClass(a?: string) {
  switch (a) {
    case "fade-in": return "blog-anim-fade-in";
    case "slide-up": return "blog-anim-slide-up";
    case "scale-in": return "blog-anim-scale-in";
    case "shimmer": return "blog-anim-shimmer";
    default: return "";
  }
}

export default function BlockRenderer({ block }: { block: BlogBlock }) {
  const css = styleToCss(block.style);
  const cls = animClass(block.style?.animation);
  const p = block.props ?? {};

  switch (block.type) {
    case "heading": {
      const Tag = (p.level === 1 ? "h1" : p.level === 3 ? "h3" : "h2") as keyof JSX.IntrinsicElements;
      return <Tag className={cls} style={css}>{p.text || "Heading"}</Tag>;
    }
    case "paragraph":
      return <p className={cls} style={css}>{p.text || ""}</p>;
    case "image":
      return p.src ? (
        <figure className={cls} style={css}>
          <img src={p.src} alt={p.alt || ""} className="w-full rounded-xl" loading="lazy" />
          {p.caption && <figcaption className="text-xs blog-muted text-center mt-2">{p.caption}</figcaption>}
        </figure>
      ) : null;
    case "video":
      return p.src ? (
        <video src={p.src} className={`w-full rounded-xl ${cls}`} style={css} autoPlay={p.autoplay !== false} loop muted={p.muted !== false} playsInline controls={!!p.controls} />
      ) : null;
    case "quote":
      return (
        <blockquote className={`border-l-4 pl-4 italic blog-border ${cls}`} style={css}>
          <p>{p.text || ""}</p>
          {p.attribution && <footer className="not-italic text-sm blog-muted mt-2">— {p.attribution}</footer>}
        </blockquote>
      );
    case "callout":
      return (
        <div className={`blog-surface rounded-xl p-4 ${cls}`} style={css}>
          {p.title && <div className="font-bold mb-1">{p.title}</div>}
          <div className="text-sm">{p.text}</div>
        </div>
      );
    case "divider":
      return <hr className="my-6 blog-border" />;
    case "spacer":
      return <div style={{ height: p.height ?? 32 }} />;
    case "button":
      return p.href ? (
        <a href={p.href} target={p.newTab ? "_blank" : undefined} rel="noopener" className={`inline-block px-5 py-2.5 rounded-full font-semibold blog-accent-bg ${cls}`} style={css}>
          {p.label || "Click"}
        </a>
      ) : null;
    case "embed":
      return p.html ? (
        <div className={cls} style={css} dangerouslySetInnerHTML={{ __html: p.html }} />
      ) : null;
    case "columns": {
      const cols = Array.isArray(p.columns) ? p.columns : [];
      return (
        <div className={`grid gap-4 ${cls}`} style={{ gridTemplateColumns: `repeat(${cols.length || 2}, minmax(0,1fr))`, ...css }}>
          {cols.map((c: any, i: number) => (
            <div key={i}>{(c.blocks ?? []).map((b: BlogBlock) => <BlockRenderer key={b.id} block={b} />)}</div>
          ))}
        </div>
      );
    }
    case "item-card":
      return <div className={cls} style={css}><ItemCardBlock itemId={p.itemId} layout={p.layout} /></div>;
    case "profile-card":
      return <div className={cls} style={css}><ProfileCardBlock profileId={p.profileId} /></div>;
    case "leaderboard":
      return <div className={cls} style={css}><LeaderboardBlock leagueId={p.leagueId} limit={p.limit ?? 10} /></div>;
    case "chart":
      return <div className={cls} style={css}><ChartBlock {...p} /></div>;
    default:
      return null;
  }
}