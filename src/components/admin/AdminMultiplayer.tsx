import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Users, ToggleLeft, ToggleRight, Save, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MultiplayerMode, MultiplayerSettings } from "@/hooks/useMultiplayerGame";

const MODE_LABELS: Record<MultiplayerMode, { label: string; description: string; configFields: { key: string; label: string; type: "number"; min: number; max: number }[] }> = {
  tag_team: {
    label: "Tag Team Battles",
    description: "2v2 duo submission + community vote",
    configFields: [
      { key: "voting_time_seconds", label: "Voting Time (s)", type: "number", min: 5, max: 120 },
      { key: "rounds", label: "Rounds", type: "number", min: 1, max: 10 },
    ],
  },
  draft_duel: {
    label: "Draft & Duel",
    description: "Snake draft then Aura-based battles",
    configFields: [
      { key: "draft_time_seconds", label: "Draft Time (s)", type: "number", min: 5, max: 60 },
      { key: "picks_per_team", label: "Picks Per Team", type: "number", min: 1, max: 6 },
    ],
  },
  prediction_wars: {
    label: "Prediction Wars",
    description: "Predict matchup winners, most correct wins",
    configFields: [
      { key: "prediction_time_seconds", label: "Predict Time (s)", type: "number", min: 5, max: 60 },
      { key: "rounds", label: "Rounds", type: "number", min: 3, max: 15 },
    ],
  },
  siege: {
    label: "Siege Mode",
    description: "Defend your tower, destroy the enemy's",
    configFields: [
      { key: "tower_size", label: "Tower Size", type: "number", min: 1, max: 5 },
      { key: "attack_time_seconds", label: "Attack Time (s)", type: "number", min: 10, max: 60 },
    ],
  },
  hot_streak: {
    label: "Hot Streak Relay",
    description: "Tag-team relay, longest combined streak wins",
    configFields: [
      { key: "time_limit_seconds", label: "Time Limit (s)", type: "number", min: 30, max: 180 },
    ],
  },
};

const MODES: MultiplayerMode[] = ["tag_team", "draft_duel", "prediction_wars", "siege", "hot_streak"];

interface GameStats {
  total: number;
  byMode: Record<string, number>;
  active: number;
}

export default function AdminMultiplayer() {
  const [settings, setSettings] = useState<MultiplayerSettings[]>([]);
  const [stats, setStats] = useState<GameStats>({ total: 0, byMode: {}, active: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("multiplayer_settings").select("*"),
      supabase.from("multiplayer_games").select("id, mode, status"),
    ]).then(([settingsRes, gamesRes]) => {
      if (settingsRes.data) setSettings(settingsRes.data as MultiplayerSettings[]);
      if (gamesRes.data) {
        const total = gamesRes.data.length;
        const active = gamesRes.data.filter(g => g.status === "active").length;
        const byMode: Record<string, number> = {};
        gamesRes.data.forEach(g => { byMode[g.mode] = (byMode[g.mode] || 0) + 1; });
        setStats({ total, byMode, active });
      }
      setLoading(false);
    });
  }, []);

  const getSetting = (mode: MultiplayerMode) => settings.find(s => s.mode === mode);

  const toggleMode = async (mode: MultiplayerMode) => {
    const current = getSetting(mode);
    const newEnabled = !(current?.is_enabled ?? true);
    setSaving(mode);
    try {
      await supabase.from("multiplayer_settings").update({ is_enabled: newEnabled }).eq("mode", mode);
      setSettings(prev => prev.map(s => s.mode === mode ? { ...s, is_enabled: newEnabled } : s));
      toast.success(`${MODE_LABELS[mode].label} ${newEnabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update setting");
    } finally {
      setSaving(null);
    }
  };

  const updateConfig = (mode: MultiplayerMode, key: string, value: number) => {
    setSettings(prev => prev.map(s => {
      if (s.mode !== mode) return s;
      return { ...s, config: { ...(s.config as any), [key]: value } };
    }));
  };

  const saveConfig = async (mode: MultiplayerMode) => {
    const setting = getSetting(mode);
    if (!setting) return;
    setSaving(`config-${mode}`);
    try {
      await supabase.from("multiplayer_settings").update({ config: setting.config }).eq("mode", mode);
      toast.success("Config saved");
    } catch {
      toast.error("Failed to save config");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total Games</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-green-500">{stats.active}</div>
          <div className="text-xs text-muted-foreground">Active Now</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-foreground">{MODES.filter(m => getSetting(m)?.is_enabled).length}</div>
          <div className="text-xs text-muted-foreground">Modes On</div>
        </div>
      </div>

      {/* Mode settings */}
      <div className="space-y-4">
        {MODES.map(mode => {
          const setting = getSetting(mode);
          const meta = MODE_LABELS[mode];
          const enabled = setting?.is_enabled ?? true;
          const config = (setting?.config || {}) as Record<string, any>;

          return (
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border-2 transition-all ${enabled ? "border-primary/30 bg-card" : "border-border bg-muted/10 opacity-70"}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-foreground">{meta.label}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${enabled ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"}`}>
                      {enabled ? "ON" : "OFF"}
                    </span>
                    {stats.byMode[mode] !== undefined && (
                      <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />{stats.byMode[mode] || 0} games
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{meta.description}</p>

                  {/* Config fields */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {meta.configFields.map(field => (
                      <div key={field.key}>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-1">
                          {field.label}
                        </label>
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={config[field.key] ?? 0}
                          onChange={e => updateConfig(mode, field.key, Number(e.target.value))}
                          className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveConfig(mode)}
                    disabled={saving === `config-${mode}`}
                    className="h-7 text-xs"
                  >
                    <Save className="h-3 w-3 mr-1" />
                    {saving === `config-${mode}` ? "Saving..." : "Save Config"}
                  </Button>
                </div>

                <button
                  onClick={() => toggleMode(mode)}
                  disabled={saving === mode}
                  className="flex-shrink-0 mt-0.5"
                >
                  {enabled
                    ? <ToggleRight className="h-7 w-7 text-primary" />
                    : <ToggleLeft className="h-7 w-7 text-muted-foreground" />
                  }
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
