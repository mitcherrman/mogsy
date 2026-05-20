import { useState, useEffect } from "react";
import { X, Plus, Trash2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { AnimationRule } from "@/hooks/useLeagueAnimationRules";

interface CoverItem {
  id: string;
  name: string;
  image_url: string | null;
}

interface Props {
  item: {
    key?: string;
    id?: string;
    label: string;
    hidden: boolean;
    customLabel?: string | null;
    type: "topLevel" | "category" | "league";
    leagueId?: string;
    coverItemId?: string | null;
  };
  onSave: (updates: { hidden: boolean; customLabel: string | null; coverItemId?: string | null }) => void;
  onClose: () => void;
}

export default function AdminPlayItemEditor({ item, onSave, onClose }: Props) {
  const [hidden, setHidden] = useState(item.hidden);
  const [customLabel, setCustomLabel] = useState(item.customLabel || "");
  const [rules, setRules] = useState<AnimationRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [coverItemId, setCoverItemId] = useState<string | null>(item.coverItemId || null);
  const [coverItems, setCoverItems] = useState<CoverItem[]>([]);
  const [loadingCover, setLoadingCover] = useState(false);

  // New rule state
  const [newAnimId, setNewAnimId] = useState(CARD_ANIMATIONS[1]?.id || "slice");
  const [newEvery, setNewEvery] = useState(3);

  useEffect(() => {
    if (item.type === "league" && item.leagueId) {
      setLoadingRules(true);
      supabase
        .from("league_animation_rules")
        .select("*")
        .eq("league_id", item.leagueId)
        .order("sort_order")
        .then(({ data }) => {
          setRules((data as AnimationRule[]) || []);
          setLoadingRules(false);
        });
    }
  }, [item.leagueId, item.type]);

  // Load cover image candidates
  useEffect(() => {
    const loadCoverItems = async () => {
      if (item.type === "topLevel") return;
      setLoadingCover(true);

      if (item.type === "league" && item.leagueId) {
        const { data } = await supabase
          .from("preset_items")
          .select("id, name, image_url")
          .eq("league_id", item.leagueId)
          .not("image_url", "is", null)
          .not("image_url", "eq", "")
          .order("name")
          .limit(100);
        setCoverItems((data as CoverItem[]) || []);
      } else if (item.type === "category" && item.key) {
        // Get all leagues in this category, then their items
        const { data: leagueData } = await supabase
          .from("leagues")
          .select("id")
          .eq("category", item.key)
          .eq("type", "preset");
        if (leagueData && leagueData.length > 0) {
          const leagueIds = leagueData.map(l => l.id);
          const { data } = await supabase
            .from("preset_items")
            .select("id, name, image_url")
            .in("league_id", leagueIds)
            .not("image_url", "is", null)
            .not("image_url", "eq", "")
            .order("name")
            .limit(100);
          setCoverItems((data as CoverItem[]) || []);
        }
      }
      setLoadingCover(false);
    };
    loadCoverItems();
  }, [item.type, item.leagueId, item.key]);

  const handleAddRule = async () => {
    if (!item.leagueId) return;
    const { data, error } = await supabase
      .from("league_animation_rules")
      .upsert({
        league_id: item.leagueId,
        animation_id: newAnimId,
        every_n_swipes: newEvery,
        is_enabled: true,
        sort_order: rules.length,
      }, { onConflict: "league_id,animation_id" })
      .select()
      .single();
    if (data && !error) {
      setRules(prev => {
        const existing = prev.findIndex(r => r.animation_id === newAnimId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = data as AnimationRule;
          return updated;
        }
        return [...prev, data as AnimationRule];
      });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    await supabase.from("league_animation_rules").delete().eq("id", ruleId);
    setRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    await supabase.from("league_animation_rules").update({ is_enabled: enabled }).eq("id", ruleId);
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, is_enabled: enabled } : r));
  };

  const getAnimDef = (id: string) => CARD_ANIMATIONS.find(a => a.id === id);

  const selectedCoverItem = coverItems.find(c => c.id === coverItemId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">Edit: {item.label}</h3>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Visibility */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Visible to users</span>
          <Switch checked={!hidden} onCheckedChange={(v) => setHidden(!v)} />
        </div>

        {/* Custom label */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Label Override</label>
          <Input
            value={customLabel}
            onChange={e => setCustomLabel(e.target.value)}
            placeholder={item.label}
            className="h-9 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">Leave empty to use default name</p>
        </div>

        {/* Cover Image Picker (categories & leagues) */}
        {(item.type === "category" || item.type === "league") && (
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-bold text-foreground">Cover Image</h4>
            <p className="text-[10px] text-muted-foreground">Choose which item's picture represents this {item.type}. Default picks a random one.</p>

            {/* Random toggle */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center gap-2">
                <Shuffle className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Use random image</span>
              </div>
              <Switch checked={!coverItemId} onCheckedChange={(useRandom) => setCoverItemId(useRandom ? null : (coverItems[0]?.id || null))} />
            </div>

            {/* Grid picker */}
            {coverItemId !== null && (
              <div className="space-y-2">
                {loadingCover ? (
                  <p className="text-xs text-muted-foreground">Loading items...</p>
                ) : coverItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No items with images found.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto">
                    {coverItems.map(ci => (
                      <button
                        key={ci.id}
                        onClick={() => setCoverItemId(ci.id)}
                        className={`relative rounded-lg border-2 overflow-hidden aspect-square transition-all ${
                          coverItemId === ci.id
                            ? "border-primary ring-2 ring-primary/30 scale-105"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <img src={ci.image_url!} alt={ci.name} className="w-full h-full object-cover" />
                        {coverItemId === ci.id && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-primary-foreground text-[10px] font-bold">✓</span>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected preview */}
                {selectedCoverItem && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
                    <img src={selectedCoverItem.image_url!} alt="" className="h-8 w-8 rounded object-cover" />
                    <span className="text-xs font-medium text-foreground">{selectedCoverItem.name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Animation rules (leagues only) */}
        {item.type === "league" && item.leagueId && (
          <div className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-bold text-foreground">Animation Rules</h4>
            <p className="text-[10px] text-muted-foreground">Set which animations trigger at specific swipe intervals in this league.</p>

            {loadingRules ? (
              <div className="h-8 flex items-center"><span className="text-xs text-muted-foreground">Loading...</span></div>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => {
                  const anim = getAnimDef(rule.animation_id);
                  return (
                    <div key={rule.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                      <span className="text-base">{anim?.icon || "?"}</span>
                      <span className="text-xs font-semibold flex-1">
                        {anim?.name || rule.animation_id}
                        <span className="text-muted-foreground font-normal"> — every {rule.every_n_swipes} swipes</span>
                      </span>
                      <Switch
                        checked={rule.is_enabled}
                        onCheckedChange={v => handleToggleRule(rule.id, v)}
                      />
                      <Button variant="ghost" size="icon" aria-label="Delete" className="h-7 w-7 text-destructive" onClick={() => handleDeleteRule(rule.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new rule */}
            <div className="flex items-end gap-2 pt-2">
              <div className="flex-1 space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Animation</label>
                <Select value={newAnimId} onValueChange={setNewAnimId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_ANIMATIONS.filter(a => a.id !== "default").map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.icon} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Every N</label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={newEvery}
                  onChange={e => setNewEvery(Number(e.target.value) || 1)}
                  className="h-9 text-xs"
                />
              </div>
              <Button size="sm" className="h-9 gap-1" onClick={handleAddRule}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => {
            onSave({
              hidden,
              customLabel: customLabel.trim() || null,
              coverItemId: (item.type === "category" || item.type === "league") ? coverItemId : undefined,
            });
            onClose();
          }}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
