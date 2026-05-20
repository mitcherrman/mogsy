import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  currentAnimation: string;
  onSelect: (id: string) => void;
  isPro: boolean;
}

export default function SwipeAnimationPicker({ currentAnimation, onSelect, isPro }: Props) {
  const [animConfig, setAnimConfig] = useState<Record<string, { enabled: boolean; pro_only: boolean }>>({});

  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "card_animations").single()
      .then(({ data }) => { if (data?.value) setAnimConfig(data.value as any); });
  }, []);

  const animations = CARD_ANIMATIONS.filter(a => {
    const cfg = animConfig[a.id];
    if (cfg && !cfg.enabled) return false;
    return a.contexts.includes("swipe");
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Pick animation" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Change animation">
          <Sparkles className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1.5">Animation</p>
        {animations.map(anim => {
          const cfg = animConfig[anim.id];
          const isProOnly = cfg?.pro_only;
          const locked = isProOnly && !isPro;
          const selected = currentAnimation === anim.id;
          return (
            <button
              key={anim.id}
              onClick={() => !locked && onSelect(anim.id)}
              disabled={locked}
              className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors text-sm ${
                selected
                  ? "bg-primary/10 text-primary font-semibold"
                  : locked
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-foreground hover:bg-secondary"
              }`}
            >
              <span>{anim.icon}</span>
              <span className="flex-1 text-xs">{anim.name}</span>
              {isProOnly && !isPro && <span className="text-[8px] bg-muted rounded px-1 py-0.5 font-bold">PRO</span>}
              {selected && <span className="text-primary text-xs">✓</span>}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
