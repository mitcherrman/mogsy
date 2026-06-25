import { ArrowDown, ArrowUp, Copy, Shuffle, Trash2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { QuizQuestion } from "@/lib/quiz/api";

type Props = {
  items: QuizQuestion[];
  currentIndex: number;
  onChange: (next: QuizQuestion[]) => void;
  onJumpTo: (i: number) => void;
};

/**
 * Minimal playlist editor — uses up/down buttons for ordering to avoid
 * pulling in a DnD library. Drag-and-drop can be layered on later without
 * changing this surface.
 */
export default function PlaylistBuilder({ items, currentIndex, onChange, onJumpTo }: Props) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };
  const remove = (i: number) => {
    const next = items.slice();
    next.splice(i, 1);
    onChange(next);
  };
  const dup = (i: number) => {
    const next = items.slice();
    next.splice(i + 1, 0, { ...items[i] });
    onChange(next);
  };
  const shuffle = () => {
    const next = items.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    onChange(next);
  };
  const reverse = () => onChange(items.slice().reverse());
  const clear = () => onChange([]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={shuffle} disabled={items.length < 2}>
          <Shuffle className="mr-1 h-3 w-3" /> Shuffle
        </Button>
        <Button size="sm" variant="outline" onClick={reverse} disabled={items.length < 2}>
          <RefreshCw className="mr-1 h-3 w-3" /> Reverse
        </Button>
        <Button size="sm" variant="outline" onClick={clear} disabled={items.length === 0}>
          <Trash2 className="mr-1 h-3 w-3" /> Clear
        </Button>
        <Badge variant="secondary" className="ml-auto">{items.length} questions</Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
        {items.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Add questions from the browser to build a playlist.
          </div>
        )}
        {items.map((q, i) => {
          const active = i === currentIndex;
          return (
            <div
              key={`${q.id}-${i}`}
              className={[
                "flex items-center gap-2 border-b border-white/5 p-2 last:border-0",
                active ? "bg-cyan-400/10" : "hover:bg-white/[0.03]",
              ].join(" ")}
            >
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <button
                className="min-w-0 flex-1 text-left"
                onClick={() => onJumpTo(i)}
                title="Jump to this question"
              >
                <div className="line-clamp-1 text-sm">{q.question_text || "(no text)"}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {String(q.category).replace(/_/g, " ")} · #{String(q.id)}
                </div>
              </button>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, i - 1)} disabled={i === 0}>
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, i + 1)} disabled={i === items.length - 1}>
                  <ArrowDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => dup(i)}>
                  <Copy className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(i)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}