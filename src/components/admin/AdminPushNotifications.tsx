import { useEffect, useState } from "react";
import { Send, Users, Trophy, Image, Trash2, Eye, ChevronDown, Search, Globe, Filter, Megaphone, Star, Zap, Bell, Info, AlertTriangle, Gift, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface League {
  id: string;
  name: string;
  category: string | null;
  type: string;
}

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

interface SentNotification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  image_url: string | null;
  created_at: string;
  target_type: string;
  target_league_ids: string[] | null;
  target_categories: string[] | null;
  league_id: string | null;
  item_id: string | null;
  profile_id: string | null;
  metadata: any;
}

const NOTIFICATION_TYPES = [
  { value: "general", label: "General", icon: Bell, description: "General announcement" },
  { value: "new_item", label: "New Item Added", icon: Star, description: "Announce a new item in a league" },
  { value: "elo_milestone", label: "Elo Milestone", icon: Trophy, description: "Celebrate a user reaching an Elo" },
  { value: "new_league", label: "New League", icon: Megaphone, description: "Announce a new league" },
  { value: "promotion", label: "Promotion", icon: Gift, description: "Special promotion or event" },
  { value: "update", label: "App Update", icon: Zap, description: "Feature or app update" },
  { value: "warning", label: "Warning", icon: AlertTriangle, description: "Important warning" },
  { value: "spotlight", label: "Spotlight", icon: Crown, description: "Spotlight a user or item" },
];

const TARGET_TYPES = [
  { value: "all", label: "All Users", icon: Globe },
  { value: "league", label: "Users in Specific Leagues", icon: Trophy },
  { value: "category", label: "Users in Category", icon: Filter },
  { value: "pro", label: "Pro Users Only", icon: Crown },
];

export default function AdminPushNotifications() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [items, setItems] = useState<PresetItem[]>([]);
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [targetType, setTargetType] = useState("all");
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [attachLeagueId, setAttachLeagueId] = useState<string | null>(null);
  const [attachItemId, setAttachItemId] = useState<string | null>(null);
  const [attachProfileSearch, setAttachProfileSearch] = useState("");
  const [attachProfileId, setAttachProfileId] = useState<string | null>(null);
  const [attachProfileName, setAttachProfileName] = useState("");

  // Item search
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState<PresetItem[]>([]);
  const [showItemPicker, setShowItemPicker] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);

  // History tab
  const [showHistory, setShowHistory] = useState(false);

  const categories = [...new Set(leagues.map(l => l.category).filter(Boolean))] as string[];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [leaguesRes, notifRes] = await Promise.all([
      supabase.from("leagues").select("id, name, category, type").order("name"),
      supabase.from("user_notifications").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setLeagues((leaguesRes.data as League[]) || []);
    setSentNotifications((notifRes.data as SentNotification[]) || []);
    setLoading(false);
  };

  const searchItems = async (q: string) => {
    setItemSearch(q);
    if (q.length < 2) { setItemSearchResults([]); return; }
    const { data } = await supabase
      .from("preset_items")
      .select("id, name, image_url, elo, league_id")
      .ilike("name", `%${q}%`)
      .limit(10);
    setItemSearchResults((data as PresetItem[]) || []);
  };

  const searchProfile = async () => {
    if (!attachProfileSearch.trim()) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${attachProfileSearch}%`)
      .limit(5);
    if (data && data.length > 0) {
      setAttachProfileId(data[0].id);
      setAttachProfileName(data[0].display_name);
      toast.success(`Found: ${data[0].display_name}`);
    } else {
      toast.error("No profile found");
    }
  };

  const toggleLeague = (id: string) => {
    setSelectedLeagueIds(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("general");
    setTargetType("all");
    setSelectedLeagueIds([]);
    setSelectedCategories([]);
    setImageUrl("");
    setAttachLeagueId(null);
    setAttachItemId(null);
    setAttachProfileId(null);
    setAttachProfileName("");
    setAttachProfileSearch("");
  };

  const sendNotification = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!user) return;

    setSending(true);
    try {
      const payload: any = {
        title: title.trim(),
        message: message.trim() || null,
        type,
        target_type: targetType,
        target_league_ids: targetType === "league" ? selectedLeagueIds : [],
        target_categories: targetType === "category" ? selectedCategories : [],
        image_url: imageUrl.trim() || null,
        league_id: attachLeagueId,
        item_id: attachItemId,
        profile_id: attachProfileId,
        sent_by_user_id: user.id,
        metadata: {},
      };

      if (targetType === "pro") {
        payload.metadata = { pro_only: true };
      }

      const { error } = await supabase.from("user_notifications").insert(payload);
      if (error) throw error;

      toast.success("Notification sent!");
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("user_notifications").delete().eq("id", id);
    setSentNotifications(prev => prev.filter(n => n.id !== id));
    toast.success("Deleted");
  };

  const typeConfig = NOTIFICATION_TYPES.find(t => t.value === type);
  const attachedLeague = leagues.find(l => l.id === attachLeagueId);
  const attachedItem = itemSearchResults.find(i => i.id === attachItemId) || (items.find(i => i.id === attachItemId));

  if (loading) return <div className="text-center text-muted-foreground py-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Toggle between compose and history */}
      <div className="flex items-center gap-2">
        <Button
          variant={showHistory ? "outline" : "default"}
          size="sm"
          onClick={() => setShowHistory(false)}
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" /> Compose
        </Button>
        <Button
          variant={showHistory ? "default" : "outline"}
          size="sm"
          onClick={() => setShowHistory(true)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" /> History ({sentNotifications.length})
        </Button>
      </div>

      {showHistory ? (
        /* ─── HISTORY ─── */
        <div className="space-y-2">
          {sentNotifications.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-8">No notifications sent yet.</p>
          )}
          {sentNotifications.map(n => (
            <div key={n.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{n.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{n.target_type}</Badge>
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-1">{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                  {n.image_url && (
                    <img src={n.image_url} alt="" className="h-12 w-12 rounded-lg object-cover mt-1" />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deleteNotification(n.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── COMPOSE ─── */
        <div className="space-y-5">
          {/* Notification Type */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notification Type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NOTIFICATION_TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Message */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. New character added to Anime league!"
                maxLength={100}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{title.length}/100</p>
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Message</Label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Optional longer description..."
                maxLength={500}
                rows={3}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{message.length}/500</p>
            </div>
          </div>

          {/* Target Audience */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Target Audience</Label>
            <div className="grid grid-cols-2 gap-2">
              {TARGET_TYPES.map(t => {
                const Icon = t.icon;
                const active = targetType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setTargetType(t.value)}
                    className={`flex items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* League picker */}
            {targetType === "league" && (
              <div className="space-y-2 mt-2">
                <Label className="text-[10px] text-muted-foreground">Select leagues to target:</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {leagues.filter(l => l.type === "preset").map(l => (
                    <button
                      key={l.id}
                      onClick={() => toggleLeague(l.id)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                        selectedLeagueIds.includes(l.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
                {selectedLeagueIds.length > 0 && (
                  <p className="text-[10px] text-primary">{selectedLeagueIds.length} league(s) selected</p>
                )}
              </div>
            )}

            {/* Category picker */}
            {targetType === "category" && (
              <div className="space-y-2 mt-2">
                <Label className="text-[10px] text-muted-foreground">Select categories:</Label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                        selectedCategories.includes(cat)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Attachments (Optional)</Label>

            {/* Image */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Image URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                {imageUrl && (
                  <img src={imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-border" />
                )}
              </div>
            </div>

            {/* Attach League */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Attach League</Label>
              <Select value={attachLeagueId || "none"} onValueChange={v => setAttachLeagueId(v === "none" ? null : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="No league attached" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {leagues.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Attach Item */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Attach Item</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={itemSearch}
                  onChange={e => searchItems(e.target.value)}
                  placeholder="Search items by name..."
                  className="flex-1"
                />
              </div>
              {itemSearchResults.length > 0 && (
                <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto bg-card">
                  {itemSearchResults.map(item => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setAttachItemId(item.id);
                        setItemSearch(item.name);
                        setItemSearchResults([]);
                        if (!imageUrl && item.image_url) setImageUrl(item.image_url);
                        const itemLeague = leagues.find(l => l.id === item.league_id);
                        if (!attachLeagueId && itemLeague) setAttachLeagueId(itemLeague.id);
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2"
                    >
                      {item.image_url && (
                        <img src={item.image_url} alt="" className="h-6 w-6 rounded object-cover" />
                      )}
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground ml-auto">Elo: {item.elo}</span>
                    </button>
                  ))}
                </div>
              )}
              {attachItemId && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px]">Item: {itemSearch || attachItemId}</Badge>
                  <button onClick={() => { setAttachItemId(null); setItemSearch(""); }} className="text-[10px] text-destructive">Remove</button>
                </div>
              )}
            </div>

            {/* Attach Profile */}
            <div>
              <Label className="text-[10px] text-muted-foreground">Attach Profile (for spotlight/milestone)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={attachProfileSearch}
                  onChange={e => setAttachProfileSearch(e.target.value)}
                  placeholder="Search by display name..."
                  className="flex-1"
                  onKeyDown={e => e.key === "Enter" && searchProfile()}
                />
                <Button size="sm" variant="outline" onClick={searchProfile}>
                  <Search className="h-3 w-3" />
                </Button>
              </div>
              {attachProfileId && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-[10px]">Profile: {attachProfileName}</Badge>
                  <button onClick={() => { setAttachProfileId(null); setAttachProfileName(""); setAttachProfileSearch(""); }} className="text-[10px] text-destructive">Remove</button>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Preview</p>
            <div className="flex items-start gap-3">
              {imageUrl && (
                <img src={imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-border" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {typeConfig && <typeConfig.icon className="h-3.5 w-3.5 text-primary" />}
                  <p className="text-sm font-bold text-foreground">{title || "Notification title"}</p>
                </div>
                {message && <p className="text-xs text-muted-foreground mt-0.5">{message}</p>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[9px]">{type}</Badge>
                  {attachedLeague && <Badge variant="secondary" className="text-[9px]">{attachedLeague.name}</Badge>}
                  {attachProfileName && <Badge variant="secondary" className="text-[9px]">@{attachProfileName}</Badge>}
                </div>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Target: {targetType === "all" ? "All users" :
                targetType === "pro" ? "Pro users only" :
                targetType === "league" ? `${selectedLeagueIds.length} league(s)` :
                `${selectedCategories.length} category(ies)`}
            </p>
          </div>

          {/* Send */}
          <div className="flex gap-2">
            <Button onClick={sendNotification} disabled={sending || !title.trim()} className="flex-1 gap-2">
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send Notification"}
            </Button>
            <Button variant="outline" onClick={resetForm}>Clear</Button>
          </div>
        </div>
      )}
    </div>
  );
}
