import type { BlogContent, BlogBlock, CanvasNode } from "@/lib/blog/types";
import BlockRenderer from "./BlockRenderer";
import { safeHref } from "@/lib/safe-url";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";

interface BlogRendererProps {
  content: BlogContent | Record<string, never> | null | undefined;
  /** Opt-in decorative mascot for the empty-content state. Only intended for finished/published surfaces (e.g. the public post page) — not for in-progress editor previews. Defaults to false. */
  showEmptyMascot?: boolean;
}

/** Renders any of the three editor modes back to read-only HTML. */
export default function BlogRenderer({ content, showEmptyMascot = false }: BlogRendererProps) {
  if (!content || !(content as any).mode) {
    return (
      <div className="blog-muted text-center py-12">
        {showEmptyMascot && (
          <MogzyMascot pose="sleeping" decorative className="mx-auto mb-4 h-24 w-24" />
        )}
        Nothing here yet.
      </div>
    );
  }
  const c = content as BlogContent;

  if (c.mode === "blocks") {
    return (
      <div className="space-y-5">
        {c.blocks.map((b) => <BlockRenderer key={b.id} block={b} />)}
      </div>
    );
  }

  if (c.mode === "rich") {
    return <RichRenderer doc={c.doc} widgets={c.widgets ?? {}} />;
  }

  // canvas
  const ratio = c.h > 0 ? c.h / c.w : 9 / 16;
  return (
    <div className="relative w-full rounded-2xl overflow-hidden blog-border border" style={{ paddingTop: `${ratio * 100}%` }}>
      <div className="absolute inset-0" style={{ width: c.w, height: c.h, transformOrigin: "top left" }}>
        <CanvasInner nodes={c.nodes} w={c.w} h={c.h} />
      </div>
    </div>
  );
}

function CanvasInner({ nodes, w, h }: { nodes: CanvasNode[]; w: number; h: number }) {
  // Scale to container width
  return (
    <div className="relative" style={{ width: w, height: h }}>
      {nodes.map((n) => (
        <div
          key={n.id}
          className="absolute"
          style={{ left: n.x, top: n.y, width: n.w, height: n.h, transform: n.rotation ? `rotate(${n.rotation}deg)` : undefined, zIndex: n.zIndex }}
        >
          <BlockRenderer block={{ id: n.id, type: n.type, props: n.props, style: n.style } as BlogBlock} />
        </div>
      ))}
    </div>
  );
}

/** Minimal Tiptap JSON -> HTML walker. Handles common node/mark types. */
function RichRenderer({ doc, widgets }: { doc: any; widgets: Record<string, any> }) {
  if (!doc || !doc.content) return null;
  return <div>{(doc.content as any[]).map((n, i) => renderNode(n, i, widgets))}</div>;
}

function renderNode(node: any, key: number, widgets: Record<string, any>): React.ReactNode {
  if (!node) return null;
  const children = (node.content ?? []).map((c: any, i: number) => renderNode(c, i, widgets));
  switch (node.type) {
    case "doc": return <>{children}</>;
    case "paragraph": return <p key={key}>{children.length ? children : <br />}</p>;
    case "heading": {
      const lvl = Math.min(Math.max(node.attrs?.level ?? 2, 1), 4);
      const Tag = (`h${lvl}`) as "h1" | "h2" | "h3" | "h4";
      return <Tag key={key}>{children}</Tag>;
    }
    case "bulletList": return <ul key={key}>{children}</ul>;
    case "orderedList": return <ol key={key}>{children}</ol>;
    case "listItem": return <li key={key}>{children}</li>;
    case "blockquote": return <blockquote key={key}>{children}</blockquote>;
    case "horizontalRule": return <hr key={key} className="my-6 blog-border" />;
    case "hardBreak": return <br key={key} />;
    case "image": return <img key={key} src={node.attrs?.src} alt={node.attrs?.alt ?? ""} className="rounded-xl my-4 max-w-full" loading="lazy" />;
    case "text": {
      let el: React.ReactNode = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") el = <strong>{el}</strong>;
        else if (mark.type === "italic") el = <em>{el}</em>;
        else if (mark.type === "code") el = <code>{el}</code>;
        else if (mark.type === "underline") el = <u>{el}</u>;
        else if (mark.type === "strike") el = <s>{el}</s>;
        else if (mark.type === "link") el = <a href={safeHref(mark.attrs?.href)} target="_blank" rel="noopener noreferrer">{el}</a>;
      }
      return <span key={key}>{el}</span>;
    }
    case "widget": {
      const id = node.attrs?.id;
      const w = widgets[id];
      if (!w) return null;
      return (
        <div key={key} className="my-4">
          <BlockRendererDispatch type={w.type} props={w.props} />
        </div>
      );
    }
    default: return children;
  }
}

function BlockRendererDispatch({ type, props }: { type: any; props: any }) {
  const block = { id: "w", type, props } as BlogBlock;
  return <BlockRenderer block={block} />;
}