import { useEffect, useState } from "react";
import { Save, Timer, Target, Layout, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SwipeGameSettings {
  // Timer
  timer_enabled: boolean;
  timer_duration_seconds: number;
  // Game length
  swipes_per_game_enabled: boolean;
  swipes_per_game: number;
  // Post-game screens (ordered list)
  post_game_screens: PostGameScreen[];
  // Matchmaking
  elo_range_matching: boolean;
  elo_range_threshold: number;
  // Collections-specific
  collections_show_item_names: boolean;
  collections_show_subtitle: boolean;
  // Users-specific
  users_show_display_name: boolean;
  users_show_location: boolean;
  // Card UI
  card_bg_opacity: number;
  show_match_count: boolean;
  show_swipe_progress: boolean;
  // Cool-down
  cooldown_enabled: boolean;
  cooldown_seconds: number;
  cooldown_message: string;
}

interface PostGameScreen {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
}

const DEFAULT_POST_GAME_SCREENS: PostGameScreen[] = [
  { id: "personal_rankings", label: "Personal Rankings", enabled: true, order: 0 },
  { id: "global_leaderboard", label: "Global Leaderboard", enabled: true, order: 1 },
  { id: "comparison", label: "Global vs Personal Comparison", enabled: false, order: 2 },
  { id: "advertisement", label: "Advertisement", enabled: false, order: 3 },
  { id: "custom_screen", label: "Custom Screen", enabled: false, order: 4 },
];

const DEFAULT_SETTINGS: SwipeGameSettings = {
  timer_enabled: false,
  timer_duration_seconds: 10,
  swipes_per_game_enabled: false,
  swipes_per_game: 20,
  post_game_screens: DEFAULT_POST_GAME_SCREENS,
  elo_range_matching: false,
  elo_range_threshold: 300,
  collections_show_item_names: true,
  collections_show_subtitle: true,
  users_show_display_name: true,
  users_show_location: true,
  card_bg_opacity: 20,
  show_match_count: true,
  show_swipe_progress: true,
  cooldown_enabled: false,
  cooldown_seconds: 30,
  cooldown_message: "Take a break! Come back soon.",
};

export default function AdminSwipeGameConfig() {
  const [settings, setSettings] = useState<SwipeGameSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["swipe_game_config", "swipe_timer", "show_match_count", "show_swipe_progress", "card_bg_opacity"]);

    if (data) {
      const configRow = data.find(d => d.key === "swipe_game_config");
      const timerRow = data.find(d => d.key === "swipe_timer");
      const matchCountRow = data.find(d => d.key === "show_match_count");
      const progressRow = data.find(d => d.key === "show_swipe_progress");
      const opacityRow = data.find(d => d.key === "card_bg_opacity");

      const timerVal = timerRow?.value as any;
      const merged = {
        ...DEFAULT_SETTINGS,
        ...(configRow?.value as any || {}),
        timer_enabled: timerVal?.enabled ?? DEFAULT_SETTINGS.timer_enabled,
        timer_duration_seconds: timerVal?.duration_seconds ?? DEFAULT_SETTINGS.timer_duration_seconds,
        show_match_count: (matchCountRow?.value as any)?.enabled ?? DEFAULT_SETTINGS.show_match_count,
        show_swipe_progress: (progressRow?.value as any)?.enabled ?? DEFAULT_SETTINGS.show_swipe_progress,
        card_bg_opacity: (opacityRow?.value as any)?.opacity ?? DEFAULT_SETTINGS.card_bg_opacity,
      };
      // Ensure post_game_screens has all defaults
      if (!merged.post_game_screens || merged.post_game_screens.length === 0) {
        merged.post_game_screens = DEFAULT_POST_GAME_SCREENS;
      }
      setSettings(merged);
    }
    setLoaded(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { timer_enabled, timer_duration_seconds, show_match_count, show_swipe_progress, card_bg_opacity, ...rest } = settings;

      await Promise.all([
        supabase.from("app_settings").upsert({ key: "swipe_game_config", value: rest as any }),
        supabase.from("app_settings").upsert({ key: "swipe_timer", value: { enabled: timer_enabled, duration_seconds: timer_duration_seconds } as any }),
        supabase.from("app_settings").upsert({ key: "show_match_count", value: { enabled: show_match_count } as any }),
        supabase.from("app_settings").upsert({ key: "show_swipe_progress", value: { enabled: show_swipe_progress } as any }),
        supabase.from("app_settings").upsert({ key: "card_bg_opacity", value: { opacity: card_bg_opacity } as any }),
      ]);
      toast.success("Swipe game config saved");
    } catch {
      toast.error("Failed to save");
    }
    setSaving(false);
  };

  const updateField = <K extends keyof SwipeGameSettings>(key: K, value: SwipeGameSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const togglePostGameScreen = (id: string) => {
    setSettings(prev => ({
      ...prev,
      post_game_screens: prev.post_game_screens.map(s =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  };

  const movePostGameScreen = (id: string, dir: -1 | 1) => {
    setSettings(prev => {
      const screens = [...prev.post_game_screens].sort((a, b) => a.order - b.order);
      const idx = screens.findIndex(s => s.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= screens.length) return prev;
      [screens[idx], screens[newIdx]] = [screens[newIdx], screens[idx]];
      return {
        ...prev,
        post_game_screens: screens.map((s, i) => ({ ...s, order: i })),
      };
    });
  };

  if (!loaded) return <div className="text-muted-foreground text-sm p-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Timer Section */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Timer className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Swipe Timer</h3>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable Timer</Label>
          <Switch checked={settings.timer_enabled} onCheckedChange={v => updateField("timer_enabled", v)} />
        </div>
        {settings.timer_enabled && (
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap">Duration (seconds)</Label>
            <input
              type="range" min={3} max={60} value={settings.timer_duration_seconds}
              onChange={e => updateField("timer_duration_seconds", Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold text-foreground w-8 text-right">{settings.timer_duration_seconds}s</span>
          </div>
        )}
      </section>

      {/* Game Length Section */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Game Length</h3>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Limit swipes per game</Label>
          <Switch checked={settings.swipes_per_game_enabled} onCheckedChange={v => updateField("swipes_per_game_enabled", v)} />
        </div>
        {settings.swipes_per_game_enabled && (
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap">Swipes per game</Label>
            <input
              type="range" min={5} max={100} step={5} value={settings.swipes_per_game}
              onChange={e => updateField("swipes_per_game", Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold text-foreground w-8 text-right">{settings.swipes_per_game}</span>
          </div>
        )}
      </section>

      {/* Post-Game Flow */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Layout className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Post-Game Flow</h3>
        </div>
        <p className="text-xs text-muted-foreground">Choose and order the screens users see after their game ends. Drag to reorder.</p>
        <div className="space-y-2">
          {[...settings.post_game_screens].sort((a, b) => a.order - b.order).map((screen) => (
            <div key={screen.id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
              <Switch checked={screen.enabled} onCheckedChange={() => togglePostGameScreen(screen.id)} />
              <span className="flex-1 text-sm font-medium text-foreground">{screen.label}</span>
              <button onClick={() => movePostGameScreen(screen.id, -1)} className="text-muted-foreground hover:text-foreground text-xs px-1">▲</button>
              <button onClick={() => movePostGameScreen(screen.id, 1)} className="text-muted-foreground hover:text-foreground text-xs px-1">▼</button>
            </div>
          ))}
        </div>
      </section>

      {/* Card Display */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Gamepad2 className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Card Display</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show match count</Label>
            <Switch checked={settings.show_match_count} onCheckedChange={v => updateField("show_match_count", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show progress bar</Label>
            <Switch checked={settings.show_swipe_progress} onCheckedChange={v => updateField("show_swipe_progress", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show item names (Collections)</Label>
            <Switch checked={settings.collections_show_item_names} onCheckedChange={v => updateField("collections_show_item_names", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show subtitles (Collections)</Label>
            <Switch checked={settings.collections_show_subtitle} onCheckedChange={v => updateField("collections_show_subtitle", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show display name (Users)</Label>
            <Switch checked={settings.users_show_display_name} onCheckedChange={v => updateField("users_show_display_name", v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Show location (Users)</Label>
            <Switch checked={settings.users_show_location} onCheckedChange={v => updateField("users_show_location", v)} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Card BG opacity</Label>
          <input
            type="range" min={0} max={100} value={settings.card_bg_opacity}
            onChange={e => updateField("card_bg_opacity", Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-bold text-foreground w-10 text-right">{settings.card_bg_opacity}%</span>
        </div>
      </section>

      {/* Matchmaking */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-bold text-sm text-foreground">Matchmaking</h3>
        <div className="flex items-center justify-between">
          <Label className="text-sm">ELO range matching</Label>
          <Switch checked={settings.elo_range_matching} onCheckedChange={v => updateField("elo_range_matching", v)} />
        </div>
        {settings.elo_range_matching && (
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap">Max ELO diff</Label>
            <input
              type="range" min={50} max={1000} step={50} value={settings.elo_range_threshold}
              onChange={e => updateField("elo_range_threshold", Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="text-sm font-bold text-foreground w-12 text-right">{settings.elo_range_threshold}</span>
          </div>
        )}
      </section>

      {/* Cooldown */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="font-bold text-sm text-foreground">Session Cooldown</h3>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Enable cooldown between games</Label>
          <Switch checked={settings.cooldown_enabled} onCheckedChange={v => updateField("cooldown_enabled", v)} />
        </div>
        {settings.cooldown_enabled && (
          <>
            <div className="flex items-center gap-3">
              <Label className="text-sm whitespace-nowrap">Cooldown (seconds)</Label>
              <input
                type="range" min={10} max={300} step={10} value={settings.cooldown_seconds}
                onChange={e => updateField("cooldown_seconds", Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-bold text-foreground w-10 text-right">{settings.cooldown_seconds}s</span>
            </div>
            <div>
              <Label className="text-sm">Cooldown message</Label>
              <input
                type="text" value={settings.cooldown_message}
                onChange={e => updateField("cooldown_message", e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
          </>
        )}
      </section>

      <Button onClick={save} disabled={saving} className="w-full">
        <Save className="h-4 w-4 mr-2" /> {saving ? "Saving..." : "Save Swipe Game Config"}
      </Button>
    </div>
  );
}
