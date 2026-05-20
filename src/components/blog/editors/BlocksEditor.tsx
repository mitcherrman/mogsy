import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Settings as Cog } from "lucide-react";
import type { BlogBlock, BlocksContent, BlockType, BlogAnimation } from "@/lib/blog/types";
import { BLOCK_LABELS } from "@/lib/blog/types";
import { FONT_PAIRS } from "@/lib/blog/themes";
import BlockRenderer from "@/components/blog/BlockRenderer";

const BLOCK_TYPES: BlockType[] = [
  "heading", "paragraph", "image", "video", "quote", "callout", "divider", "columns",
  "button", "embed", "spacer", "item-card", "profile-card", "leaderboard", "chart",
];

function uid() { return Math.random().toString(36).slice(2, 10); }

function defaultProps(type: BlockType): Record<string, any> {
  switch (type) {
    case "heading": return { text: "New heading", level: 2 };
    case "paragraph": return { text: "Write something…" };
    case "image": return { src: "", alt: "" };
    case "video": return { src: "" };
    case "quote": return { text: "An inspiring quote." };
    case "callout": return { title: "Heads up", text: "Important note." };
    case "button": return { label: "Click me", href: "#", newTab: true };
    case "embed": return { html: "" };
    case "spacer": return { height: 40 };
    case "columns": return { columns: [{ blocks: [] }, { blocks: [] }] };
    case "item-card": return { itemId: "", layout: "vertical" };
    case "profile-card": return { profileId: "" };
    case "leaderboard": return { leagueId: "", limit: 10 };
    case "chart": return { kind: "aura-history", days: 30, height: 240 };
    default: return {};
  }
}

const ANIMATIONS: BlogAnimation[] = ["none", "fade-in", "slide-up", "scale-in", "parallax", "shimmer"];

export default function BlocksEditor({
  value,
  onChange,
}: {
  value: BlocksContent;
  onChange: (next: BlocksContent) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function update(blocks: BlogBlock[]) {
    onChange({ mode: "blocks", blocks });
  }

  function add(type: BlockType) {
    const next: BlogBlock = { id: uid(), type, props: defaultProps(type) };
    update([...value.blocks, next]);
    setSelectedId(next.id);
  }
  function remove(id: string) { update(value.blocks.filter((b) => b.id !== id)); }
  function move(id: string, dir: -1 | 1) {
    const i = value.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= value.blocks.length) return;
    const arr = [...value.blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update(arr);
  }
  function updateBlock(id: string, patch: Partial<BlogBlock>) {
    update(value.blocks.map((b) => b.id === id ? { ...b, ...patch, props: { ...b.props, ...(patch.props ?? {}) }, style: patch.style ?? b.style } : b));
  }

  const selected = value.blocks.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-3">
        {value.blocks.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
            No blocks yet. Add one below.
          </div>
        )}
        {value.blocks.map((b) => (
          <div
            key={b.id}
            onClick={() => setSelectedId(b.id)}
            className={`relative group rounded-xl border ${selectedId === b.id ? "border-primary" : "border-border"} bg-card p-3`}
          >
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
              <span className="font-semibold uppercase tracking-wider">{BLOCK_LABELS[b.type]}</span>
              <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                <button onClick={(e) => { e.stopPropagation(); move(b.id, -1); }} className="p-1 hover:bg-muted rounded"><ChevronUp className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); move(b.id, 1); }} className="p-1 hover:bg-muted rounded"><ChevronDown className="h-3 w-3" /></button>
                <button onClick={(e) => { e.stopPropagation(); remove(b.id); }} className="p-1 hover:bg-destructive/20 rounded text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            <div className="pointer-events-none">
              <BlockRenderer block={b} />
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-dashed border-border p-3">
          <div className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1"><Plus className="h-3 w-3" /> Add block</div>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_TYPES.map((t) => (
              <button key={t} onClick={() => add(t)} className="px-2.5 py-1 rounded-full text-xs border border-border bg-background hover:border-primary/40 hover:text-primary transition-colors">
                {BLOCK_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 h-fit sticky top-4">
        <div className="flex items-center gap-2 text-sm font-bold mb-3"><Cog className="h-4 w-4" /> Block settings</div>
        {!selected ? (
          <p className="text-xs text-muted-foreground">Click a block to edit its properties and style.</p>
        ) : (
          <BlockInspector block={selected} onChange={(patch) => updateBlock(selected.id, patch)} />
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputCls = "w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm";

function BlockInspector({ block, onChange }: { block: BlogBlock; onChange: (patch: Partial<BlogBlock>) => void }) {
  const p = block.props;
  const s = block.style ?? {};
  const setProp = (k: string, v: any) => onChange({ props: { [k]: v } });
  const setStyle = (k: keyof typeof s, v: any) => onChange({ style: { ...s, [k]: v } });

  return (
    <div className="space-y-3">
      {block.type === "heading" && <>
        <Field label="Text"><input className={inputCls} value={p.text ?? ""} onChange={(e) => setProp("text", e.target.value)} /></Field>
        <Field label="Level">
          <select className={inputCls} value={p.level ?? 2} onChange={(e) => setProp("level", Number(e.target.value))}>
            <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
          </select>
        </Field>
      </>}
      {(block.type === "paragraph" || block.type === "quote" || block.type === "callout") && <>
        {block.type === "callout" && <Field label="Title"><input className={inputCls} value={p.title ?? ""} onChange={(e) => setProp("title", e.target.value)} /></Field>}
        <Field label="Text"><textarea className={inputCls} rows={4} value={p.text ?? ""} onChange={(e) => setProp("text", e.target.value)} /></Field>
        {block.type === "quote" && <Field label="Attribution"><input className={inputCls} value={p.attribution ?? ""} onChange={(e) => setProp("attribution", e.target.value)} /></Field>}
      </>}
      {(block.type === "image" || block.type === "video") && <>
        <Field label="URL"><input className={inputCls} value={p.src ?? ""} onChange={(e) => setProp("src", e.target.value)} placeholder="https://…" /></Field>
        {block.type === "image" && <Field label="Alt"><input className={inputCls} value={p.alt ?? ""} onChange={(e) => setProp("alt", e.target.value)} /></Field>}
        {block.type === "image" && <Field label="Caption"><input className={inputCls} value={p.caption ?? ""} onChange={(e) => setProp("caption", e.target.value)} /></Field>}
      </>}
      {block.type === "button" && <>
        <Field label="Label"><input className={inputCls} value={p.label ?? ""} onChange={(e) => setProp("label", e.target.value)} /></Field>
        <Field label="URL"><input className={inputCls} value={p.href ?? ""} onChange={(e) => setProp("href", e.target.value)} /></Field>
      </>}
      {block.type === "embed" && <Field label="HTML"><textarea className={`${inputCls} font-mono text-xs`} rows={6} value={p.html ?? ""} onChange={(e) => setProp("html", e.target.value)} /></Field>}
      {block.type === "spacer" && <Field label="Height (px)"><input type="number" className={inputCls} value={p.height ?? 40} onChange={(e) => setProp("height", Number(e.target.value))} /></Field>}
      {block.type === "item-card" && <>
        <Field label="Item ID"><input className={inputCls} value={p.itemId ?? ""} onChange={(e) => setProp("itemId", e.target.value)} placeholder="preset_items.id" /></Field>
        <Field label="Layout">
          <select className={inputCls} value={p.layout ?? "vertical"} onChange={(e) => setProp("layout", e.target.value)}>
            <option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>
          </select>
        </Field>
      </>}
      {block.type === "profile-card" && <Field label="Profile ID"><input className={inputCls} value={p.profileId ?? ""} onChange={(e) => setProp("profileId", e.target.value)} /></Field>}
      {block.type === "leaderboard" && <>
        <Field label="League ID"><input className={inputCls} value={p.leagueId ?? ""} onChange={(e) => setProp("leagueId", e.target.value)} /></Field>
        <Field label="Limit"><input type="number" className={inputCls} value={p.limit ?? 10} onChange={(e) => setProp("limit", Number(e.target.value))} /></Field>
      </>}
      {block.type === "chart" && <>
        <Field label="Kind">
          <select className={inputCls} value={p.kind ?? "aura-history"} onChange={(e) => setProp("kind", e.target.value)}>
            <option value="aura-history">Aura history</option>
            <option value="matchup-counts">Matchup counts</option>
            <option value="win-rate">Win rate</option>
          </select>
        </Field>
        <Field label="Item ID"><input className={inputCls} value={p.itemId ?? ""} onChange={(e) => setProp("itemId", e.target.value)} /></Field>
        <Field label="Profile ID"><input className={inputCls} value={p.profileId ?? ""} onChange={(e) => setProp("profileId", e.target.value)} /></Field>
        <Field label="League ID"><input className={inputCls} value={p.leagueId ?? ""} onChange={(e) => setProp("leagueId", e.target.value)} /></Field>
        <Field label="Days"><input type="number" className={inputCls} value={p.days ?? 30} onChange={(e) => setProp("days", Number(e.target.value))} /></Field>
      </>}

      <div className="pt-3 border-t border-border space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Style</div>
        <Field label="Align">
          <select className={inputCls} value={s.align ?? ""} onChange={(e) => setStyle("align", e.target.value || undefined)}>
            <option value="">Default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>
        </Field>
        <Field label="Font family">
          <select className={inputCls} value={s.fontFamily ?? ""} onChange={(e) => setStyle("fontFamily", e.target.value || undefined)}>
            <option value="">Default</option>
            {Object.entries(FONT_PAIRS).flatMap(([_, p]) => [
              <option key={p.heading} value={p.heading}>{p.heading.split(",")[0].replace(/'/g, "")}</option>,
              <option key={p.body} value={p.body}>{p.body.split(",")[0].replace(/'/g, "")}</option>,
            ])}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Color"><input type="color" className={inputCls} value={s.color ?? "#ffffff"} onChange={(e) => setStyle("color", e.target.value)} /></Field>
          <Field label="BG"><input type="color" className={inputCls} value={s.background ?? "#000000"} onChange={(e) => setStyle("background", e.target.value)} /></Field>
        </div>
        <Field label="Animation">
          <select className={inputCls} value={s.animation ?? "none"} onChange={(e) => setStyle("animation", e.target.value as BlogAnimation)}>
            {ANIMATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Font size (px)"><input type="number" className={inputCls} value={s.fontSize ?? ""} onChange={(e) => setStyle("fontSize", e.target.value ? Number(e.target.value) : undefined)} /></Field>
      </div>
    </div>
  );
}