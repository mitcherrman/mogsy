import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import { Bold, Italic, List, ListOrdered, Quote, Heading2, Image as ImageIcon, Link2, Undo, Redo } from "lucide-react";
import type { RichContent } from "@/lib/blog/types";

export default function RichEditor({
  value,
  onChange,
}: {
  value: RichContent;
  onChange: (next: RichContent) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Image],
    content: value.doc ?? { type: "doc", content: [{ type: "paragraph" }] },
    onUpdate({ editor }) {
      onChange({ mode: "rich", doc: editor.getJSON(), widgets: value.widgets });
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);
  if (!editor) return null;

  const btn = "p-1.5 rounded hover:bg-muted text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-1 p-2 border-b border-border flex-wrap">
        <button className={btn} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></button>
        <button className={btn} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></button>
        <button className={btn} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></button>
        <button className={btn} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></button>
        <button className={btn} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></button>
        <button className={btn} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></button>
        <button className={btn} onClick={() => {
          const url = prompt("Image URL");
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}><ImageIcon className="h-4 w-4" /></button>
        <button className={btn} onClick={() => {
          const url = prompt("Link URL");
          if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}><Link2 className="h-4 w-4" /></button>
        <div className="ml-auto flex gap-1">
          <button className={btn} onClick={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></button>
          <button className={btn} onClick={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="p-4 min-h-[400px] blog-scope">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}