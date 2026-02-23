import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Link2, Copy, Trash2, Users, Shield, Plus, ChevronDown, ChevronUp, Gift, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface InviteLink {
  id: string;
  code: string;
  type: "admin" | "user";
  label: string | null;
  grant_admin: boolean;
  grant_pro: boolean;
  grant_diamonds: number;
  grant_boost_credits: number;
  grant_elo_shields: number;
  grant_reveals: number;
  grant_rewinds: number;
  recommended_categories: string[];
  recommended_league_ids: string[];
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface UserInviteSettings {
  id: string;
  reward_diamonds: number;
  reward_boost_credits: number;
  reward_elo_bonus: number;
  referrer_diamonds: number;
  referrer_boost_credits: number;
  is_enabled: boolean;
}

const ALL_CATEGORIES = ["Anime", "Movies", "Video Games", "Celebrities", "Sports", "Food", "Other"];

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export default function AdminInviteLinks() {
  const { user } = useAuth();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [userSettings, setUserSettings] = useState<UserInviteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // New link form state
  const [form, setForm] = useState({
    type: "admin" as "admin" | "user",
    label: "",
    grant_admin: false,
    grant_pro: false,
    grant_diamonds: 0,
    grant_boost_credits: 0,
    grant_elo_shields: 0,
    grant_reveals: 0,
    grant_rewinds: 0,
    recommended_categories: [] as string[],
    max_uses: "",
    expires_days: "",
  });

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const [{ data: linksData }, { data: settingsData }] = await Promise.all([
      supabase.from("invite_links").select("*").order("created_at", { ascending: false }),
      supabase.from("user_invite_settings").select("*").limit(1).single(),
    ]);
    setLinks((linksData as InviteLink[]) || []);
    setUserSettings(settingsData as UserInviteSettings | null);
    setLoading(false);
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/auth?invite=${code}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied!");
  };

  const createLink = async () => {
    if (!user) return;
    setSaving(true);
    const code = generateCode();
    const expiresAt = form.expires_days
      ? new Date(Date.now() + parseInt(form.expires_days) * 86400000).toISOString()
      : null;

    const { error } = await supabase.from("invite_links").insert({
      code,
      type: form.type,
      label: form.label || null,
      created_by_user_id: user.id,
      grant_admin: form.grant_admin,
      grant_pro: form.grant_pro,
      grant_diamonds: form.grant_diamonds,
      grant_boost_credits: form.grant_boost_credits,
      grant_elo_shields: form.grant_elo_shields,
      grant_reveals: form.grant_reveals,
      grant_rewinds: form.grant_rewinds,
      recommended_categories: form.recommended_categories,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: expiresAt,
    });

    if (error) {
      toast.error("Failed to create link");
    } else {
      toast.success("Invite link created!");
      setShowCreate(false);
      setForm({
        type: "admin", label: "", grant_admin: false, grant_pro: false,
        grant_diamonds: 0, grant_boost_credits: 0, grant_elo_shields: 0,
        grant_reveals: 0, grant_rewinds: 0, recommended_categories: [],
        max_uses: "", expires_days: "",
      });
      loadAll();
    }
    setSaving(false);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("invite_links").update({ is_active: !current }).eq("id", id);
    setLinks((prev) => prev.map((l) => l.id === id ? { ...l, is_active: !current } : l));
    toast.success(current ? "Link deactivated" : "Link activated");
  };

  const deleteLink = async (id: string) => {
    await supabase.from("invite_links").delete().eq("id", id);
    setLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success("Link deleted");
  };

  const saveUserSettings = async () => {
    if (!userSettings) return;
    setSaving(true);
    const { error } = await supabase.from("user_invite_settings").update({
      reward_diamonds: userSettings.reward_diamonds,
      reward_boost_credits: userSettings.reward_boost_credits,
      reward_elo_bonus: userSettings.reward_elo_bonus,
      referrer_diamonds: userSettings.referrer_diamonds,
      referrer_boost_credits: userSettings.referrer_boost_credits,
      is_enabled: userSettings.is_enabled,
      updated_at: new Date().toISOString(),
    }).eq("id", userSettings.id);
    if (error) toast.error("Failed to save"); else toast.success("Settings saved");
    setSaving(false);
  };

  const toggleCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      recommended_categories: f.recommended_categories.includes(cat)
        ? f.recommended_categories.filter((c) => c !== cat)
        : [...f.recommended_categories, cat],
    }));
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Invite Links
        </h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSettings(!showSettings)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" /> Referral Settings
          </Button>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Link
          </Button>
        </div>
      </div>

      {/* User Referral Settings */}
      <AnimatePresence>
        {showSettings && userSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users className="h-3.5 w-3.5" /> User Referral Program Settings
              </h4>
              <p className="text-xs text-muted-foreground">
                Configure what users and their referrals earn when someone signs up via a user invite link.
              </p>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Referral Program Enabled</Label>
                <Switch
                  checked={userSettings.is_enabled}
                  onCheckedChange={(v) => setUserSettings({ ...userSettings, is_enabled: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">New User Gets (Diamonds)</Label>
                  <Input type="number" min={0} value={userSettings.reward_diamonds}
                    onChange={(e) => setUserSettings({ ...userSettings, reward_diamonds: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">New User Gets (Boosts)</Label>
                  <Input type="number" min={0} value={userSettings.reward_boost_credits}
                    onChange={(e) => setUserSettings({ ...userSettings, reward_boost_credits: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Referrer Gets (Diamonds)</Label>
                  <Input type="number" min={0} value={userSettings.referrer_diamonds}
                    onChange={(e) => setUserSettings({ ...userSettings, referrer_diamonds: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Referrer Gets (Boosts)</Label>
                  <Input type="number" min={0} value={userSettings.referrer_boost_credits}
                    onChange={(e) => setUserSettings({ ...userSettings, referrer_boost_credits: parseInt(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">New User ELO Bonus</Label>
                  <Input type="number" min={0} value={userSettings.reward_elo_bonus}
                    onChange={(e) => setUserSettings({ ...userSettings, reward_elo_bonus: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              <Button size="sm" disabled={saving} onClick={saveUserSettings} className="w-full">
                {saving ? "Saving..." : "Save Referral Settings"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create New Link */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
              <h4 className="text-sm font-bold text-foreground">Create New Invite Link</h4>

              {/* Type selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setForm((f) => ({ ...f, type: "admin" }))}
                  className={`flex-1 rounded-lg border p-3 text-xs font-bold text-center transition-all ${form.type === "admin" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  <Shield className="h-4 w-4 mx-auto mb-1" />
                  Admin Invite
                </button>
                <button
                  onClick={() => setForm((f) => ({ ...f, type: "user" }))}
                  className={`flex-1 rounded-lg border p-3 text-xs font-bold text-center transition-all ${form.type === "user" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  <Users className="h-4 w-4 mx-auto mb-1" />
                  User Invite
                </button>
              </div>

              <div>
                <Label className="text-xs">Label (optional)</Label>
                <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Beta testers, Influencer promo" />
              </div>

              {/* Grants */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-foreground flex items-center gap-1">
                  <Gift className="h-3 w-3" /> Signup Rewards
                </h5>
                {form.type === "admin" && (
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.grant_admin} onCheckedChange={(v) => setForm((f) => ({ ...f, grant_admin: v }))} />
                      <Label className="text-xs">Grant Admin</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={form.grant_pro} onCheckedChange={(v) => setForm((f) => ({ ...f, grant_pro: v }))} />
                      <Label className="text-xs">Grant Pro</Label>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Diamonds</Label>
                    <Input type="number" min={0} value={form.grant_diamonds}
                      onChange={(e) => setForm((f) => ({ ...f, grant_diamonds: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Boosts</Label>
                    <Input type="number" min={0} value={form.grant_boost_credits}
                      onChange={(e) => setForm((f) => ({ ...f, grant_boost_credits: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">ELO Shields</Label>
                    <Input type="number" min={0} value={form.grant_elo_shields}
                      onChange={(e) => setForm((f) => ({ ...f, grant_elo_shields: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Reveals</Label>
                    <Input type="number" min={0} value={form.grant_reveals}
                      onChange={(e) => setForm((f) => ({ ...f, grant_reveals: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Rewinds</Label>
                    <Input type="number" min={0} value={form.grant_rewinds}
                      onChange={(e) => setForm((f) => ({ ...f, grant_rewinds: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
              </div>

              {/* Recommended categories */}
              <div>
                <Label className="text-xs font-bold">Recommended Categories</Label>
                <p className="text-[10px] text-muted-foreground mb-2">These will appear in "Suggested For You" for new users who sign up with this link.</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`text-xs rounded-full px-3 py-1 border transition-all ${form.recommended_categories.includes(cat) ? "border-primary bg-primary/10 text-primary font-bold" : "border-border text-muted-foreground"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Max Uses (empty = unlimited)</Label>
                  <Input type="number" min={1} value={form.max_uses}
                    onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))} placeholder="∞" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Expires In (days, empty = never)</Label>
                  <Input type="number" min={1} value={form.expires_days}
                    onChange={(e) => setForm((f) => ({ ...f, expires_days: e.target.value }))} placeholder="Never" />
                </div>
              </div>

              <Button onClick={createLink} disabled={saving} className="w-full">
                {saving ? "Creating..." : "Create Invite Link"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Existing Links */}
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No invite links yet.</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
            const isMaxed = link.max_uses && link.times_used >= link.max_uses;
            const isExpanded = expandedId === link.id;

            return (
              <div key={link.id} className={`rounded-xl border bg-card overflow-hidden ${!link.is_active || isExpired || isMaxed ? "opacity-60 border-border" : "border-border"}`}>
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${link.type === "admin" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground"}`}>
                      {link.type === "admin" ? <Shield className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">
                        {link.label || link.code}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {link.type === "admin" ? "Admin" : "User"} · {link.times_used}{link.max_uses ? `/${link.max_uses}` : ""} uses
                        {isExpired && " · Expired"}
                        {isMaxed && " · Maxed out"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => copyLink(link.code)} className="h-8 w-8">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setExpandedId(isExpanded ? null : link.id)} className="h-8 w-8">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-3 space-y-2 border-t border-border pt-3">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <span className="text-muted-foreground">Code:</span>
                          <span className="font-mono text-foreground">{link.code}</span>
                          {link.grant_admin && <><span className="text-muted-foreground">Grants Admin:</span><span className="text-primary font-bold">Yes</span></>}
                          {link.grant_pro && <><span className="text-muted-foreground">Grants Pro:</span><span className="text-primary font-bold">Yes</span></>}
                          {link.grant_diamonds > 0 && <><span className="text-muted-foreground">Diamonds:</span><span>{link.grant_diamonds}</span></>}
                          {link.grant_boost_credits > 0 && <><span className="text-muted-foreground">Boosts:</span><span>{link.grant_boost_credits}</span></>}
                          {link.grant_elo_shields > 0 && <><span className="text-muted-foreground">ELO Shields:</span><span>{link.grant_elo_shields}</span></>}
                          {link.grant_reveals > 0 && <><span className="text-muted-foreground">Reveals:</span><span>{link.grant_reveals}</span></>}
                          {link.grant_rewinds > 0 && <><span className="text-muted-foreground">Rewinds:</span><span>{link.grant_rewinds}</span></>}
                          {link.recommended_categories.length > 0 && (
                            <><span className="text-muted-foreground">Categories:</span><span>{link.recommended_categories.join(", ")}</span></>
                          )}
                          {link.expires_at && <><span className="text-muted-foreground">Expires:</span><span>{new Date(link.expires_at).toLocaleDateString()}</span></>}
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
