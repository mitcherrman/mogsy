import { useEffect, useState } from "react";
import { Send, Users, Trophy, Image, Trash2, Eye, Search, Globe, Filter, Megaphone, Star, Zap, Bell, AlertTriangle, Gift, Crown, Clock, Calendar, Repeat, Palette, Link2, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  scheduled_at: string | null;
  is_recurring: boolean;
  recurrence_rule: string | null;
  recurrence_end_at: string | null;
  is_sent: boolean;
  action_url: string | null;
  priority: string;
  emoji: string | null;
}

const NOTIFICATION_TYPES = [
  { value: "general", label: "General", icon: Bell, description: "General announcement" },
  { value: "new_item", label: "New Item", icon: Star, description: "New item in a league" },
  { value: "elo_milestone", label: "Elo Milestone", icon: Trophy, description: "User reached an Elo" },
  { value: "new_league", label: "New League", icon: Megaphone, description: "Announce a new league" },
  { value: "promotion", label: "Promotion", icon: Gift, description: "Special promotion" },
  { value: "update", label: "App Update", icon: Zap, description: "Feature update" },
  { value: "warning", label: "Warning", icon: AlertTriangle, description: "Important warning" },
  { value: "spotlight", label: "Spotlight", icon: Crown, description: "Spotlight user/item" },
  // LoL product types — the only user-visible types (besides update/warning)
  // while LEAGUE_ONLY_MODE is on. See UserNotificationBell allowlist.
  { value: "lol_quiz", label: "League Quiz", icon: Star, description: "League quiz updates / new questions" },
  { value: "quiz_broadcast", label: "Quiz Broadcast", icon: Megaphone, description: "Live quiz broadcast announcement" },
  { value: "combat_lab", label: "Combat Lab", icon: Zap, description: "Combat Lab / simulator update" },
  { value: "lol_patch", label: "LoL Patch", icon: Globe, description: "Patch / game data update" },
  { value: "esports_quiz", label: "Esports Quiz", icon: Trophy, description: "Esports trivia / history update" },
  { value: "lol_site_notice", label: "LoL Site Notice", icon: Bell, description: "Site notice for the LoL product" },
];

/**
 * "All users" is the only delivery mode this product actually implements.
 *
 * The league / category / pro modes wrote `target_categories` and
 * `target_league_ids`, but nothing ever read them: the RLS SELECT policy on
 * user_notifications is `target_type = 'all' OR admin OR is_profile_owner(...)`,
 * and the bell applies no cohort filter either. A row sent with any of those
 * three modes is therefore readable by admins only — it reached zero of its
 * intended recipients while the console reported "Notification sent!".
 *
 * Scheduling and recurrence were the same shape of untruth: `scheduled_at`,
 * `is_sent`, `is_recurring` and `recurrence_rule` have no consumer anywhere in
 * the codebase, and because the bell does not filter on `is_sent`, a
 * "scheduled" notification was delivered immediately regardless of its date.
 *
 * Rather than leave controls that lie, this phase exposes only what works.
 * The columns stay in the schema; re-introducing a mode means implementing its
 * reader first.
 */
const TARGET_TYPE_ALL = "all";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low", color: "text-muted-foreground" },
  { value: "normal", label: "Normal", color: "text-foreground" },
  { value: "high", label: "High", color: "text-orange-500" },
  { value: "urgent", label: "Urgent", color: "text-destructive" },
];

const EMOJI_PRESETS = ["🔥", "🎉", "⚡", "🏆", "💎", "🚀", "⭐", "❤️", "👑", "🎯", "💪", "🎮", "📢", "🆕", "⚠️", "🎁"];

export default function AdminPushNotifications() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [imageUrl, setImageUrl] = useState("");
  const [attachLeagueId, setAttachLeagueId] = useState<string | null>(null);
  const [attachItemId, setAttachItemId] = useState<string | null>(null);
  const [attachProfileSearch, setAttachProfileSearch] = useState("");
  const [attachProfileId, setAttachProfileId] = useState<string | null>(null);
  const [attachProfileName, setAttachProfileName] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [priority, setPriority] = useState("normal");
  const [emoji, setEmoji] = useState("");

  // Item search
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearchResults, setItemSearchResults] = useState<PresetItem[]>([]);

  // History tab
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "sent" | "scheduled" | "recurring">("all");

  useEffect(() => { loadData(); }, []);

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
    const { data } = await supabase.from("preset_items").select("id, name, image_url, elo, league_id").ilike("name", `%${q}%`).limit(10);
    setItemSearchResults((data as PresetItem[]) || []);
  };

  const searchProfile = async () => {
    if (!attachProfileSearch.trim()) return;
    const { data } = await supabase.from("profiles").select("id, display_name, avatar_url").ilike("display_name", `%${attachProfileSearch}%`).limit(5);
    if (data && data.length > 0) {
      setAttachProfileId(data[0].id);
      setAttachProfileName(data[0].display_name);
      toast.success(`Found: ${data[0].display_name}`);
    } else {
      toast.error("No profile found");
    }
  };

  const resetForm = () => {
    setTitle(""); setMessage(""); setType("general"); setImageUrl("");
    setAttachLeagueId(null); setAttachItemId(null); setAttachProfileId(null);
    setAttachProfileName(""); setAttachProfileSearch(""); setActionUrl("");
    setPriority("normal"); setEmoji("");
  };

  const sendNotification = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!user) return;

    setSending(true);
    try {
      const payload = {
        title: title.trim(),
        message: message.trim() || null,
        type,
        // Every send is a broadcast. The cohort columns are written empty rather
        // than omitted so a row can never look like it carried targeting it did
        // not actually have.
        target_type: TARGET_TYPE_ALL,
        target_league_ids: [],
        target_categories: [],
        image_url: imageUrl.trim() || null,
        league_id: attachLeagueId,
        item_id: attachItemId,
        profile_id: attachProfileId,
        sent_by_user_id: user.id,
        action_url: actionUrl.trim() || null,
        priority,
        emoji: emoji || null,
        // Delivery is immediate and one-shot. Recorded explicitly so the row
        // agrees with what actually happened.
        scheduled_at: null,
        is_recurring: false,
        recurrence_rule: null,
        recurrence_end_at: null,
        is_sent: true,
        metadata: {},
      };

      const { error } = await supabase.from("user_notifications").insert(payload);
      // Success is reported only once the insert has actually landed. On failure
      // the form is left intact so the admin can retry without retyping.
      if (error) throw error;

      toast.success("Notification sent!");
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(err?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const deleteNotification = async (id: string) => {
    const { error } = await supabase.from("user_notifications").delete().eq("id", id);
    if (error) { toast.error(error.message || "Failed to delete"); return; }
    setSentNotifications(prev => prev.filter(n => n.id !== id));
    toast.success("Deleted");
  };

  const duplicateNotification = (n: SentNotification) => {
    setTitle(n.title);
    setMessage(n.message || "");
    setType(n.type);
    setImageUrl(n.image_url || "");
    setAttachLeagueId(n.league_id);
    setAttachItemId(n.item_id);
    setAttachProfileId(n.profile_id);
    setActionUrl(n.action_url || "");
    setPriority(n.priority || "normal");
    setEmoji(n.emoji || "");
    setShowHistory(false);
    toast.info("Notification duplicated to composer");
  };

  const typeConfig = NOTIFICATION_TYPES.find(t => t.value === type);
  const attachedLeague = leagues.find(l => l.id === attachLeagueId);

  const filteredHistory = sentNotifications.filter(n => {
    if (historyFilter === "sent") return n.is_sent && !n.is_recurring;
    if (historyFilter === "scheduled") return !n.is_sent;
    if (historyFilter === "recurring") return n.is_recurring;
    return true;
  });

  if (loading) return <div className="text-center text-muted-foreground py-4">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Notification System Settings (read-only summary of current behavior) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-foreground text-sm">Notification Settings</h3>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold ml-auto">Current</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg border border-border bg-background/40 p-2.5">
            <p className="font-semibold text-foreground flex items-center gap-1.5"><Clock className="h-3 w-3 text-primary" /> Signup cutoff</p>
            <p className="text-muted-foreground mt-1">Users only see notifications created at or after their signup time. Old test/system notifications are hidden from new members.</p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-2.5">
            <p className="font-semibold text-foreground flex items-center gap-1.5"><Zap className="h-3 w-3 text-primary" /> Automated triggers</p>
            <ul className="text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
              <li>Comment replies & reactions → comment owner</li>
              <li>Friend requests & acceptances → both parties</li>
              <li>Reports / feedback → admins (real-time)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex items-center gap-2">
        <Button variant={showHistory ? "outline" : "default"} size="sm" onClick={() => setShowHistory(false)} className="gap-1.5">
          <Send className="h-3.5 w-3.5" /> Compose
        </Button>
        <Button variant={showHistory ? "default" : "outline"} size="sm" onClick={() => setShowHistory(true)} className="gap-1.5">
          <Eye className="h-3.5 w-3.5" /> History ({sentNotifications.length})
        </Button>
      </div>

      {showHistory ? (
        <div className="space-y-3">
          {/* History filters */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "sent", "scheduled", "recurring"] as const).map(f => (
              <button key={f} onClick={() => setHistoryFilter(f)}
                className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all capitalize ${
                  historyFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"
                }`}>{f}</button>
            ))}
          </div>
          {filteredHistory.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No notifications found.</p>}
          {filteredHistory.map(n => (
            <div key={n.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {n.emoji && <span className="text-sm">{n.emoji}</span>}
                    <Badge variant="secondary" className="text-[10px]">{n.type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{n.target_type}</Badge>
                    {n.priority !== "normal" && (
                      <Badge variant={n.priority === "urgent" ? "destructive" : "outline"} className="text-[10px]">{n.priority}</Badge>
                    )}
                    {!n.is_sent && <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">Legacy: marked scheduled</Badge>}
                    {n.is_recurring && <Badge className="text-[10px] bg-blue-500/20 text-blue-600 border-blue-500/30">Legacy: marked recurring</Badge>}
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-1">{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                  {n.image_url && <img src={n.image_url} alt="" className="h-12 w-12 rounded-lg object-cover mt-1" />}
                  {/*
                    * Historical rows only. Nothing ever consumed scheduled_at or
                    * recurrence_rule, and the bell does not filter on is_sent, so
                    * these were delivered the moment they were created. Shown so the
                    * stored data is legible — not as evidence a scheduler exists.
                    */}
                  {n.scheduled_at && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Was marked for {new Date(n.scheduled_at).toLocaleString()} — delivered immediately (no scheduler)
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => duplicateNotification(n)}>Copy</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deleteNotification(n.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Notification Type */}
          <Section label="Notification Type">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NOTIFICATION_TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button key={t.value} onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-primary/30"
                    }`}>
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Title & Message */}
          <Section label="Content">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title *" maxLength={100} className="flex-1" />
                  <span className="text-[10px] text-muted-foreground shrink-0">{title.length}/100</span>
                </div>
              </div>
              <div>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message body..." maxLength={500} rows={3} />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{message.length}/500</p>
              </div>
            </div>
          </Section>

          {/* Emoji & Priority */}
          <Section label="Style">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Emoji</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {EMOJI_PRESETS.map(e => (
                    <button key={e} onClick={() => setEmoji(emoji === e ? "" : e)}
                      className={`text-lg w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                        emoji === e ? "border-primary bg-primary/10 scale-110" : "border-border hover:border-primary/30"
                      }`}>{e}</button>
                  ))}
                  {emoji && !EMOJI_PRESETS.includes(emoji) && (
                    <span className="text-lg w-8 h-8 rounded-lg border border-primary bg-primary/10 flex items-center justify-center">{emoji}</span>
                  )}
                  <Input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="Custom" className="w-20 h-8 text-xs" maxLength={4} />
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Priority</Label>
                <div className="flex gap-2 mt-1">
                  {PRIORITY_OPTIONS.map(p => (
                    <button key={p.value} onClick={() => setPriority(p.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                        priority === p.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                      }`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Action URL (optional)</Label>
                <Input value={actionUrl} onChange={e => setActionUrl(e.target.value)} placeholder="/leagues or https://..." className="mt-1" />
              </div>
            </div>
          </Section>

          {/* Target Audience */}
          <Section label="Target Audience">
            <div
              data-testid="target-audience-all"
              className="flex items-center gap-2 p-3 rounded-xl border border-primary bg-primary/10 text-primary text-xs font-medium"
            >
              <Globe className="h-4 w-4" />All Users
            </div>
            <p className="text-[10px] text-muted-foreground">
              Every notification is delivered to all signed-in users. League, category and
              Pro-only targeting are not implemented — rows sent that way reached nobody, so
              the controls were removed rather than left to report false delivery.
            </p>
          </Section>

          {/* Attachments */}
          <Section label="Attachments">
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground">Image URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." className="flex-1" />
                  {imageUrl && <img src={imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-border" />}
                </div>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Attach League</Label>
                <Select value={attachLeagueId || "none"} onValueChange={v => setAttachLeagueId(v === "none" ? null : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No league attached" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {leagues.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Attach Item</Label>
                <Input value={itemSearch} onChange={e => searchItems(e.target.value)} placeholder="Search items by name..." className="mt-1" />
                {itemSearchResults.length > 0 && (
                  <div className="mt-1 border border-border rounded-lg max-h-32 overflow-y-auto bg-card">
                    {itemSearchResults.map(item => (
                      <button key={item.id} onClick={() => {
                        setAttachItemId(item.id); setItemSearch(item.name); setItemSearchResults([]);
                        if (!imageUrl && item.image_url) setImageUrl(item.image_url);
                        if (!attachLeagueId) setAttachLeagueId(item.league_id);
                      }} className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2">
                        {item.image_url && <img src={item.image_url} alt="" className="h-6 w-6 rounded object-cover" />}
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
              <div>
                <Label className="text-[10px] text-muted-foreground">Attach Profile</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={attachProfileSearch} onChange={e => setAttachProfileSearch(e.target.value)} placeholder="Search by name..." className="flex-1" onKeyDown={e => e.key === "Enter" && searchProfile()} />
                  <Button size="sm" variant="outline" onClick={searchProfile}><Search className="h-3 w-3" /></Button>
                </div>
                {attachProfileId && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">Profile: {attachProfileName}</Badge>
                    <button onClick={() => { setAttachProfileId(null); setAttachProfileName(""); setAttachProfileSearch(""); }} className="text-[10px] text-destructive">Remove</button>
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Preview */}
          <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 space-y-2">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Preview</p>
            <div className="flex items-start gap-3">
              {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-border" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {emoji && <span className="text-base">{emoji}</span>}
                  {typeConfig && <typeConfig.icon className="h-3.5 w-3.5 text-primary" />}
                  <p className="text-sm font-bold text-foreground">{title || "Notification title"}</p>
                  {priority !== "normal" && <Badge variant={priority === "urgent" ? "destructive" : "outline"} className="text-[9px]">{priority}</Badge>}
                </div>
                {message && <p className="text-xs text-muted-foreground mt-0.5">{message}</p>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[9px]">{type}</Badge>
                  {attachedLeague && <Badge variant="secondary" className="text-[9px]">{attachedLeague.name}</Badge>}
                  {attachProfileName && <Badge variant="secondary" className="text-[9px]">@{attachProfileName}</Badge>}
                  {actionUrl && <Badge variant="outline" className="text-[9px]">🔗 {actionUrl}</Badge>}
                </div>
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">Target: All users • Sent immediately</p>
          </div>

          {/* Send */}
          <div className="flex gap-2">
            <Button onClick={sendNotification} disabled={sending || !title.trim()} className="flex-1 gap-2">
              <Send className="h-4 w-4" />
              {sending ? "Sending..." : "Send Now"}
            </Button>
            <Button variant="outline" onClick={resetForm}>Clear</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {children}
    </div>
  );
}
