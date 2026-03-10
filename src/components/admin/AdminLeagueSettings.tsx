import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface League {
  id: string;
  name: string;
  category: string | null;
  show_elo: boolean;
  show_rank: boolean;
  show_global_stats: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌", Movies: "🎬", "Video Games": "🎮", Celebrities: "⭐",
};

export default function AdminLeagueSettings() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, category, show_elo, show_rank, show_global_stats")
      .eq("type", "preset")
      .order("category")
      .order("name")
      .then(({ data }) => {
        if (data) setLeagues(data as League[]);
      });
  }, []);

  const toggleCat = (c: string) => {
    setOpenCats(prev => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });
  };

  const updateLeague = async (id: string, field: "show_elo" | "show_rank", value: boolean) => {
    setLeagues(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
    const { error } = await supabase.from("leagues").update({ [field]: value }).eq("id", id);
    if (error) {
      toast.error("Failed to update");
      setLeagues(prev => prev.map(l => l.id === id ? { ...l, [field]: !value } : l));
    }
  };

  const grouped = leagues.reduce<Record<string, League[]>>((acc, l) => {
    const cat = l.category || "Uncategorized";
    (acc[cat] = acc[cat] || []).push(l);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Eye className="h-4 w-4" /> League Display Settings
      </h3>
      <p className="text-xs text-muted-foreground">Control whether Aura scores and ranks are visible on swipe cards for each league.</p>

      {Object.entries(grouped).sort().map(([cat, list]) => (
        <Collapsible key={cat} open={openCats.has(cat)} onOpenChange={() => toggleCat(cat)}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors">
            <span>{CATEGORY_ICONS[cat] || "📁"} {cat} ({list.length})</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${openCats.has(cat) ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2 pl-2">
            {list.map(l => (
              <div key={l.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm font-medium text-foreground truncate flex-1">{l.name}</span>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Aura</Label>
                    <Switch checked={l.show_elo} onCheckedChange={(v) => updateLeague(l.id, "show_elo", v)} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Rank</Label>
                    <Switch checked={l.show_rank} onCheckedChange={(v) => updateLeague(l.id, "show_rank", v)} />
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
