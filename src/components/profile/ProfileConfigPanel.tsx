import { useState } from "react";
import { SlidersHorizontal, ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ProfileConfig } from "@/hooks/useProfileConfig";

const OPTIONS: { key: keyof ProfileConfig; label: string; description: string }[] = [
  { key: "showQuizProgress", label: "League Quiz Progress", description: "Rank, XP, streaks, accuracy and achievements." },
  { key: "showCategoryKnowledge", label: "Game Knowledge", description: "Per-category accuracy — items, cooldowns, esports trivia." },
  { key: "showCombatLab", label: "Combat Lab", description: "Simulator card and saved setups (coming soon)." },
  { key: "showQuickActions", label: "Quick Actions", description: "Shortcuts into quiz, Combat Lab, hub, docs and tier list." },
  { key: "showPhotos", label: "Photos", description: "Profile photo upload and rotation." },
  { key: "showSocials", label: "Social Links", description: "Instagram, YouTube, Twitch and other links." },
  { key: "showLegacyMogsy", label: "Legacy Mogsy Modules", description: "Old boost, frames and favorites sections." },
];

/**
 * Customization panel for the profile page. Every section can be toggled
 * on/off; choices persist per device (localStorage) — no backend involved.
 */
export default function ProfileConfigPanel({
  config,
  setOption,
  resetConfig,
  showLegacyOption = false,
}: {
  config: ProfileConfig;
  setOption: <K extends keyof ProfileConfig>(key: K, value: ProfileConfig[K]) => void;
  resetConfig: () => void;
  /** Admin/dev only: expose the toggle that re-enables old Mogsy modules. */
  showLegacyOption?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = OPTIONS.filter((o) => o.key !== "showLegacyMogsy" || showLegacyOption);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border border-border bg-card">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 sm:px-5 py-3 text-left"
          aria-label="Toggle profile customization panel"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Customize Profile
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 sm:px-5 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Choose which sections appear on your Mogsy League profile. Saved on this device.
          </p>
          {options.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor={`profile-opt-${key}`} className="text-sm text-foreground">
                  {label}
                </Label>
                <p className="text-[11px] text-muted-foreground">{description}</p>
              </div>
              <Switch
                id={`profile-opt-${key}`}
                checked={config[key]}
                onCheckedChange={(v) => setOption(key, v)}
              />
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={resetConfig} className="text-xs text-muted-foreground">
            <RotateCcw className="mr-1 h-3 w-3" />
            Reset to defaults
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
