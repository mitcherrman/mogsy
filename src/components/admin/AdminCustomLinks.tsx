import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link2, Copy, Trash2, Plus, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SITE_URL } from "@/lib/site-config";

interface CustomLink {
  id: string;
  slug: string;
  destination_type: string;
  league_id: string | null;
  recommended_categories: string[];
  recommended_league_ids: string[];
  default_theme: string;
  default_swipe_animation: string;
  grant_diamonds: number;
  grant_pro: boolean;
  label: string;
  is_active: boolean;
  visits: number;
  created_at: string;
}

interface LeagueOption {
  id: string;
  name: string;
  type: string;
  category: string | null;
}

const ALL_CATEGORIES = ["Anime", "Movies", "Video Games", "Celebrities", "Sports", "Food", "Other"];

export default function AdminCustomLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState<CustomLink[]>([]);
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    slug: "",
    label: "",
    destination_type: "league" as "league" | "curated",
    league_id: "",
    recommended_categories: [] as string[],
    recommended_league_ids: [] as string[],
    default_theme: "default",
    default_swipe_animation: "default",
    grant_diamonds: 0,
    grant_pro: false,
  });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [{ data: linksData }, { data: leaguesData }] = await Promise.all([
      supabase.from("custom_links").select("*").order("created_at", { ascending: false }),
      supabase.from("leagues").select("id, name, type, category"),
    ]);
    setLinks((linksData as CustomLink[]) || []);
    setLeagues((leaguesData as LeagueOption[]) || []);
    setLoading(false);
  };

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${SITE_URL}/${slug}`);
    toast.success("Link copied!");
  };

  const createLink = async () => {
    if (!user || !form.slug.trim()) { toast.error("Slug is required"); return; }
    const cleanSlug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleanSlug) { toast.error("Invalid slug"); return; }

    setSaving(true);
    const { error } = await supabase.from("custom_links").insert({
      slug: cleanSlug,
      label: form.label || "",
      destination_type: form.destination_type,
      league_id: form.destination_type === "league" && form.league_id ? form.league_id : null,
      recommended_categories: form.recommended_categories,
      recommended_league_ids: form.recommended_league_ids,
      default_theme: form.default_theme,
      default_swipe_animation: form.default_swipe_animation,
      grant_diamonds: form.grant_diamonds,
      grant_pro: form.grant_pro,
      created_by_user_id: user.id,
    } as any);

    if (error) {
      toast.error(error.message.includes("unique") ? "Slug already exists" : "Failed to create");
    } else {
      toast.success("Custom link created!");
      setShowCreate(false);
      setForm({ slug: "", label: "", destination_type: "league", league_id: "", recommended_categories: [], recommended_league_ids: [], default_theme: "default", default_swipe_animation: "default", grant_diamonds: 0, grant_pro: false });
      loadAll();
    }
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("custom_links").update({ is_active: !current } as any).eq("id", id);
    setLinks(prev => prev.map(l => l.id === id ? { ...l, is_active: !current } : l));
    toast.success(current ? "Link deactivated" : "Link activated");
  };

  const deleteLink = async (id: string) => {
    await supabase.from("custom_links").delete().eq("id", id);
    setLinks(prev => prev.filter(l => l.id !== id));
    toast.success("Link deleted");
  };

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      recommended_categories: f.recommended_categories.includes(cat)
        ? f.recommended_categories.filter(c => c !== cat)
        : [...f.recommended_categories, cat],
    }));
  };

  const toggleLeague = (id: string) => {
    setForm(f => ({
      ...f,
      recommended_league_ids: f.recommended_league_ids.includes(id)
        ? f.recommended_league_ids.filter(l => l !== id)
        : [...f.recommended_league_ids, id],
    }));
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" /> Custom URL Slugs
        </h3>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Create Link
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Create vanity URLs like <code className="text-primary">/LOL</code> that redirect to leagues or curated experiences.
      </p>

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
              <h4 className="text-sm font-bold text-foreground">New Custom Link</h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Slug (URL path)</Label>
                  <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="e.g. LOL, anime-fans" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">{SITE_URL}/{form.slug.toLowerCase().replace(/[^a-z0-9-]/g, "") || "..."}</p>
                </div>
                <div>
                  <Label className="text-xs">Label (optional)</Label>
                  <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Internal label" />
                </div>
              </div>

              {/* Destination Type */}
              <div>
                <Label className="text-xs font-bold">Destination Type</Label>
                <div className="flex gap-3 mt-1">
                  {(["league", "curated"] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, destination_type: t }))}
                      className={`text-xs rounded-full px-4 py-1.5 border transition-all ${form.destination_type === t ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}>
                      {t === "league" ? "Direct League" : "Curated Experience"}
                    </button>
                  ))}
                </div>
              </div>

              {/* League picker for direct type */}
              {form.destination_type === "league" && (
                <div>
                  <Label className="text-xs">Target League</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.league_id} onChange={e => setForm(f => ({ ...f, league_id: e.target.value }))}>
                    <option value="">Select a league...</option>
                    {leagues.filter(l => l.type === "preset").map(l => (
                      <option key={l.id} value={l.id}>{l.name} ({l.category})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Curated options */}
              {form.destination_type === "curated" && (
                <>
                  <div>
                    <Label className="text-xs font-bold">Recommended Categories</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {ALL_CATEGORIES.map(cat => (
                        <button key={cat} onClick={() => toggleCategory(cat)}
                          className={`text-xs rounded-full px-3 py-1 border transition-all ${form.recommended_categories.includes(cat) ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-bold">Featured Leagues (shown on home)</Label>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border p-2 mt-1 space-y-1">
                      {leagues.filter(l => l.type === "preset").map(l => (
                        <label key={l.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={form.recommended_league_ids.includes(l.id)} onChange={() => toggleLeague(l.id)} className="rounded" />
                          <span className="text-foreground">{l.name}</span>
                          <span className="text-muted-foreground">({l.category})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Default Theme</Label>
                      <Input value={form.default_theme} onChange={e => setForm(f => ({ ...f, default_theme: e.target.value }))} placeholder="default" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Swipe Animation</Label>
                      <Input value={form.default_swipe_animation} onChange={e => setForm(f => ({ ...f, default_swipe_animation: e.target.value }))} placeholder="default" />
                    </div>
                  </div>
                </>
              )}

              {/* Rewards */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Grant Diamonds</Label>
                  <Input type="number" min={0} value={form.grant_diamonds} onChange={e => setForm(f => ({ ...f, grant_diamonds: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Switch checked={form.grant_pro} onCheckedChange={v => setForm(f => ({ ...f, grant_pro: v }))} />
                  <Label className="text-xs">Grant Pro</Label>
                </div>
              </div>

              <Button onClick={createLink} disabled={saving} className="w-full">
                {saving ? "Creating..." : "Create Custom Link"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing links */}
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No custom links yet.</p>
      ) : (
        <div className="space-y-2">
          {links.map(link => {
            const isExpanded = expandedId === link.id;
            const leagueName = leagues.find(l => l.id === link.league_id)?.name;
            return (
              <div key={link.id} className={`rounded-xl border bg-card overflow-hidden ${!link.is_active ? "opacity-60 border-border" : "border-border"}`}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                      <Link2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">/{link.slug} {link.label && <span className="text-muted-foreground font-normal">— {link.label}</span>}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {link.destination_type === "league" ? `→ ${leagueName || "League"}` : "Curated"} · <Eye className="inline h-3 w-3" /> {link.visits} visits
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" aria-label="Copy" variant="ghost" onClick={() => copyLink(link.slug)} className="h-8 w-8"><Copy className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" aria-label="Move up" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : link.id)} className="h-8 w-8">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-3 space-y-2 border-t border-border pt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <span className="text-muted-foreground">Type:</span><span className="text-foreground capitalize">{link.destination_type}</span>
                          {link.destination_type === "league" && <><span className="text-muted-foreground">League:</span><span>{leagueName || "—"}</span></>}
                          {link.recommended_categories.length > 0 && <><span className="text-muted-foreground">Categories:</span><span>{link.recommended_categories.join(", ")}</span></>}
                          {link.recommended_league_ids.length > 0 && <><span className="text-muted-foreground">Featured Leagues:</span><span>{link.recommended_league_ids.length} leagues</span></>}
                          {link.grant_diamonds > 0 && <><span className="text-muted-foreground">Diamonds:</span><span>{link.grant_diamonds}</span></>}
                          {link.grant_pro && <><span className="text-muted-foreground">Pro:</span><span className="text-primary font-bold">Yes</span></>}
                          <span className="text-muted-foreground">Theme:</span><span>{link.default_theme}</span>
                          <span className="text-muted-foreground">Animation:</span><span>{link.default_swipe_animation}</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => toggleActive(link.id, link.is_active)} className="flex-1 text-xs">
                            {link.is_active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteLink(link.id)} className="text-xs">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
