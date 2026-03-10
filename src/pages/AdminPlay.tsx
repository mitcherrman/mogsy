import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Pencil, GripVertical, Save, RotateCcw, ChevronDown, ChevronRight, LayoutGrid, Users, Zap, Bookmark, FolderOpen, Trash2, Plus, Swords, MousePointerClick, ImageIcon, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AdminPlayItemEditor from "@/components/admin/AdminPlayItemEditor";
import AdminPlayLeagueItems from "@/components/admin/AdminPlayLeagueItems";
import AdminMultiplayer from "@/components/admin/AdminMultiplayer";
import type { PlayLayoutConfig, LayoutTopLevel, LayoutCategory, LayoutLeague } from "@/hooks/usePlayLayout";

interface LeagueItem {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  type: string;
}

const DEFAULT_TOP_LEVEL: LayoutTopLevel[] = [
  { key: "collections", label: "Collections", icon: "grid", hidden: false, order: 0 },
  { key: "compete", label: "Compete", icon: "users", hidden: false, order: 1 },
  { key: "elocheck", label: "Aura Check", icon: "zap", hidden: false, order: 2 },
  { key: "multiplayer", label: "Multiplayer", icon: "swords", hidden: false, order: 3 },
];

const iconMap: Record<string, React.ReactNode> = {
  grid: <LayoutGrid className="h-5 w-5" />,
  users: <Users className="h-5 w-5" />,
  zap: <Zap className="h-5 w-5" />,
  swords: <Swords className="h-5 w-5" />,
};

export default function AdminPlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [playStats, setPlayStats] = useState({ totalItems: 0, totalImages: 0, totalClicks: 0 });
  const [authorized, setAuthorized] = useState(false);
  const [leagues, setLeagues] = useState<LeagueItem[]>([]);
  const [config, setConfig] = useState<PlayLayoutConfig>({ topLevel: [], categories: [], leagues: [] });
  const [editingItem, setEditingItem] = useState<any>(null);
  const [viewingLeague, setViewingLeague] = useState<{ id: string; name: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["topLevel"]));
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [presets, setPresets] = useState<{ id: string; name: string; updated_at: string }[]>([]);
  const [newPresetName, setNewPresetName] = useState("");
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
  const hasUnsavedChanges = useRef(false);

  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Add dialogs state
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState<string | null>(null); // parent category key
  const [addItemOpen, setAddItemOpen] = useState<string | null>(null); // league id
  const [newName, setNewName] = useState("");

  // Auth gate
  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const roles = data?.map(r => r.role as string) || [];
        if (!roles.includes("master_admin") && !roles.includes("admin") && !roles.includes("moderator")) {
          navigate("/");
          toast.error("Access denied");
          return;
        }
        const isModOnly = roles.includes("moderator") && !roles.includes("admin") && !roles.includes("master_admin");
        setIsModerator(isModOnly);
        setIsAdmin(!isModOnly);
        setAuthorized(true);
        loadData();
      });
  }, [user]);

  const loadData = async () => {
    const [{ data: leagueData }, { data: draftData }, { data: presetData }, itemsCount, imagesCount, clicksCount] = await Promise.all([
      supabase.from("leagues").select("id, name, category, type, subcategory"),
      supabase.from("play_layout_config").select("config").eq("id", "draft").single(),
      supabase.from("play_layout_config").select("id, updated_at").like("id", "preset__%"),
      supabase.from("preset_items").select("id", { count: "exact", head: true }),
      supabase.from("preset_item_images").select("id", { count: "exact", head: true }),
      supabase.from("image_clicks").select("id", { count: "exact", head: true }),
    ]);

    setPlayStats({
      totalItems: itemsCount.count || 0,
      totalImages: imagesCount.count || 0,
      totalClicks: clicksCount.count || 0,
    });

    const fetchedLeagues = (leagueData as LeagueItem[]) || [];
    setLeagues(fetchedLeagues);

    if (presetData) {
      setPresets(presetData.map(p => ({
        id: p.id,
        name: p.id.replace("preset__", ""),
        updated_at: p.updated_at,
      })));
    }

    if (draftData?.config && typeof draftData.config === "object") {
      const saved = draftData.config as unknown as PlayLayoutConfig;
      const merged = mergeConfig(saved, fetchedLeagues);
      setConfig(merged);
    } else {
      setConfig(buildDefaultConfig(fetchedLeagues));
    }
    setLoading(false);
  };

  const buildDefaultConfig = (leagueList: LeagueItem[]): PlayLayoutConfig => {
    const categories = new Set<string>();
    leagueList.forEach(l => { if (l.category) categories.add(l.category); });

    return {
      topLevel: [...DEFAULT_TOP_LEVEL],
      categories: [...categories].sort().map((cat, i) => ({
        key: cat,
        parentKey: "collections",
        hidden: false,
        order: i,
        customLabel: null,
      })),
      leagues: leagueList.map((l, i) => ({
        id: l.id,
        hidden: false,
        order: i,
        customLabel: null,
      })),
    };
  };

  const mergeConfig = (saved: PlayLayoutConfig, leagueList: LeagueItem[]): PlayLayoutConfig => {
    // Ensure all current leagues are in config
    const leagueIds = new Set(saved.leagues.map(l => l.id));
    const newLeagues = leagueList.filter(l => !leagueIds.has(l.id));
    const maxOrder = saved.leagues.reduce((m, l) => Math.max(m, l.order), -1);

    // Ensure all categories exist
    const catKeys = new Set(saved.categories.map(c => c.key));
    const allCats = new Set<string>();
    leagueList.forEach(l => { if (l.category) allCats.add(l.category); });
    const newCats = [...allCats].filter(c => !catKeys.has(c));
    const maxCatOrder = saved.categories.reduce((m, c) => Math.max(m, c.order), -1);

    return {
      topLevel: saved.topLevel.length > 0 ? saved.topLevel : [...DEFAULT_TOP_LEVEL],
      categories: [
        ...saved.categories,
        ...newCats.map((cat, i) => ({
          key: cat,
          parentKey: "collections",
          hidden: false,
          order: maxCatOrder + 1 + i,
          customLabel: null,
        })),
      ],
      leagues: [
        ...saved.leagues,
        ...newLeagues.map((l, i) => ({
          id: l.id,
          hidden: false,
          order: maxOrder + 1 + i,
          customLabel: null,
        })),
      ],
    };
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const updateTopLevel = (items: LayoutTopLevel[]) => {
    const reordered = items.map((item, i) => ({ ...item, order: i }));
    setConfig(prev => ({ ...prev, topLevel: reordered }));
    hasUnsavedChanges.current = true;
  };

  const updateCategories = (items: LayoutCategory[]) => {
    const reordered = items.map((item, i) => ({ ...item, order: i }));
    setConfig(prev => ({ ...prev, categories: reordered }));
    hasUnsavedChanges.current = true;
  };

  const updateLeaguesInCategory = (category: string, items: LayoutLeague[]) => {
    const leagueIdsInCat = new Set(
      leagues.filter(l => l.category === category).map(l => l.id)
    );
    const reorderedIds = new Set(items.map(l => l.id));
    const otherLeagues = config.leagues.filter(l => !reorderedIds.has(l.id));
    const reordered = items.map((item, i) => ({ ...item, order: i }));
    setConfig(prev => ({ ...prev, leagues: [...otherLeagues, ...reordered] }));
    hasUnsavedChanges.current = true;
  };

  const toggleVisibility = (type: "topLevel" | "category" | "league", key: string) => {
    if (type === "topLevel") {
      setConfig(prev => ({
        ...prev,
        topLevel: prev.topLevel.map(t => t.key === key ? { ...t, hidden: !t.hidden } : t),
      }));
    } else if (type === "category") {
      setConfig(prev => ({
        ...prev,
        categories: prev.categories.map(c => c.key === key ? { ...c, hidden: !c.hidden } : c),
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        leagues: prev.leagues.map(l => l.id === key ? { ...l, hidden: !l.hidden } : l),
      }));
    }
    hasUnsavedChanges.current = true;
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    await supabase.from("play_layout_config").upsert({
      id: "draft",
      config: config as any,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    hasUnsavedChanges.current = false;
    toast.success("Draft saved");
  };

  const handlePublish = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from("play_layout_config").upsert({
        id: "published",
        config: config as any,
        updated_at: new Date().toISOString(),
      }),
      supabase.from("play_layout_config").upsert({
        id: "draft",
        config: config as any,
        updated_at: new Date().toISOString(),
      }),
    ]);
    setSaving(false);
    hasUnsavedChanges.current = false;
    toast.success("Published! Changes are now live.");
  };

  const handleReset = async () => {
    setSaving(true);
    await supabase.from("play_layout_config").delete().eq("id", "draft");
    await supabase.from("play_layout_config").delete().eq("id", "published");
    setConfig(buildDefaultConfig(leagues));
    setSaving(false);
    hasUnsavedChanges.current = false;
    toast.success("Reset to default");
  };

  const handleSavePreset = async () => {
    const name = newPresetName.trim();
    if (!name) { toast.error("Enter a preset name"); return; }
    const presetId = `preset__${name}`;
    setSaving(true);
    await supabase.from("play_layout_config").upsert({
      id: presetId,
      config: config as any,
      updated_at: new Date().toISOString(),
    });
    setPresets(prev => {
      const existing = prev.find(p => p.id === presetId);
      if (existing) return prev.map(p => p.id === presetId ? { ...p, updated_at: new Date().toISOString() } : p);
      return [...prev, { id: presetId, name, updated_at: new Date().toISOString() }];
    });
    setSaving(false);
    setNewPresetName("");
    toast.success(`Preset "${name}" saved`);
  };

  const handleLoadPreset = async (presetId: string) => {
    const { data } = await supabase.from("play_layout_config").select("config").eq("id", presetId).single();
    if (data?.config && typeof data.config === "object") {
      const loaded = mergeConfig(data.config as unknown as PlayLayoutConfig, leagues);
      setConfig(loaded);
      hasUnsavedChanges.current = true;
      toast.success(`Loaded preset "${presetId.replace("preset__", "")}"`);
      setPresetPopoverOpen(false);
    }
  };

  const handleDeletePreset = async (presetId: string) => {
    await supabase.from("play_layout_config").delete().eq("id", presetId);
    setPresets(prev => prev.filter(p => p.id !== presetId));
    toast.success("Preset deleted");
  };

  const handleItemEdit = (updates: { hidden: boolean; customLabel: string | null; coverItemId?: string | null }) => {
    if (!editingItem) return;
    const { itemType, itemKey } = editingItem;

    if (itemType === "topLevel") {
      setConfig(prev => ({
        ...prev,
        topLevel: prev.topLevel.map(t => t.key === itemKey ? { ...t, hidden: updates.hidden, label: updates.customLabel || t.label } : t),
      }));
    } else if (itemType === "category") {
      setConfig(prev => ({
        ...prev,
        categories: prev.categories.map(c => c.key === itemKey ? { ...c, hidden: updates.hidden, customLabel: updates.customLabel, coverItemId: updates.coverItemId !== undefined ? updates.coverItemId : c.coverItemId } : c),
      }));
    } else {
      setConfig(prev => ({
        ...prev,
        leagues: prev.leagues.map(l => l.id === itemKey ? { ...l, hidden: updates.hidden, customLabel: updates.customLabel, coverItemId: updates.coverItemId !== undefined ? updates.coverItemId : l.coverItemId } : l),
      }));
    }
    hasUnsavedChanges.current = true;
  };

  const getLeagueName = (id: string) => {
    const configLeague = config.leagues.find(l => l.id === id);
    if (configLeague?.customLabel) return configLeague.customLabel;
    return leagues.find(l => l.id === id)?.name || id;
  };

  const getCategoryLabel = (key: string) => {
    const cat = config.categories.find(c => c.key === key);
    return cat?.customLabel || key;
  };

  // Get user profile for mod notifications
  const getProfileId = async () => {
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("id, display_name").eq("user_id", user.id).single();
    return data;
  };

  const handleAddCategory = async () => {
    const name = newName.trim();
    if (!name) return;
    // Create a league with this category
    const { data, error } = await supabase.from("leagues").insert({
      name: name,
      category: name,
      type: "preset",
      created_by_user_id: user!.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    // Add to config
    setConfig(prev => ({
      ...prev,
      categories: [...prev.categories, { key: name, parentKey: "collections", hidden: false, order: prev.categories.length, customLabel: null }],
      leagues: [...prev.leagues, { id: data.id, hidden: false, order: prev.leagues.length, customLabel: null }],
    }));
    setLeagues(prev => [...prev, { id: data.id, name, category: name, subcategory: null, type: "preset" }]);
    hasUnsavedChanges.current = true;
    setAddCategoryOpen(false);
    setNewName("");
    toast.success(`Category "${name}" created`);
  };

  const handleAddSubcategory = async (parentCategory: string) => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("leagues").insert({
      name: name,
      category: parentCategory,
      subcategory: name,
      type: "preset",
      created_by_user_id: user!.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setConfig(prev => ({
      ...prev,
      leagues: [...prev.leagues, { id: data.id, hidden: false, order: prev.leagues.length, customLabel: null }],
    }));
    setLeagues(prev => [...prev, { id: data.id, name, category: parentCategory, subcategory: name, type: "preset" }]);
    hasUnsavedChanges.current = true;
    setAddSubcategoryOpen(null);
    setNewName("");
    toast.success(`Subcategory "${name}" added to ${parentCategory}`);
  };

  const handleAddItem = async (leagueId: string) => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("preset_items").insert({
      league_id: leagueId,
      name: name,
    });
    if (error) { toast.error(error.message); return; }
    setAddItemOpen(null);
    setNewName("");
    toast.success(`Item "${name}" added`);
  };

  const handleDelete = async (targetType: "league" | "item", targetId: string, targetName: string) => {
    if (isAdmin) {
      // Direct delete
      if (targetType === "league") {
        const { error } = await supabase.from("leagues").delete().eq("id", targetId);
        if (error) { toast.error(error.message); return; }
        setLeagues(prev => prev.filter(l => l.id !== targetId));
        setConfig(prev => ({ ...prev, leagues: prev.leagues.filter(l => l.id !== targetId) }));
      } else {
        const { error } = await supabase.from("preset_items").delete().eq("id", targetId);
        if (error) { toast.error(error.message); return; }
      }
      hasUnsavedChanges.current = true;
      toast.success(`Deleted "${targetName}"`);
    } else {
      // Moderator: send request
      const profile = await getProfileId();
      await supabase.from("admin_notifications").insert({
        type: "mod_delete_request",
        title: `Delete request: ${targetName}`,
        message: `Moderator "${profile?.display_name || "Unknown"}" wants to delete ${targetType} "${targetName}"`,
        metadata: {
          target_type: targetType,
          target_id: targetId,
          target_name: targetName,
          mod_name: profile?.display_name || "Unknown",
          mod_profile_id: profile?.id,
        },
      });
      toast.success("Delete request sent to admin for approval");
    }
  };

  if (loading || !authorized) return <div className="min-h-screen" />;

  // League items detail view
  if (viewingLeague) {
    return (
      <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-8">
        <div className="container mx-auto max-w-2xl">
          <AdminPlayLeagueItems
            leagueId={viewingLeague.id}
            leagueName={viewingLeague.name}
            onClose={() => setViewingLeague(null)}
          />
        </div>
      </div>
    );
  }

  const sortedTopLevel = [...config.topLevel].sort((a, b) => a.order - b.order);
  const sortedCategories = [...config.categories].sort((a, b) => a.order - b.order);

  const getLeaguesForCategory = (catKey: string) => {
    const catLeagueIds = new Set(leagues.filter(l => l.category === catKey).map(l => l.id));
    return config.leagues
      .filter(l => catLeagueIds.has(l.id))
      .sort((a, b) => a.order - b.order);
  };

  const userLeagueIds = new Set(leagues.filter(l => l.type === "user").map(l => l.id));
  const userLeagues = config.leagues.filter(l => userLeagueIds.has(l.id)).sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => navigate(isModerator ? "/moderator" : "/admin")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl sm:text-2xl font-extrabold text-foreground flex-1">Play Layout</h1>

          {/* Presets popover */}
          <Popover open={presetPopoverOpen} onOpenChange={setPresetPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Bookmark className="h-3.5 w-3.5" /> Presets
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Save Current as Preset</p>
              <div className="flex gap-1.5">
                <Input
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  placeholder="Preset name…"
                  className="h-8 text-xs flex-1"
                  onKeyDown={e => e.key === "Enter" && handleSavePreset()}
                />
                <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleSavePreset} disabled={saving}>
                  <Plus className="h-3 w-3" /> Save
                </Button>
              </div>
              {presets.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Load Preset</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {presets.map(p => (
                      <div key={p.id} className="flex items-center gap-1.5 p-1.5 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors">
                        <button onClick={() => handleLoadPreset(p.id)} className="flex-1 text-left text-xs font-semibold text-foreground truncate">
                          <FolderOpen className="h-3 w-3 inline mr-1.5 text-muted-foreground" />
                          {p.name}
                        </button>
                        <button onClick={() => handleDeletePreset(p.id)} className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving} className="gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving} className="gap-1.5 text-xs">
            <Save className="h-3.5 w-3.5" /> Save Draft
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={saving} className="gap-1.5 text-xs font-bold">
            Confirm & Publish
          </Button>
        </div>

        {/* Top Level Items */}
        <Section
          title="Top Level"
          expanded={expandedSections.has("topLevel")}
          onToggle={() => toggleSection("topLevel")}
        >
          <Reorder.Group axis="y" values={sortedTopLevel} onReorder={updateTopLevel} className="space-y-1">
      {sortedTopLevel.map(item => {
                const sectionKey = item.key === "collections" ? "categories" : item.key === "compete" ? "compete" : item.key === "elocheck" ? "categories" : item.key === "multiplayer" ? "multiplayer" : undefined;
                return (
              <Reorder.Item key={item.key} value={item} className="touch-none">
                <DragItem
                  label={item.label}
                  icon={iconMap[item.icon]}
                  hidden={item.hidden}
                  onToggleVisibility={() => toggleVisibility("topLevel", item.key)}
                  onEdit={() => setEditingItem({
                    itemType: "topLevel",
                    itemKey: item.key,
                    item: { key: item.key, label: item.label, hidden: item.hidden, customLabel: null, type: "topLevel" as const },
                  })}
                  onBarClick={sectionKey ? () => {
                    if (!expandedSections.has(sectionKey)) toggleSection(sectionKey);
                    setTimeout(() => document.getElementById(`section-${sectionKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                  } : undefined}
                />
              </Reorder.Item>
                );
              })}
          </Reorder.Group>
        </Section>

        {/* Categories */}
        <Section
          title="Categories"
          sectionId="section-categories"
          expanded={expandedSections.has("categories")}
          onToggle={() => toggleSection("categories")}
          onAdd={() => { setNewName(""); setAddCategoryOpen(true); }}
        >
          <Reorder.Group axis="y" values={sortedCategories} onReorder={updateCategories} className="space-y-1">
            {sortedCategories.map(cat => (
              <Reorder.Item key={cat.key} value={cat} className="touch-none">
                <div>
                  <DragItem
                    label={getCategoryLabel(cat.key)}
                    sublabel={`(${cat.parentKey})`}
                    hidden={cat.hidden}
                    onToggleVisibility={() => toggleVisibility("category", cat.key)}
                    onEdit={() => setEditingItem({
                      itemType: "category",
                      itemKey: cat.key,
                      item: { key: cat.key, label: getCategoryLabel(cat.key), hidden: cat.hidden, customLabel: cat.customLabel, coverItemId: cat.coverItemId, type: "category" as const },
                    })}
                    expandable
                    expanded={expandedCategories.has(cat.key)}
                    onBarClick={() => toggleCategory(cat.key)}
                    onAdd={() => { setNewName(""); setAddSubcategoryOpen(cat.key); }}
                  />
                  <AnimatePresence>
                    {expandedCategories.has(cat.key) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden pl-8"
                      >
                        <Reorder.Group
                          axis="y"
                          values={getLeaguesForCategory(cat.key)}
                          onReorder={(items) => updateLeaguesInCategory(cat.key, items)}
                          className="space-y-1 py-1"
                        >
                          {getLeaguesForCategory(cat.key).map(league => (
                            <Reorder.Item key={league.id} value={league} className="touch-none">
                <DragItem
                                label={getLeagueName(league.id)}
                                hidden={league.hidden}
                                onToggleVisibility={() => toggleVisibility("league", league.id)}
                                onEdit={() => setEditingItem({
                                  itemType: "league",
                                  itemKey: league.id,
                                  item: {
                                    id: league.id,
                                    label: getLeagueName(league.id),
                                    hidden: league.hidden,
                                    customLabel: league.customLabel,
                                    coverItemId: league.coverItemId,
                                    type: "league" as const,
                                    leagueId: league.id,
                                  },
                                })}
                                onBarClick={() => setViewingLeague({ id: league.id, name: getLeagueName(league.id) })}
                                onDelete={() => handleDelete("league", league.id, getLeagueName(league.id))}
                              />
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </Section>

        {/* Compete Leagues */}
        <Section
          title="Compete Leagues"
          sectionId="section-compete"
          expanded={expandedSections.has("compete")}
          onToggle={() => toggleSection("compete")}
        >
          <Reorder.Group
            axis="y"
            values={userLeagues}
            onReorder={(items) => {
              const reordered = items.map((item, i) => ({ ...item, order: i }));
              const otherLeagues = config.leagues.filter(l => !userLeagueIds.has(l.id));
              setConfig(prev => ({ ...prev, leagues: [...otherLeagues, ...reordered] }));
              hasUnsavedChanges.current = true;
            }}
            className="space-y-1"
          >
            {userLeagues.map(league => (
              <Reorder.Item key={league.id} value={league} className="touch-none">
                <DragItem
                  label={getLeagueName(league.id)}
                  hidden={league.hidden}
                  onToggleVisibility={() => toggleVisibility("league", league.id)}
                  onEdit={() => setEditingItem({
                    itemType: "league",
                    itemKey: league.id,
                    item: {
                      id: league.id,
                      label: getLeagueName(league.id),
                      hidden: league.hidden,
                      customLabel: league.customLabel,
                      coverItemId: league.coverItemId,
                      type: "league" as const,
                      leagueId: league.id,
                    },
                  })}
                  onBarClick={() => setViewingLeague({ id: league.id, name: getLeagueName(league.id) })}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </Section>

        {/* Multiplayer Settings */}
        <Section
          title="Multiplayer Settings"
          sectionId="section-multiplayer"
          expanded={expandedSections.has("multiplayer")}
          onToggle={() => toggleSection("multiplayer")}
        >
          <AdminMultiplayer />
        </Section>

        {/* Edit drawer */}
        {editingItem && (
          <AdminPlayItemEditor
            item={editingItem.item}
            onSave={handleItemEdit}
            onClose={() => setEditingItem(null)}
          />
        )}

        {/* Add Category Dialog */}
        <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
              <DialogDescription>Create a new category for collections.</DialogDescription>
            </DialogHeader>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Category name…" onKeyDown={e => e.key === "Enter" && handleAddCategory()} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCategory} disabled={!newName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Subcategory Dialog */}
        <Dialog open={!!addSubcategoryOpen} onOpenChange={open => !open && setAddSubcategoryOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Subcategory</DialogTitle>
              <DialogDescription>Add a subcategory to "{addSubcategoryOpen}".</DialogDescription>
            </DialogHeader>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Subcategory name…" onKeyDown={e => e.key === "Enter" && addSubcategoryOpen && handleAddSubcategory(addSubcategoryOpen)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSubcategoryOpen(null)}>Cancel</Button>
              <Button onClick={() => addSubcategoryOpen && handleAddSubcategory(addSubcategoryOpen)} disabled={!newName.trim()}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Item Dialog */}
        <Dialog open={!!addItemOpen} onOpenChange={open => !open && setAddItemOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Item</DialogTitle>
              <DialogDescription>Add a new item to this league.</DialogDescription>
            </DialogHeader>
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Item name…" onKeyDown={e => e.key === "Enter" && addItemOpen && handleAddItem(addItemOpen)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddItemOpen(null)}>Cancel</Button>
              <Button onClick={() => addItemOpen && handleAddItem(addItemOpen)} disabled={!newName.trim()}>Add Item</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

/* ─── Collapsible section ─── */
function Section({ title, expanded, onToggle, onAdd, sectionId, children }: { title: string; expanded: boolean; onToggle: () => void; onAdd?: () => void; sectionId?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4" id={sectionId}>
      <div className="flex items-center gap-1">
        <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-bold text-foreground">{title}</span>
        </button>
        {onAdd && (
          <button onClick={onAdd} className="shrink-0 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors" title={`Add to ${title}`}>
            <Plus className="h-4 w-4 text-primary" />
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-1 px-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Draggable item row ─── */
function DragItem({
  label,
  sublabel,
  icon,
  hidden,
  onToggleVisibility,
  onEdit,
  expandable,
  expanded,
  onBarClick,
  onDelete,
  onAdd,
}: {
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  hidden: boolean;
  onToggleVisibility: () => void;
  onEdit: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onBarClick?: () => void;
  onDelete?: () => void;
  onAdd?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${hidden ? "border-border/50 bg-muted/30 opacity-60" : "border-border bg-card"} ${onBarClick ? "cursor-pointer hover:bg-accent/30" : ""}`}
      onClick={onBarClick ? (e) => { e.stopPropagation(); onBarClick(); } : undefined}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
      {icon && <span className="text-primary shrink-0">{icon}</span>}
      {expandable && (
        <span className="shrink-0">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
      )}
      <span className="flex-1 text-sm font-semibold text-foreground truncate">
        {label}
        {sublabel && <span className="text-[10px] text-muted-foreground ml-1.5">{sublabel}</span>}
      </span>
      {onAdd && (
        <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors" title="Add">
          <Plus className="h-3.5 w-3.5 text-primary" />
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors">
        {hidden ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-foreground" />}
      </button>
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="shrink-0 p-1 rounded hover:bg-muted transition-colors">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {onDelete && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors" title="Delete">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </div>
  );
}
