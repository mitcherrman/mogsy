import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Copy, Settings as Cog, GripVertical } from "lucide-react";
import type { BlogBlock, BlocksContent, BlockType, BlogAnimation } from "@/lib/blog/types";
import { BLOCK_LABELS } from "@/lib/blog/types";
import { FONT_PAIRS } from "@/lib/blog/themes";
import BlockRenderer from "@/components/blog/BlockRenderer";
import InlineEditable from "./InlineEditable";
import FormatToolbar from "./FormatToolbar";

const BLOCK_TYPES: BlockType[] = [
  "heading", "paragraph", "image", "video", "quote", "callout", "divider", "columns",
  "button", "embed", "spacer", "item-card", "profile-card", "leaderboard", "chart", "adsense",
];
const TEXT_BLOCK_TYPES: BlockType[] = ["heading", "paragraph", "quote", "callout"];

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
    case "adsense": return { slot: "", layout: "rectangle", height: 280 };
    default: return {};
  }
}

const ANIMATIONS: BlogAnimation[] = ["none", "fade-in", "slide-up", "scale-in", "parallax", "shimmer"];

function stripHtml(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html ?? "";
  return d.textContent ?? "";
}

export default function BlocksEditor({
  value,
  onChange,
}: {
  value: BlocksContent;
  onChange: (next: BlocksContent) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusAfterAdd, setFocusAfterAdd] = useState<string | null>(null);
  const [insertOpenAt, setInsertOpenAt] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = value.blocks;
  const update = useCallback((next: BlogBlock[]) => onChange({ mode: "blocks", blocks: next }), [onChange]);

  const addAt = useCallback((index: number, type: BlockType): string => {
    const next: BlogBlock = { id: uid(), type, props: defaultProps(type) };
    const arr = [...blocks];
    arr.splice(index, 0, next);
    update(arr);
    setSelectedId(next.id);
    setFocusAfterAdd(next.id);
    setInsertOpenAt(null);
    return next.id;
  }, [blocks, update]);

  const remove = useCallback((id: string) => update(blocks.filter((b) => b.id !== id)), [blocks, update]);
  const duplicate = useCallback((id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const copy: BlogBlock = { ...blocks[i], id: uid(), props: JSON.parse(JSON.stringify(blocks[i].props)), style: blocks[i].style ? { ...blocks[i].style } : undefined };
    const arr = [...blocks];
    arr.splice(i + 1, 0, copy);
    update(arr);
    setSelectedId(copy.id);
  }, [blocks, update]);
  const move = useCallback((id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update(arr);
  }, [blocks, update]);
  const updateBlock = useCallback((id: string, patch: Partial<BlogBlock>) => {
    update(blocks.map((b) => b.id === id
      ? { ...b, ...patch, props: { ...b.props, ...(patch.props ?? {}) }, style: patch.style ? { ...b.style, ...patch.style } : b.style }
      : b));
  }, [blocks, update]);

  // Focus newly added block's editable element
  useEffect(() => {
    if (!focusAfterAdd) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-block-id="${focusAfterAdd}"]`);
    if (el) {
      el.focus();
      // place caret at end
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setFocusAfterAdd(null);
  }, [focusAfterAdd, blocks.length]);

  // Global keyboard shortcuts
  function onKeyDownInBlock(e: React.KeyboardEvent<HTMLElement>, block: BlogBlock, field: "text" | "title" | "label") {
    const meta = e.metaKey || e.ctrlKey;
    // Cmd+B/I/U handled natively by contentEditable
    if (meta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const url = prompt("Link URL");
      if (url) document.execCommand("createLink", false, url);
      return;
    }
    if (meta && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      move(block.id, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (meta && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate(block.id);
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const isEmpty = !el.textContent || el.textContent.length === 0;
    if (e.key === "Backspace" && isEmpty && field === "text") {
      e.preventDefault();
      const i = blocks.findIndex((b) => b.id === block.id);
      remove(block.id);
      // focus previous block's editable
      setTimeout(() => {
        const prev = containerRef.current?.querySelectorAll<HTMLElement>(`[data-block-id]`);
        const target = prev?.[Math.max(0, i - 1)];
        if (target) {
          target.focus();
          const r = document.createRange();
          r.selectNodeContents(target);
          r.collapse(false);
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(r);
        }
      }, 0);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && (block.type === "heading" || block.type === "paragraph")) {
      e.preventDefault();
      const i = blocks.findIndex((b) => b.id === block.id);
      addAt(i + 1, "paragraph");
      return;
    }
  }

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  // Word / character count across all text content
  const counts = useMemo(() => {
    let chars = 0;
    let words = 0;
    for (const b of blocks) {
      const fields = [b.props?.text, b.props?.title, b.props?.label, b.props?.caption].filter(Boolean) as string[];
      for (const f of fields) {
        const t = stripHtml(String(f)).trim();
        chars += t.length;
        if (t) words += t.split(/\s+/).length;
      }
    }
    return { words, chars, blocks: blocks.length };
  }, [blocks]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div>
        {/* Sticky format toolbar */}
        <div className="sticky top-[88px] z-30 mb-3">
          <FormatToolbar />
        </div>

        <div ref={containerRef} className="space-y-1">
          {blocks.length === 0 && (
            <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
              No blocks yet. Click <Plus className="h-3.5 w-3.5 inline" /> below to add one.
            </div>
          )}

          {blocks.map((b, idx) => (
            <div key={b.id}>
              <InsertBetween open={insertOpenAt === idx} onToggle={(v) => setInsertOpenAt(v ? idx : null)} onPick={(t) => addAt(idx, t)} />
              <BlockShell
                block={b}
                isSelected={selectedId === b.id}
                onSelect={() => setSelectedId(b.id)}
                onFocusBlock={() => { setFocusedId(b.id); setSelectedId(b.id); }}
                onMoveUp={() => move(b.id, -1)}
                onMoveDown={() => move(b.id, 1)}
                onDuplicate={() => duplicate(b.id)}
                onRemove={() => remove(b.id)}
                onUpdate={(patch) => updateBlock(b.id, patch)}
                onKeyDownField={(e, field) => onKeyDownInBlock(e, b, field)}
              />
            </div>
          ))}

          <InsertBetween
            open={insertOpenAt === blocks.length}
            onToggle={(v) => setInsertOpenAt(v ? blocks.length : null)}
            onPick={(t) => addAt(blocks.length, t)}
            alwaysVisible
          />
        </div>

        {/* Status bar */}
        <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2">
          <div>{counts.blocks} block{counts.blocks === 1 ? "" : "s"}</div>
          <div className="flex items-center gap-3">
            <span>{counts.words} words</span>
            <span>{counts.chars} characters</span>
            <span className="hidden md:inline opacity-70">⌘B/I/U · ⌘K link · ⌘D duplicate · ⌘⇧↑/↓ move · Enter new paragraph</span>
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

function InsertBetween({ open, onToggle, onPick, alwaysVisible }: { open: boolean; onToggle: (v: boolean) => void; onPick: (t: BlockType) => void; alwaysVisible?: boolean }) {
  return (
    <div className={`relative group ${alwaysVisible ? "" : "h-2 -my-1"}`}>
      <button
        onClick={() => onToggle(!open)}
        className={`absolute left-1/2 -translate-x-1/2 ${alwaysVisible ? "static translate-x-0 mt-2" : "top-1/2 -translate-y-1/2"} inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border border-border text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/40 ${alwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity z-10`}
        aria-label="Insert block here"
      >
        <Plus className="h-3 w-3" /> Add block
      </button>
      {open && (
        <div className={`${alwaysVisible ? "mt-2" : "absolute left-1/2 -translate-x-1/2 top-full mt-1"} z-20 bg-popover border border-border rounded-xl shadow-lg p-2 flex flex-wrap gap-1 w-[min(540px,calc(100vw-2rem))]`}>
          {BLOCK_TYPES.map((t) => (
            <button key={t} onClick={() => onPick(t)} className="px-2.5 py-1 rounded-full text-xs border border-border bg-background hover:border-primary/40 hover:text-primary">
              {BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockShell({
  block, isSelected, onSelect, onFocusBlock, onMoveUp, onMoveDown, onDuplicate, onRemove, onUpdate, onKeyDownField,
}: {
  block: BlogBlock;
  isSelected: boolean;
  onSelect: () => void;
  onFocusBlock: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<BlogBlock>) => void;
  onKeyDownField: (e: React.KeyboardEvent<HTMLElement>, field: "text" | "title" | "label") => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`relative group rounded-xl border ${isSelected ? "border-primary/60" : "border-transparent hover:border-border"} bg-card/40 p-3 transition-colors`}
    >
      {/* Floating side controls */}
      <div className="absolute -left-2 top-2 -translate-x-full flex-col gap-0.5 hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity">
        <button title="Move up (⌘⇧↑)" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} className="p-1 rounded hover:bg-muted"><ChevronUp className="h-3.5 w-3.5" /></button>
        <button aria-label="Drag to reorder" title="Drag handle" className="p-1 cursor-grab" tabIndex={-1}><GripVertical className="h-3.5 w-3.5 text-muted-foreground" /></button>
        <button title="Move down (⌘⇧↓)" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} className="p-1 rounded hover:bg-muted"><ChevronDown className="h-3.5 w-3.5" /></button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2 opacity-60 group-hover:opacity-100">
        <span className="font-semibold uppercase tracking-wider">{BLOCK_LABELS[block.type]}</span>
        <div className="flex items-center gap-0.5">
          <button title="Duplicate (⌘D)" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="p-1 hover:bg-muted rounded"><Copy className="h-3 w-3" /></button>
          <button title="Delete" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="p-1 hover:bg-destructive/20 rounded text-destructive"><Trash2 className="h-3 w-3" /></button>
        </div>
      </div>

      <EditableBlockBody block={block} onUpdate={onUpdate} onKeyDownField={onKeyDownField} onFocusBlock={onFocusBlock} />
    </div>
  );
}

function EditableBlockBody({
  block, onUpdate, onKeyDownField, onFocusBlock,
}: {
  block: BlogBlock;
  onUpdate: (patch: Partial<BlogBlock>) => void;
  onKeyDownField: (e: React.KeyboardEvent<HTMLElement>, field: "text" | "title" | "label") => void;
  onFocusBlock: () => void;
}) {
  const p = block.props ?? {};
  const setProp = (k: string, v: any) => onUpdate({ props: { [k]: v } });

  if (block.type === "heading") {
    const tag = (p.level === 1 ? "h1" : p.level === 3 ? "h3" : "h2") as keyof JSX.IntrinsicElements;
    const sizeCls = p.level === 1 ? "text-4xl md:text-5xl font-bold" : p.level === 3 ? "text-xl font-bold" : "text-2xl md:text-3xl font-bold";
    return (
      <InlineEditable
        html={p.text ?? ""}
        onChange={(v) => setProp("text", v)}
        tag={tag}
        className={sizeCls}
        placeholder="Heading"
        multiline={false}
        onKeyDown={(e) => onKeyDownField(e, "text")}
        onFocus={onFocusBlock}
        ariaLabel="Heading text"
        dataBlockId={block.id}
      />
    );
  }
  if (block.type === "paragraph") {
    return (
      <InlineEditable
        html={p.text ?? ""}
        onChange={(v) => setProp("text", v)}
        tag="p"
        className="leading-relaxed"
        placeholder="Write something…"
        onKeyDown={(e) => onKeyDownField(e, "text")}
        onFocus={onFocusBlock}
        ariaLabel="Paragraph text"
        dataBlockId={block.id}
      />
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote className="border-l-4 pl-4 italic blog-border">
        <InlineEditable
          html={p.text ?? ""}
          onChange={(v) => setProp("text", v)}
          tag="div"
          placeholder="Quote text…"
          onKeyDown={(e) => onKeyDownField(e, "text")}
          onFocus={onFocusBlock}
          ariaLabel="Quote text"
          dataBlockId={block.id}
        />
        <InlineEditable
          html={p.attribution ?? ""}
          onChange={(v) => setProp("attribution", v)}
          tag="footer"
          className="not-italic text-sm blog-muted mt-2"
          placeholder="— attribution"
          multiline={false}
          ariaLabel="Quote attribution"
        />
      </blockquote>
    );
  }
  if (block.type === "callout") {
    return (
      <div className="blog-surface rounded-xl p-4">
        <InlineEditable
          html={p.title ?? ""}
          onChange={(v) => setProp("title", v)}
          tag="div"
          className="font-bold mb-1"
          placeholder="Title"
          multiline={false}
          onKeyDown={(e) => onKeyDownField(e, "title")}
          onFocus={onFocusBlock}
          ariaLabel="Callout title"
          dataBlockId={block.id}
        />
        <InlineEditable
          html={p.text ?? ""}
          onChange={(v) => setProp("text", v)}
          tag="div"
          className="text-sm"
          placeholder="Callout text…"
          onKeyDown={(e) => onKeyDownField(e, "text")}
          ariaLabel="Callout text"
        />
      </div>
    );
  }
  if (block.type === "button") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <InlineEditable
          html={p.label ?? ""}
          onChange={(v) => setProp("label", v)}
          tag="span"
          className="inline-block px-5 py-2.5 rounded-full font-semibold blog-accent-bg"
          placeholder="Button label"
          multiline={false}
          onFocus={onFocusBlock}
          ariaLabel="Button label"
          dataBlockId={block.id}
        />
        <input
          value={p.href ?? ""}
          onChange={(e) => setProp("href", e.target.value)}
          placeholder="https://example.com"
          className="flex-1 min-w-[200px] px-2 py-1 text-xs rounded border border-border bg-background"
        />
      </div>
    );
  }

  // Non-text blocks: render preview, properties live in the inspector panel
  return (
    <div className="pointer-events-none">
      <BlockRenderer block={block} />
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
  const setStyle = (k: keyof typeof s, v: any) => onChange({ style: { [k]: v } as any });

  return (
    <div className="space-y-3">
      {block.type === "heading" && (
        <Field label="Level">
          <select className={inputCls} value={p.level ?? 2} onChange={(e) => setProp("level", Number(e.target.value))}>
            <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
          </select>
        </Field>
      )}
      {TEXT_BLOCK_TYPES.includes(block.type) && (
        <p className="text-[11px] text-muted-foreground">Edit the text directly in the block.</p>
      )}
      {(block.type === "image" || block.type === "video") && <>
        <Field label="URL"><input className={inputCls} value={p.src ?? ""} onChange={(e) => setProp("src", e.target.value)} placeholder="https://…" /></Field>
        {block.type === "image" && <Field label="Alt"><input className={inputCls} value={p.alt ?? ""} onChange={(e) => setProp("alt", e.target.value)} /></Field>}
        {block.type === "image" && <Field label="Caption"><input className={inputCls} value={p.caption ?? ""} onChange={(e) => setProp("caption", e.target.value)} /></Field>}
      </>}
      {block.type === "button" && (
        <Field label="URL"><input className={inputCls} value={p.href ?? ""} onChange={(e) => setProp("href", e.target.value)} /></Field>
      )}
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
      {block.type === "adsense" && <>
        <Field label="AdSense slot ID"><input className={inputCls} value={p.slot ?? ""} onChange={(e) => setProp("slot", e.target.value)} placeholder="e.g. 1234567890" /></Field>
        <Field label="Client ID (optional)"><input className={inputCls} value={p.clientId ?? ""} onChange={(e) => setProp("clientId", e.target.value)} placeholder="ca-pub-… (defaults to global)" /></Field>
        <Field label="Layout">
          <select className={inputCls} value={p.layout ?? "rectangle"} onChange={(e) => setProp("layout", e.target.value)}>
            <option value="rectangle">Rectangle (in-article)</option>
            <option value="horizontal">Horizontal banner</option>
            <option value="leaderboard">Leaderboard (top/bottom)</option>
          </select>
        </Field>
        <Field label="Min height (px)"><input type="number" className={inputCls} value={p.height ?? 280} onChange={(e) => setProp("height", Number(e.target.value))} /></Field>
        <p className="text-[11px] text-muted-foreground">Leave slot empty to show a placeholder until you create a real AdSense slot.</p>
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
