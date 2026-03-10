import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Link2, Copy, Trash2, Users, Shield, Plus, ChevronDown, ChevronUp, Gift, Clock, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import AdminCustomLinks from "./AdminCustomLinks";

interface InviteLink {
  id: string;
  code: string;
  type: "admin" | "user";
  label: string | null;
  grant_admin: boolean;
  grant_moderator: boolean;
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
  created_by_user_id: string;
}

interface Redemption {
  id: string;
  invite_link_id: string;
  redeemed_by_user_id: string;
  referrer_user_id: string | null;
  created_at: string;
  redeemer_name?: string;
  link_label?: string;
  link_code?: string;
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
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [userSettings, setUserSettings] = useState<UserInviteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    label: "",
    grant_admin: false,
    grant_moderator: false,
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

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    const [{ data: linksData }, { data: settingsData }, { data: redemptionData }] = await Promise.all([
      supabase.from("invite_links").select("*").order("created_at", { ascending: false }),
      supabase.from("user_invite_settings").select("*").limit(1).single(),
      supabase.from("invite_redemptions").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    const allLinks = (linksData as InviteLink[]) || [];
    setLinks(allLinks);
    setUserSettings(settingsData as UserInviteSettings | null);

    // Enrich redemptions with user names and link info
    const rData = (redemptionData || []) as Redemption[];
    if (rData.length > 0) {
      const userIds = [...new Set(rData.map(r => r.redeemed_by_user_id))];
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.display_name]));
      const linkMap = new Map(allLinks.map(l => [l.id, l]));

      setRedemptions(rData.map(r => ({
        ...r,
        redeemer_name: profileMap.get(r.redeemed_by_user_id) || "Unknown",
        link_label: linkMap.get(r.invite_link_id)?.label || undefined,
        link_code: linkMap.get(r.invite_link_id)?.code || undefined,
      })));
    } else {
      setRedemptions([]);
    }
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
      type: "admin",
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
      grant_moderator: form.grant_moderator,
    } as any);

    if (error) {
      toast.error("Failed to create link");
    } else {
      toast.success("Invite link created!");
      setShowCreate(false);
      setForm({
        label: "", grant_admin: false, grant_moderator: false, grant_pro: false,
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
    <div className="space-y-8">
      {/* ─── SECTION 1: Admin Invite Links ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Admin Invite Links
          </h3>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Create Link
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create custom invite links that grant specific rewards, roles, and category recommendations to new users.
        </p>

        {/* Create New Admin Link */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
                <h4 className="text-sm font-bold text-foreground">New Admin Invite Link</h4>

                <div>
                  <Label className="text-xs">Label (optional)</Label>
                  <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Beta testers, Influencer promo" />
                </div>

                {/* Grants */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold text-foreground flex items-center gap-1">
                    <Gift className="h-3 w-3" /> Signup Rewards
                  </h5>
                  <div className="flex gap-4">
                     <div className="flex items-center gap-2">
                       <Switch checked={form.grant_admin} onCheckedChange={(v) => setForm((f) => ({ ...f, grant_admin: v }))} />
                       <Label className="text-xs">Grant Admin</Label>
                     </div>
                     <div className="flex items-center gap-2">
                       <Switch checked={form.grant_moderator} onCheckedChange={(v) => setForm((f) => ({ ...f, grant_moderator: v }))} />
                       <Label className="text-xs">Grant Moderator</Label>
                     </div>
                     <div className="flex items-center gap-2">
                       <Switch checked={form.grant_pro} onCheckedChange={(v) => setForm((f) => ({ ...f, grant_pro: v }))} />
                       <Label className="text-xs">Grant Pro</Label>
                     </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "grant_diamonds", label: "Diamonds" },
                      { key: "grant_boost_credits", label: "Boosts" },
                      { key: "grant_elo_shields", label: "ELO Shields" },
                      { key: "grant_reveals", label: "Reveals" },
                      { key: "grant_rewinds", label: "Rewinds" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-[10px] text-muted-foreground">{label}</Label>
                        <Input type="number" min={0} value={(form as any)[key]}
                          onChange={(e) => setForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <Label className="text-xs font-bold">Recommended Categories</Label>
                  <p className="text-[10px] text-muted-foreground mb-2">These appear in "Suggested For You" for new users.</p>
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
                  {saving ? "Creating..." : "Create Admin Invite Link"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Admin Links */}
        {links.filter((l) => l.type === "admin").length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">No admin invite links yet.</p>
        ) : (
          <div className="space-y-2">
            {links.filter((l) => l.type === "admin").map((link) => (
              <LinkCard key={link.id} link={link} expandedId={expandedId} setExpandedId={setExpandedId} copyLink={copyLink} toggleActive={toggleActive} deleteLink={deleteLink} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Divider ─── */}
      <div className="border-t border-border" />

      {/* ─── SECTION 2: Redemption Log ─── */}
      <div className="space-y-4">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" /> Redemption Log
        </h3>
        <p className="text-xs text-muted-foreground">
          Recent invite link redemptions showing who signed up and which link they used.
        </p>

        {redemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">No redemptions yet.</p>
        ) : (
          <div className="space-y-2">
            {redemptions.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.redeemer_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    via <span className="font-mono text-primary">{r.link_label || r.link_code || "Unknown link"}</span>
                    {r.referrer_user_id && " · User referral"}
                  </p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Divider ─── */}
      <div className="border-t border-border" />

      {/* ─── SECTION 3: User Referral Program Settings ─── */}
      {userSettings && (
        <div className="space-y-4">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" /> User Referral Program
          </h3>
          <p className="text-xs text-muted-foreground">
            Configure what users and their referrals earn when someone signs up via a user's personal referral link.
          </p>

          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold">Referral Program Enabled</Label>
              <Switch
                checked={userSettings.is_enabled}
                onCheckedChange={(v) => setUserSettings({ ...userSettings, is_enabled: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "reward_diamonds", label: "New User Gets (Diamonds)" },
                { key: "reward_boost_credits", label: "New User Gets (Boosts)" },
                { key: "referrer_diamonds", label: "Referrer Gets (Diamonds)" },
                { key: "referrer_boost_credits", label: "Referrer Gets (Boosts)" },
                { key: "reward_elo_bonus", label: "New User ELO Bonus" },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input type="number" min={0} value={(userSettings as any)[key] ?? 0}
                    onChange={(e) => setUserSettings({ ...userSettings, [key]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>

            <Button size="sm" disabled={saving} onClick={saveUserSettings} className="w-full">
              {saving ? "Saving..." : "Save Referral Settings"}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Divider ─── */}
      <div className="border-t border-border" />

      {/* ─── SECTION 4: Custom URL Slugs ─── */}
      <AdminCustomLinks />
    </div>
  );
}

/* ─── Extracted Link Card ─── */
function LinkCard({
  link, expandedId, setExpandedId, copyLink, toggleActive, deleteLink,
}: {
  link: InviteLink;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  copyLink: (code: string) => void;
  toggleActive: (id: string, current: boolean) => void;
  deleteLink: (id: string) => void;
}) {
  const isExpired = link.expires_at && new Date(link.expires_at) < new Date();
  const isMaxed = link.max_uses && link.times_used >= link.max_uses;
  const isExpanded = expandedId === link.id;

  return (
    <div className={`rounded-xl border bg-card overflow-hidden ${!link.is_active || isExpired || isMaxed ? "opacity-60 border-border" : "border-border"}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{link.label || link.code}</p>
            <p className="text-[10px] text-muted-foreground">
              {link.times_used}{link.max_uses ? `/${link.max_uses}` : ""} uses · Created {new Date(link.created_at).toLocaleDateString()}
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
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="px-4 pb-3 space-y-2 border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-muted-foreground">Code:</span>
                <span className="font-mono text-foreground">{link.code}</span>
                <span className="text-muted-foreground">Type:</span>
                <span className="text-foreground capitalize">{link.type}</span>
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
}
