import { useState } from "react";
import { Backpack, Shield, Undo2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  rewinds: number;
  shields: number;
  reveals: number;
}

export default function SwipeInventoryButton({ rewinds, shields, reveals }: Props) {
  const [open, setOpen] = useState(false);
  const total = rewinds + shields + reveals;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon" aria-label="Open inventory"
          className="h-8 w-8 relative text-muted-foreground hover:text-foreground"
          title="Power-ups"
        >
          <Backpack className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center">
              {total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-3" align="end">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Power-ups</p>
        <div className="space-y-2">
          <PowerUpRow icon={<Undo2 className="h-3.5 w-3.5" />} label="Rewinds" count={rewinds} />
          <PowerUpRow icon={<Shield className="h-3.5 w-3.5" />} label="Shields" count={shields} />
          <PowerUpRow icon={<Eye className="h-3.5 w-3.5" />} label="Reveals" count={reveals} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PowerUpRow({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xs text-foreground flex-1">{label}</span>
      <span className={`text-xs font-bold ${count > 0 ? "text-primary" : "text-muted-foreground/50"}`}>{count}</span>
    </div>
  );
}
