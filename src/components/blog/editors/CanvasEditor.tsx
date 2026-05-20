import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CanvasContent, CanvasNode, BlockType } from "@/lib/blog/types";
import { BLOCK_LABELS } from "@/lib/blog/types";
import BlockRenderer from "@/components/blog/BlockRenderer";

function uid() { return Math.random().toString(36).slice(2, 10); }

function defaultProps(type: BlockType): Record<string, any> {
  if (type === "heading") return { text: "Headline", level: 1 };
  if (type === "paragraph") return { text: "Some text" };
  if (type === "image") return { src: "" };
  if (type === "button") return { label: "Click", href: "#" };
  return {};
}

const ADDABLE: BlockType[] = ["heading", "paragraph", "image", "button", "item-card", "profile-card", "leaderboard", "chart"];

export default function CanvasEditor({
  value,
  onChange,
}: {
  value: CanvasContent;
  onChange: (next: CanvasContent) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function add(type: BlockType) {
    const node: CanvasNode = { id: uid(), type, x: 40, y: 40, w: 300, h: 100, props: defaultProps(type) };
    onChange({ ...value, nodes: [...value.nodes, node] });
    setSelectedId(node.id);
  }
  function update(id: string, patch: Partial<CanvasNode>) {
    onChange({ ...value, nodes: value.nodes.map((n) => n.id === id ? { ...n, ...patch, props: { ...n.props, ...(patch.props ?? {}) } } : n) });
  }
  function remove(id: string) { onChange({ ...value, nodes: value.nodes.filter((n) => n.id !== id) }); }

  function onMouseDownNode(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setSelectedId(id);
    const startX = e.clientX, startY = e.clientY;
    const node = value.nodes.find((n) => n.id === id);
    if (!node) return;
    const ox = node.x, oy = node.y;
    const onMove = (ev: MouseEvent) => {
      update(id, { x: Math.max(0, ox + (ev.clientX - startX)), y: Math.max(0, oy + (ev.clientY - startY)) });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const selected = value.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ADDABLE.map((t) => (
            <button key={t} onClick={() => add(t)} className="px-2.5 py-1 rounded-full text-xs border border-border bg-background hover:border-primary/40">
              <Plus className="h-3 w-3 inline mr-0.5" />{BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
        <div
          ref={containerRef}
          className="relative blog-canvas-grid rounded-xl border border-border overflow-hidden"
          style={{ width: value.w, maxWidth: "100%", height: value.h, transformOrigin: "top left" }}
          onClick={() => setSelectedId(null)}
        >
          {value.nodes.map((n) => (
            <div
              key={n.id}
              onMouseDown={(e) => onMouseDownNode(e, n.id)}
              className={`absolute cursor-move ${selectedId === n.id ? "outline outline-2 outline-primary" : ""}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h, zIndex: n.zIndex }}
            >
              <BlockRenderer block={{ id: n.id, type: n.type, props: n.props, style: n.style } as any} />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-4 h-fit sticky top-4 text-sm space-y-3">
        <div className="font-bold">Canvas</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">W<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={value.w} onChange={(e) => onChange({ ...value, w: Number(e.target.value) })} /></label>
          <label className="text-xs">H<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={value.h} onChange={(e) => onChange({ ...value, h: Number(e.target.value) })} /></label>
        </div>
        {selected && (
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold">{BLOCK_LABELS[selected.type]}</span>
              <button onClick={() => remove(selected.id)} className="text-destructive p-1 hover:bg-destructive/10 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label>X<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.x} onChange={(e) => update(selected.id, { x: Number(e.target.value) })} /></label>
              <label>Y<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.y} onChange={(e) => update(selected.id, { y: Number(e.target.value) })} /></label>
              <label>W<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.w} onChange={(e) => update(selected.id, { w: Number(e.target.value) })} /></label>
              <label>H<input type="number" className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.h} onChange={(e) => update(selected.id, { h: Number(e.target.value) })} /></label>
            </div>
            {"text" in selected.props && (
              <label className="text-xs block">Text<textarea className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" rows={3} value={selected.props.text} onChange={(e) => update(selected.id, { props: { text: e.target.value } })} /></label>
            )}
            {"src" in selected.props && (
              <label className="text-xs block">Src<input className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.props.src ?? ""} onChange={(e) => update(selected.id, { props: { src: e.target.value } })} /></label>
            )}
            {("itemId" in selected.props || selected.type === "item-card") && (
              <label className="text-xs block">Item ID<input className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.props.itemId ?? ""} onChange={(e) => update(selected.id, { props: { itemId: e.target.value } })} /></label>
            )}
            {("profileId" in selected.props || selected.type === "profile-card") && (
              <label className="text-xs block">Profile ID<input className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.props.profileId ?? ""} onChange={(e) => update(selected.id, { props: { profileId: e.target.value } })} /></label>
            )}
            {("leagueId" in selected.props || selected.type === "leaderboard" || selected.type === "chart") && (
              <label className="text-xs block">League ID<input className="w-full mt-1 px-2 py-1 rounded border border-border bg-background" value={selected.props.leagueId ?? ""} onChange={(e) => update(selected.id, { props: { leagueId: e.target.value } })} /></label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}