import { Bold, Italic, Underline, Strikethrough, Link2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Highlighter, Code, Eraser, Type } from "lucide-react";

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

const btn = "p-1.5 rounded hover:bg-muted text-foreground/80 hover:text-foreground transition-colors";

interface Props {
  onColor?: (color: string) => void;
}

export default function FormatToolbar({ onColor }: Props) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap bg-card border border-border rounded-lg p-1 shadow-sm">
      <button title="Bold (Ctrl+B)" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}><Bold className="h-3.5 w-3.5" /></button>
      <button title="Italic (Ctrl+I)" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}><Italic className="h-3.5 w-3.5" /></button>
      <button title="Underline (Ctrl+U)" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}><Underline className="h-3.5 w-3.5" /></button>
      <button title="Strikethrough" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough"); }}><Strikethrough className="h-3.5 w-3.5" /></button>
      <button title="Inline code" className={btn} onMouseDown={(e) => { e.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const t = sel.toString();
        exec("insertHTML", `<code>${t.replace(/</g, "&lt;")}</code>`);
      }}><Code className="h-3.5 w-3.5" /></button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button title="Bullet list" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}><List className="h-3.5 w-3.5" /></button>
      <button title="Numbered list" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}><ListOrdered className="h-3.5 w-3.5" /></button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button title="Align left" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }}><AlignLeft className="h-3.5 w-3.5" /></button>
      <button title="Align center" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }}><AlignCenter className="h-3.5 w-3.5" /></button>
      <button title="Align right" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("justifyRight"); }}><AlignRight className="h-3.5 w-3.5" /></button>
      <div className="w-px h-5 bg-border mx-0.5" />
      <button title="Insert link (Ctrl+K)" className={btn} onMouseDown={(e) => {
        e.preventDefault();
        const url = prompt("Link URL");
        if (url) exec("createLink", url);
      }}><Link2 className="h-3.5 w-3.5" /></button>
      <label title="Text color" className={`${btn} cursor-pointer inline-flex items-center`}>
        <Type className="h-3.5 w-3.5" />
        <input type="color" className="sr-only" onChange={(e) => { exec("foreColor", e.target.value); onColor?.(e.target.value); }} />
      </label>
      <label title="Highlight" className={`${btn} cursor-pointer inline-flex items-center`}>
        <Highlighter className="h-3.5 w-3.5" />
        <input type="color" className="sr-only" defaultValue="#fef08a" onChange={(e) => exec("hiliteColor", e.target.value)} />
      </label>
      <button title="Clear formatting" className={btn} onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); }}><Eraser className="h-3.5 w-3.5" /></button>
    </div>
  );
}
