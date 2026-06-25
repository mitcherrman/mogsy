import { useState } from "react";
import { Save, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BroadcastPlaylist } from "@/lib/quiz-broadcast/types";
import type { QuizQuestion } from "@/lib/quiz/api";

type Props = {
  playlists: BroadcastPlaylist[];
  currentItems: QuizQuestion[];
  currentName: string | null;
  onSave: (name: string) => void;
  onLoad: (p: BroadcastPlaylist) => void;
  onDelete: (id: string) => void;
};

export default function PlaylistLibrary({ playlists, currentItems, currentName, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState(currentName ?? "");
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Playlist name" />
        <Button
          onClick={() => {
            const n = name.trim();
            if (!n || currentItems.length === 0) return;
            onSave(n);
          }}
          disabled={currentItems.length === 0 || !name.trim()}
        >
          <Save className="mr-2 h-4 w-4" /> Save
        </Button>
      </div>
      <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/20">
        {playlists.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">No saved playlists yet.</div>
        )}
        {playlists.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-b border-white/5 p-2 last:border-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {p.questions.length} questions · {new Date(p.createdAt).toLocaleDateString()}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => onLoad(p)}>
              <FolderOpen className="mr-1 h-3 w-3" /> Load
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(p.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}