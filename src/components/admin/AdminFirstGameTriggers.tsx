import { useEffect, useState } from "react";
import { Save, Plus, Trash2, Sparkles, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FirstGameTrigger {
  id: string;
  enabled: boolean;
  swipe_count: number;
  action_type: string;
  target: string;
  message: string;
  glow: boolean;
  order: number;
}

const ACTION_TYPES = [
  { value: "tooltip", label: "Show Tooltip" },
  { value: "popup", label: "Show Popup Modal" },
  { value: "highlight", label: "Highlight / Pulse" },
  { value: "confetti", label: "Confetti Burst" },
  { value: "nudge", label: "Nudge Arrow" },
];

const TARGETS = [
  { value: "animation_picker", label: "Animation Picker Button" },
  { value: "sound_toggle", label: "Sound Toggle" },
  { value: "comments_section", label: "Scroll-to-Comments Hint" },
  { value: "rewind_button", label: "Rewind Button" },
  { value: "timer_display", label: "Timer Display" },
  { value: "progress_bar", label: "Progress Bar" },
  { value: "leaderboard_link", label: "Leaderboard Link" },
  { value: "profile_avatar", label: "Profile Avatar" },
  { value: "share_button", label: "Share / Screenshot Button" },
  { value: "inventory_button", label: "Inventory Button" },
];

const DEFAULT_TRIGGER: Omit<FirstGameTrigger, "id" | "order"> = {
  enabled: true,
  swipe_count: 2,
  action_type: "tooltip",
  target: "animation_picker",
  message: "Try different animations! 🎬",
  glow: true,
};

export default function AdminFirstGameTriggers() {
  const [triggers, setTriggers] = useState<FirstGameTrigger[]>([]);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "first_game_triggers")
      .maybeSingle();
    if (data?.value) {
      const val = data.value as any;
      setMasterEnabled(val.enabled ?? true);
      setTriggers(val.triggers ?? []);
    }
    setLoaded(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from("app_settings").upsert({
        key: "first_game_triggers",
        value: { enabled: masterEnabled, triggers } as any,
      });
      toast.success("First-game triggers saved");
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const addTrigger = () => {
    setTriggers(prev => [
      ...prev,
      { ...DEFAULT_TRIGGER, id: crypto.randomUUID(), order: prev.length },
    ]);
  };

  const removeTrigger = (id: string) => {
    setTriggers(prev => prev.filter(t => t.id !== id).map((t, i) => ({ ...t, order: i })));
  };

  const updateTrigger = (id: string, field: keyof FirstGameTrigger, value: any) => {
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const moveTrigger = (id: string, dir: -1 | 1) => {
    setTriggers(prev => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(t => t.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= sorted.length) return prev;
      [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
      return sorted.map((t, i) => ({ ...t, order: i }));
    });
  };

  if (!loaded) return <div className="text-muted-foreground text-sm p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">First-Game Onboarding Triggers</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure actions that fire during a brand-new user's very first swiping session. Great for teaching mechanics and boosting engagement.
        </p>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable first-game triggers</Label>
          <Switch checked={masterEnabled} onCheckedChange={setMasterEnabled} />
        </div>
      </section>

      {masterEnabled && (
        <>
          {/* Trigger list */}
          <div className="space-y-3">
            {[...triggers].sort((a, b) => a.order - b.order).map((trigger) => (
              <section key={trigger.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveTrigger(trigger.id, -1)} className="text-muted-foreground hover:text-foreground text-[10px] leading-none">▲</button>
                    <button onClick={() => moveTrigger(trigger.id, 1)} className="text-muted-foreground hover:text-foreground text-[10px] leading-none">▼</button>
                  </div>
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-sm font-semibold text-foreground truncate">
                    After swipe #{trigger.swipe_count} → {ACTION_TYPES.find(a => a.value === trigger.action_type)?.label} on {TARGETS.find(t => t.value === trigger.target)?.label}
                  </span>
                  <Switch checked={trigger.enabled} onCheckedChange={v => updateTrigger(trigger.id, "enabled", v)} />
                  <button onClick={() => removeTrigger(trigger.id)} className="text-destructive hover:text-destructive/80 p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Swipe count */}
                  <div>
                    <Label className="text-xs text-muted-foreground">After swipe #</Label>
                    <input
                      type="number" min={1} max={50} value={trigger.swipe_count}
                      onChange={e => updateTrigger(trigger.id, "swipe_count", Math.max(1, Number(e.target.value)))}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>

                  {/* Action type */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <select
                      value={trigger.action_type}
                      onChange={e => updateTrigger(trigger.id, "action_type", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    >
                      {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>

                  {/* Target */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Target Element</Label>
                    <select
                      value={trigger.target}
                      onChange={e => updateTrigger(trigger.id, "target", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    >
                      {TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Message */}
                {(trigger.action_type === "tooltip" || trigger.action_type === "popup") && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Message</Label>
                    <input
                      type="text" value={trigger.message}
                      onChange={e => updateTrigger(trigger.id, "message", e.target.value)}
                      placeholder="Try different animations! 🎬"
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                    />
                  </div>
                )}

                {/* Glow toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Also glow/pulse the target</Label>
                  <Switch checked={trigger.glow} onCheckedChange={v => updateTrigger(trigger.id, "glow", v)} />
                </div>
              </section>
            ))}
          </div>

          <Button variant="outline" onClick={addTrigger} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add Trigger
          </Button>
        </>
      )}

      <Button onClick={save} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save First-Game Triggers"}
      </Button>
    </div>
  );
}
