import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isEffectivePro, describeProSource } from "@/lib/pro/entitlement";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, ChevronDown, ChevronRight, User, Crown, Shield, Diamond,
  Trash2, Undo2, Eye, Settings2, Trophy, Send, UserMinus, UserPlus,
  ArrowLeft, StickyNote, AlertTriangle, ImageIcon, ImageOff,
  MapPin, Clock, ShieldCheck, ShieldOff, Link2, Gift, Pencil,
  KeyRound, MailCheck, Ban, UserCheck, Copy, Loader2, Info, Film,
  RefreshCw, RotateCcw, Ghost,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  status_message: string | null;
  /** PT1.4: Stripe-derived entitlement only. Not the effective Pro answer. */
  is_pro: boolean | null;
  pro_grant_kind: string | null;
  pro_grant_expires_at: string | null;
  pro_grant_reason: string | null;
  pro_grant_granted_at: string | null;
  is_bot: boolean | null;
  is_anonymous: boolean | null;
  diamonds: number | null;
  elo_shields: number | null;
  reveals: number | null;
  rewinds: number | null;
  boost_credits: number | null;
  active_boost_until: string | null;
  profile_frame: string | null;
  admin_notes: string | null;
  is_flagged_underage: boolean | null;
  created_at: string;
  last_seen_at: string | null;
  ads_enabled: boolean | null;
}

interface LeagueMembership {
  id: string;
  league_id: string;
  elo: number;
  matches_played: number;
  league_name?: string;
}

interface MatchRecord {
  id: string;
  league_id: string;
  winner_profile_id: string | null;
  loser_profile_id: string | null;
  created_at: string;
  league_name?: string;
}

interface Purchase {
  id: string;
  item_type: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

interface DeletedUser {
  profile: Profile;
  timestamp: number;
}

interface UserReferralData {
  inviteLinks: { id: string; code: string; type: string; label: string | null; times_used: number; created_at: string }[];
  redemptions: { id: string; redeemed_by_user_id: string; redeemer_name: string; link_code: string; created_at: string }[];
  redeemedWith: { code: string; label: string | null; referrer_name: string | null } | null;
}

interface UserFeedback {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
}

export default function AdminUsers({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<string>("signed_up");
  const [sortMode, setSortMode] = useState<string>("newest");
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  // COM1-2 deep link. `?user=<profileId>` preselects one account so another
  // admin surface can hand off to THIS one instead of reimplementing it.
  const [searchParams] = useSearchParams();
  const deepLinkedProfileId = searchParams.get("user");
  const deepLinkConsumed = useRef<string | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "notes" | "account" | "leagues" | "matches" | "purchases" | "comments" | "referrals" | "feedback">("overview");
  const [userComments, setUserComments] = useState<{ id: string; content: string; league_name: string; created_at: string; is_hidden: boolean }[]>([]);

  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [allLeagues, setAllLeagues] = useState<{ id: string; name: string; type: string }[]>([]);

  const [editForm, setEditForm] = useState<Partial<Profile>>({});
  const [originalForm, setOriginalForm] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");

  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({});

  const [noteEntries, setNoteEntries] = useState<{ id: string; text: string; created_at: string; updated_at?: string }[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [referralData, setReferralData] = useState<UserReferralData | null>(null);

  // Account tools state
  const [authInfo, setAuthInfo] = useState<{
    email: string | null;
    email_confirmed: boolean;
    email_confirmed_at: string | null;
    created_at: string;
    last_sign_in_at: string | null;
    is_anonymous: boolean;
    banned_until: string | null;
    provider: string;
  } | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState(false);
  const [detailErrors, setDetailErrors] = useState<string[]>([]);
  const [authError, setAuthError] = useState(false);
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [feedbackError, setFeedbackError] = useState(false);
  const [accountActionsOpen, setAccountActionsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Check if form has changes
  const hasChanges = useMemo(() => {
    if (!originalForm || !editForm) return false;
    return JSON.stringify(editForm) !== JSON.stringify(originalForm);
  }, [editForm, originalForm]);

  // Only show user/compete leagues for the "Add to league" dropdown
  const userLeagues = useMemo(() => allLeagues.filter(l => l.type === "user"), [allLeagues]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setProfilesError(false);
    const [profilesResult, notesResult] = await Promise.all([
      supabase
        .rpc("admin_list_profiles")
        .then((r: any) => ({
          ...r,
          data: (r.data || [])
            .filter((p: any) => p.is_bot === false)
            .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)),
        })),
      supabase.from("profile_admin_notes").select("profile_id, notes"),
    ]);
    const { data, error: profilesQueryError } = profilesResult;
    const { data: notesData, error: notesError } = notesResult;
    if (profilesQueryError) {
      setProfiles([]);
      setProfilesError(true);
      setLoading(false);
      return;
    }
    if (notesError) setProfilesError(true);
    const notesMap = new Map((notesData || []).map((n: any) => [n.profile_id, n.notes]));
    const enriched = ((data as any[]) || []).map(p => ({ ...p, admin_notes: notesMap.get(p.id) || null }));
    setProfiles(enriched as Profile[]);
    setLoading(false);

    if (data && data.length > 0) {
      // Only fetch emails for non-anonymous users
      const nonAnonUsers = data.filter(p => !p.is_anonymous);
      const userIds = nonAnonUsers.map((p) => p.user_id);
      const BATCH_SIZE = 50;
      const allEmails: Record<string, string> = {};
      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);
        const { data: emailData, error: emailError } = await supabase.functions.invoke("admin-get-emails", {
          body: { user_ids: batch },
        });
        if (emailError || emailData?.error) setProfilesError(true);
        if (emailData?.emails) {
          Object.assign(allEmails, emailData.emails);
        }
      }
      setEmailMap(allEmails);
    }

    const { data: rolesData, error: rolesError } = await supabase.from("user_roles").select("user_id, role");
    if (rolesError) setProfilesError(true);
    if (rolesData) {
      const map: Record<string, string[]> = {};
      for (const r of rolesData) {
        if (!map[r.user_id]) map[r.user_id] = [];
        map[r.user_id].push(r.role as string);
      }
      setUserRoles(map);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
    supabase.from("leagues").select("id, name, type").then(({ data }) => setAllLeagues(data || []));
  }, [fetchProfiles]);

  const filtered = useMemo(() => {
    let list = profiles.filter((p) => {
      // When showing anonymous section separately, exclude them from main list
      if (filterMode !== "anonymous" && p.is_anonymous) return false;
      if (filterMode === "anonymous" && !p.is_anonymous) return false;

      const q = search.toLowerCase();
      const email = emailMap[p.user_id] || "";
      return (
        p.display_name.toLowerCase().includes(q) ||
        p.user_id.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        (p.location || "").toLowerCase().includes(q)
      );
    });

    // Apply filter (excluding anonymous which is handled above)
    const roles = userRoles;
    switch (filterMode) {
      case "pro": list = list.filter(p => isEffectivePro(p)); break;
      case "free": list = list.filter(p => !isEffectivePro(p)); break;
      case "signed_up": break; // already filtered above
      case "anonymous": break; // already filtered above
      case "ads_on": list = list.filter(p => (p.ads_enabled ?? true) === true); break;
      case "ads_off": list = list.filter(p => p.ads_enabled === false); break;
      case "admins": list = list.filter(p => (roles[p.user_id] || []).some(r => r === "admin" || r === "master_admin")); break;
      case "moderators": list = list.filter(p => (roles[p.user_id] || []).includes("moderator")); break;
      case "has_avatar": list = list.filter(p => !!p.avatar_url); break;
      case "no_avatar": list = list.filter(p => !p.avatar_url); break;
      case "underage": list = list.filter(p => p.is_flagged_underage); break;
    }

    // Apply sort
    switch (sortMode) {
      case "newest": list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "oldest": list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "last_seen_recent": list.sort((a, b) => new Date(b.last_seen_at || 0).getTime() - new Date(a.last_seen_at || 0).getTime()); break;
      case "last_seen_oldest": list.sort((a, b) => new Date(a.last_seen_at || 0).getTime() - new Date(b.last_seen_at || 0).getTime()); break;
      case "most_diamonds": list.sort((a, b) => (b.diamonds ?? 0) - (a.diamonds ?? 0)); break;
      case "name_az": list.sort((a, b) => a.display_name.localeCompare(b.display_name)); break;
    }

    return list;
  }, [profiles, search, emailMap, filterMode, sortMode, userRoles]);

  const anonymousUsers = useMemo(() => profiles.filter(p => p.is_anonymous), [profiles]);

  const openUserDetail = async (profile: Profile) => {
    setSelectedUser(profile);
    setDetailTab("overview");
    // Parse notes from admin_notes JSON
    try {
      const parsed = JSON.parse(profile.admin_notes || "[]");
      setNoteEntries(Array.isArray(parsed) ? parsed : []);
    } catch {
      // Legacy: convert old plain text note to an entry
      if (profile.admin_notes && profile.admin_notes.trim()) {
        setNoteEntries([{ id: crypto.randomUUID(), text: profile.admin_notes, created_at: profile.created_at }]);
      } else {
        setNoteEntries([]);
      }
    }
    setNewNoteText("");
    const formData = {
      display_name: profile.display_name,
      diamonds: profile.diamonds,
      elo_shields: profile.elo_shields,
      reveals: profile.reveals,
      rewinds: profile.rewinds,
      boost_credits: profile.boost_credits,
      profile_frame: profile.profile_frame,
      active_boost_until: profile.active_boost_until,
      ads_enabled: profile.ads_enabled,
    };
    setEditForm(formData);
    setOriginalForm(formData);
    setReferralData(null);
    setAccountActionsOpen(false);
    setDeleteDialogOpen(false);
    setDetailErrors([]);
    setFeedback([]);
    setFeedbackError(false);
    setAuthInfo(null);
    setAuthError(false);

    const [membRes, matchRes, purchRes, commRes, feedbackRes] = await Promise.all([
      supabase.from("league_memberships").select("*").eq("profile_id", profile.id),
      supabase.from("matches").select("*").or(`winner_profile_id.eq.${profile.id},loser_profile_id.eq.${profile.id}`).order("created_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("comments").select("id, content, league_id, created_at, is_hidden").eq("profile_id", profile.id).order("created_at", { ascending: false }).limit(100),
      supabase
        .rpc("admin_list_feedback", { _show_archived: false })
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const failedSections = [
      membRes.error && "League memberships",
      matchRes.error && "League matches",
      purchRes.error && "Purchases",
      commRes.error && "Comments",
    ].filter(Boolean) as string[];
    setDetailErrors(failedSections);

    setMemberships(membRes.data || []);
    setMatches(matchRes.data || []);
    setPurchases(purchRes.data || []);

    const commData = commRes.data || [];
    if (commData.length > 0) {
      const leagueIds = [...new Set(commData.filter(c => c.league_id).map(c => c.league_id!))];
      const { data: leagues } = leagueIds.length > 0
        ? await supabase.from("leagues").select("id, name").in("id", leagueIds)
        : { data: [] };
      const lMap = new Map((leagues || []).map(l => [l.id, l.name]));
      setUserComments(commData.map(c => ({
        id: c.id,
        content: c.content,
        league_name: c.league_id ? lMap.get(c.league_id) || "Unknown" : "N/A",
        created_at: c.created_at,
        is_hidden: c.is_hidden,
      })));
    } else {
      setUserComments([]);
    }

    if (feedbackRes.error) {
      setFeedbackError(true);
    } else {
      setFeedback((feedbackRes.data || []) as UserFeedback[]);
    }

    // Load referral data
    loadReferralData(profile.user_id);
  };

  /**
   * COM1-2 — the `?user=<profileId>` adapter.
   *
   * The Community drawer's admin Users tab finds an account and then hands it
   * to this page rather than growing its own notes / roles / account-actions
   * implementation. There is exactly one Users interface in the product and
   * this is it; the drawer is a second door, not a second system.
   *
   * Deliberately a ONE-SHOT: `deepLinkConsumed` records the id already opened,
   * so an admin who navigates away from the detail view is not dragged back to
   * it on the next render, and a later re-selection is never overridden. The id
   * is a `profiles.id` — the same public identifier already in every
   * `/user/:profileId` URL — never an auth uid.
   */
  useEffect(() => {
    if (!deepLinkedProfileId) return;
    if (deepLinkConsumed.current === deepLinkedProfileId) return;
    const match = profiles.find((p) => p.id === deepLinkedProfileId);
    if (!match) return;
    deepLinkConsumed.current = deepLinkedProfileId;
    void openUserDetail(match);
    // openUserDetail is a stable-enough closure over setters; re-running this
    // on every render it changes would re-open the detail view continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkedProfileId, profiles]);

  const loadReferralData = async (userId: string) => {
    const [{ data: links }, { data: redemptionsAsReferrer }, { data: redemptionSelf }] = await Promise.all([
      supabase.from("invite_links").select("id, code, type, label, times_used, created_at").eq("created_by_user_id", userId).order("created_at", { ascending: false }),
      supabase.from("invite_redemptions").select("id, redeemed_by_user_id, created_at, invite_link_id").eq("referrer_user_id", userId).order("created_at", { ascending: false }),
      supabase.from("invite_redemptions").select("id, invite_link_id").eq("redeemed_by_user_id", userId).limit(1),
    ]);

    // Get redeemer names
    const redemptions = redemptionsAsReferrer || [];
    let enrichedRedemptions: UserReferralData["redemptions"] = [];
    if (redemptions.length > 0) {
      const redeemerIds = [...new Set(redemptions.map(r => r.redeemed_by_user_id))];
      const { data: redeemerProfiles } = await supabase.from("profiles").select("user_id, display_name").in("user_id", redeemerIds);
      const nameMap = new Map((redeemerProfiles || []).map(p => [p.user_id, p.display_name]));

      const linkIds = [...new Set(redemptions.map(r => r.invite_link_id))];
      const { data: linkData } = await supabase.from("invite_links").select("id, code").in("id", linkIds);
      const codeMap = new Map((linkData || []).map(l => [l.id, l.code]));

      enrichedRedemptions = redemptions.map(r => ({
        id: r.id,
        redeemed_by_user_id: r.redeemed_by_user_id,
        redeemer_name: nameMap.get(r.redeemed_by_user_id) || "Unknown",
        link_code: codeMap.get(r.invite_link_id) || "?",
        created_at: r.created_at,
      }));
    }

    // Check how this user was invited
    let redeemedWith: UserReferralData["redeemedWith"] = null;
    if (redemptionSelf && redemptionSelf.length > 0) {
      const { data: inviteLink } = await supabase.from("invite_links").select("code, label, created_by_user_id").eq("id", redemptionSelf[0].invite_link_id).single();
      if (inviteLink) {
        let referrerName: string | null = null;
        if (inviteLink.created_by_user_id) {
          const { data: refProfile } = await supabase.from("profiles").select("display_name").eq("user_id", inviteLink.created_by_user_id).single();
          referrerName = refProfile?.display_name || null;
        }
        redeemedWith = { code: inviteLink.code, label: inviteLink.label, referrer_name: referrerName };
      }
    }

    setReferralData({
      inviteLinks: (links || []) as any,
      redemptions: enrichedRedemptions,
      redeemedWith,
    });
  };

  const loadAuthInfo = async (userId: string) => {
    setAuthInfo(null);
    setAuthError(false);
    setGeneratedLink(null);
    const { data, error } = await supabase.functions.invoke("admin-user-actions", {
      body: { action: "get_auth_info", target_user_id: userId },
    });
    if (error || data?.error || !data?.auth_info) {
      setAuthError(true);
      return;
    }
    setAuthInfo(data.auth_info);
  };

  const executeAccountAction = async (action: string) => {
    if (!selectedUser) return;
    setAccountActionLoading(action);
    setGeneratedLink(null);
    const { data, error } = await supabase.functions.invoke("admin-user-actions", {
      body: { action, target_user_id: selectedUser.user_id },
    });
    setAccountActionLoading(null);
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Action failed");
      return;
    }
    toast.success(data?.message || "Action completed");
    if (data?.link) setGeneratedLink(data.link);
    // Refresh auth info
    loadAuthInfo(selectedUser.user_id);
  };

  // PT1.4 — grant/revoke a non-Stripe Pro entitlement. Writes only the
  // pro_grant_* columns, through an admin-gated SECURITY DEFINER RPC that
  // records who granted it and when. Stripe state is never touched.
  const [grantKind, setGrantKind] = useState("playtest");
  const [grantDays, setGrantDays] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantSaving, setGrantSaving] = useState(false);

  const setProGrant = async (kind: string | null) => {
    if (!selectedUser) return;
    const days = grantDays.trim() === "" ? null : Number(grantDays);
    if (days !== null && (!Number.isFinite(days) || days <= 0)) {
      toast.error("Expiry must be a positive number of days, or blank for never");
      return;
    }
    setGrantSaving(true);
    const { error } = await (supabase as any).rpc("admin_set_pro_grant", {
      _user_id: selectedUser.user_id,
      _kind: kind,
      _expires_at: days === null ? null : new Date(Date.now() + days * 86400000).toISOString(),
      _reason: kind === null ? null : (grantReason.trim() || null),
    });
    setGrantSaving(false);
    if (error) { toast.error(error.message || "Failed to update Pro grant"); return; }
    toast.success(kind === null ? "Pro grant revoked" : "Pro grant saved");
    setSelectedUser({
      ...selectedUser,
      pro_grant_kind: kind,
      pro_grant_expires_at: kind === null || days === null
        ? null
        : new Date(Date.now() + days * 86400000).toISOString(),
      pro_grant_reason: kind === null ? null : (grantReason.trim() || null),
    });
    fetchProfiles();
  };

  const saveUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: editForm.display_name,
        // PT1.4: is_pro is Stripe-owned and is deliberately NOT writable here.
        // A comped/playtester entitlement is a grant — see setProGrant below.
        diamonds: editForm.diamonds,
        elo_shields: editForm.elo_shields,
        reveals: editForm.reveals,
        rewinds: editForm.rewinds,
        boost_credits: editForm.boost_credits,
        profile_frame: editForm.profile_frame,
        active_boost_until: editForm.active_boost_until,
        ads_enabled: editForm.ads_enabled,
      } as any)
      .eq("id", selectedUser.id);
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("User updated");
    setOriginalForm({ ...editForm });
    fetchProfiles();
    setSelectedUser({ ...selectedUser, ...editForm } as Profile);
  };

  const saveNotesToDb = async (entries: typeof noteEntries) => {
    if (!selectedUser) return;
    setSavingNotes(true);
    const serialized = JSON.stringify(entries);
    const { error } = await supabase
      .from("profile_admin_notes")
      .upsert({ profile_id: selectedUser.id, notes: serialized, updated_at: new Date().toISOString() } as any, { onConflict: "profile_id" });
    setSavingNotes(false);
    if (error) { toast.error("Failed to save notes"); return false; }
    setSelectedUser({ ...selectedUser, admin_notes: serialized } as Profile);
    setProfiles((prev) => prev.map((p) => p.id === selectedUser.id ? { ...p, admin_notes: serialized } : p));
    return true;
  };

  const addNote = async () => {
    if (!newNoteText.trim()) return;
    const entry = { id: crypto.randomUUID(), text: newNoteText.trim(), created_at: new Date().toISOString() };
    const updated = [entry, ...noteEntries];
    const ok = await saveNotesToDb(updated);
    if (ok) { setNoteEntries(updated); setNewNoteText(""); toast.success("Note added"); }
  };

  const updateNote = async (noteId: string, newText: string) => {
    const updated = noteEntries.map(n => n.id === noteId ? { ...n, text: newText, updated_at: new Date().toISOString() } : n);
    const ok = await saveNotesToDb(updated);
    if (ok) { setNoteEntries(updated); setEditingNoteId(null); toast.success("Note updated"); }
  };

  const deleteNote = async (noteId: string) => {
    const updated = noteEntries.filter(n => n.id !== noteId);
    const ok = await saveNotesToDb(updated);
    if (ok) { setNoteEntries(updated); toast.success("Note deleted"); }
  };

  const deleteUser = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
    if (error) { toast.error("Cannot delete: " + error.message); return; }
    setDeletedUsers((prev) => [{ profile, timestamp: Date.now() }, ...prev].slice(0, 20));
    setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    setSelectedUser(null);
    toast.success(`Deleted ${profile.display_name}`, { description: "Use undo to restore" });
  };

  const restoreUser = async (deleted: DeletedUser) => {
    const p = deleted.profile;
    const { error } = await supabase.from("profiles").insert({
      id: p.id,
      user_id: p.user_id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      age: p.age,
      location: p.location,
      status_message: p.status_message,
      // PT1.4: is_pro is deliberately NOT restored. It is Stripe-derived cache,
      // and restoring it here would be an admin-controlled write to Stripe-owned
      // state (delete + restore could manufacture a subscription). The next
      // check-subscription / webhook run repopulates it from Stripe.
      // The manual grant IS restored, or an undeleted playtester comes back Free.
      pro_grant_kind: p.pro_grant_kind,
      pro_grant_expires_at: p.pro_grant_expires_at,
      pro_grant_reason: p.pro_grant_reason,
      pro_grant_granted_at: p.pro_grant_granted_at,
      is_bot: p.is_bot,
      diamonds: p.diamonds,
      elo_shields: p.elo_shields,
      reveals: p.reveals,
      rewinds: p.rewinds,
      boost_credits: p.boost_credits,
      profile_frame: p.profile_frame,
    });
    if (error) { toast.error("Restore failed: " + error.message); return; }
    setDeletedUsers((prev) => prev.filter((d) => d.profile.id !== p.id));
    fetchProfiles();
    toast.success(`Restored ${p.display_name}`);
  };

  const handlePurgeAnonymous = async () => {
    setPurging(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-anonymous-users");
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Purge failed");
      } else {
        toast.success(data?.message || "Anonymous users purged");
        fetchProfiles();
      }
    } catch {
      toast.error("Purge failed");
    }
    setPurging(false);
  };

  const resetFilters = () => {
    setSearch("");
    setFilterMode("signed_up");
    setSortMode("newest");
  };

  const addToLeague = async (leagueId: string) => {
    if (!selectedUser) return;
    const existing = memberships.find((m) => m.league_id === leagueId);
    if (existing) { toast.error("Already in this league"); return; }
    const { error } = await supabase.from("league_memberships").insert({ profile_id: selectedUser.id, league_id: leagueId });
    if (error) { toast.error(error.message); return; }
    toast.success("Added to league");
    const { data } = await supabase.from("league_memberships").select("*").eq("profile_id", selectedUser.id);
    setMemberships(data || []);
  };

  const getLeagueName = (leagueId: string) => allLeagues.find((l) => l.id === leagueId)?.name || "Unknown";

  const sendNotification = () => {
    toast.success(`Notification sent to ${selectedUser?.display_name}: "${notifMessage}"`);
    setNotifOpen(false);
    setNotifMessage("");
  };

  const toggleAdminRole = async (userId: string) => {
    const currentRoles = userRoles[userId] || [];
    const isCurrentlyAdmin = currentRoles.includes("admin");

    if (isCurrentlyAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin" as any);
      if (error) { toast.error("Failed to remove admin role"); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: (prev[userId] || []).filter((r) => r !== "admin"),
      }));
      toast.success("Admin role removed");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" as any });
      if (error) { toast.error("Failed to grant admin role: " + error.message); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: [...(prev[userId] || []), "admin"],
      }));
      toast.success("Admin role granted");
    }
  };

  const toggleModeratorRole = async (userId: string) => {
    const currentRoles = userRoles[userId] || [];
    const isCurrentlyMod = currentRoles.includes("moderator");

    if (isCurrentlyMod) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "moderator" as any);
      if (error) { toast.error("Failed to remove moderator role"); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: (prev[userId] || []).filter((r) => r !== "moderator"),
      }));
      toast.success("Moderator role removed");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "moderator" as any });
      if (error) { toast.error("Failed to grant moderator role: " + error.message); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: [...(prev[userId] || []), "moderator"],
      }));
      toast.success("Moderator role granted");
    }
  };

  const toggleDemoAccess = async (userId: string) => {
    const currentRoles = userRoles[userId] || [];
    const hasDemo = currentRoles.includes("demo_access");

    if (hasDemo) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "demo_access" as any);
      if (error) { toast.error("Failed to remove demo access"); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: (prev[userId] || []).filter((r) => r !== "demo_access"),
      }));
      toast.success("Demo access removed");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "demo_access" as any });
      if (error) { toast.error("Failed to grant demo access: " + error.message); return; }
      setUserRoles((prev) => ({
        ...prev,
        [userId]: [...(prev[userId] || []), "demo_access"],
      }));
      toast.success("Demo access granted");
    }
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : "Never";
  const timeAgo = (d: string | null) => {
    if (!d) return "Never";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (selectedUser) {
    const selectedRoles = userRoles[selectedUser.user_id] || [];
    const isSelectedAdmin = selectedRoles.includes("admin");
    const isSelectedMaster = selectedRoles.includes("master_admin");
    const isSelectedMod = selectedRoles.includes("moderator");
    const isSelectedDemo = selectedRoles.includes("demo_access");

    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
        </Button>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            {selectedUser.avatar_url ? (
              <img src={selectedUser.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate">{selectedUser.display_name || "Unnamed"}</h3>
            <p className="text-xs text-primary truncate">{emailMap[selectedUser.user_id] || "No email"}</p>
            <p className="text-xs text-muted-foreground truncate">{selectedUser.user_id}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Joined {new Date(selectedUser.created_at).toLocaleDateString()}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last seen {timeAgo(selectedUser.last_seen_at)}</span>
            </div>
            {selectedUser.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" /> {selectedUser.location}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedRoles.includes("master_admin") && <Badge className="bg-primary/20 text-primary border-primary/30"><ShieldCheck className="h-3 w-3 mr-1" /> Master</Badge>}
            {isSelectedAdmin && <Badge variant="secondary"><Shield className="h-3 w-3 mr-1" /> Admin</Badge>}
            {isSelectedMod && <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-blue-500/30"><ShieldCheck className="h-3 w-3 mr-1" /> Mod</Badge>}
            {isSelectedDemo && <Badge variant="secondary" className="bg-accent/20 text-accent-foreground border-accent/30"><Film className="h-3 w-3 mr-1" /> Demo</Badge>}
            {isEffectivePro(selectedUser) && <Badge variant="secondary"><Crown className="h-3 w-3 mr-1" /> Pro</Badge>}
            {selectedUser.is_anonymous && <Badge variant="outline" className="text-muted-foreground"><User className="h-3 w-3 mr-1" /> Anonymous</Badge>}
            {selectedUser.is_flagged_underage && <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" /> Underage</Badge>}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1 overflow-x-auto">
          {(["overview", "account", "leagues", "feedback", "notes", "matches", "purchases", "comments", "referrals"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setDetailTab(tab);
                if (tab === "account" && !authInfo) loadAuthInfo(selectedUser.user_id);
              }}
              className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                detailTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {detailTab === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-bold">Identity</h4>
                <p><span className="text-muted-foreground">Display name:</span> {selectedUser.display_name || "Unnamed"}</p>
                <p className="break-all"><span className="text-muted-foreground">Profile UUID:</span> {selectedUser.id}</p>
                <p className="break-all"><span className="text-muted-foreground">Auth UUID:</span> {selectedUser.user_id}</p>
                <p><span className="text-muted-foreground">Email:</span> {emailMap[selectedUser.user_id] || (selectedUser.is_anonymous ? "Anonymous account" : "Unavailable")}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h4 className="font-bold">Account</h4>
                <p><span className="text-muted-foreground">Created:</span> {formatDate(selectedUser.created_at)}</p>
                <p><span className="text-muted-foreground">Last seen:</span> {formatDate(selectedUser.last_seen_at)}</p>
                <p><span className="text-muted-foreground">Type:</span> {selectedUser.is_bot ? "Bot" : selectedUser.is_anonymous ? "Anonymous" : "Standard"}</p>
                <p><span className="text-muted-foreground">Pro:</span> {isEffectivePro(selectedUser) ? "Yes" : "No"} <span className="text-muted-foreground">({describeProSource(selectedUser)})</span></p>
                <p><span className="text-muted-foreground">Roles:</span> {selectedRoles.length ? selectedRoles.join(", ") : "User"}</p>
              </div>
            </div>
            {detailErrors.length > 0 && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Some admin queries failed: {detailErrors.join(", ")}. Try refreshing this user.
              </div>
            )}
          </div>
        )}

        {detailTab === "account" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-sm text-foreground">Account Tools</h4>
            </div>
            <p className="text-xs text-muted-foreground">Manage this user's authentication and account status.</p>

            {/* Auth Info */}
            {authInfo ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h5 className="text-xs font-bold text-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Auth Details</h5>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Email:</span> <span className="text-foreground font-medium">{authInfo.email || "None"}</span></div>
                  <div><span className="text-muted-foreground">Provider:</span> <span className="text-foreground font-medium capitalize">{authInfo.provider}</span></div>
                  <div><span className="text-muted-foreground">Confirmed:</span> <span className={`font-medium ${authInfo.email_confirmed ? "text-green-500" : "text-destructive"}`}>{authInfo.email_confirmed ? "Yes" : "No"}</span></div>
                  <div><span className="text-muted-foreground">Anonymous:</span> <span className="text-foreground font-medium">{authInfo.is_anonymous ? "Yes" : "No"}</span></div>
                  <div><span className="text-muted-foreground">Last Sign In:</span> <span className="text-foreground font-medium">{authInfo.last_sign_in_at ? new Date(authInfo.last_sign_in_at).toLocaleString() : "Never"}</span></div>
                  <div><span className="text-muted-foreground">Banned:</span> <span className={`font-medium ${authInfo.banned_until ? "text-destructive" : "text-foreground"}`}>{authInfo.banned_until ? `Until ${new Date(authInfo.banned_until).toLocaleString()}` : "No"}</span></div>
                </div>
              </div>
            ) : authError ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Auth details could not be loaded. No account action was performed.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading auth info…
              </div>
            )}

            {/* Account-changing controls remain on this page, but are closed by default. */}
            <Collapsible open={accountActionsOpen} onOpenChange={setAccountActionsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between" data-testid="account-actions-trigger">
                  <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Account Actions</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${accountActionsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4" data-testid="account-actions-content">
                <p className="text-xs text-muted-foreground">Changes here affect this profile or its Supabase Auth account. Review the selected user before continuing.</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name</Label>
                    <Input value={editForm.display_name || ""} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Profile Frame</Label>
                    <Select value={editForm.profile_frame || "default"} onValueChange={(v) => setEditForm((f) => ({ ...f, profile_frame: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["default", "gold", "neon", "fire", "diamond"].map((fr) => <SelectItem key={fr} value={fr}>{fr}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {["diamonds", "elo_shields", "reveals", "rewinds", "boost_credits"].map((key) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-[10px] capitalize">{key.replace(/_/g, " ")}</Label>
                      <Input type="number" value={(editForm as any)[key] ?? 0} onChange={(e) => setEditForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-5">
                  <label className="flex items-center gap-2 text-xs"><Switch checked={editForm.ads_enabled ?? true} onCheckedChange={(c) => setEditForm((f) => ({ ...f, ads_enabled: c }))} /> Ads Enabled</label>
                  <Button onClick={saveUser} disabled={saving || !hasChanges} size="sm">{saving ? "Saving…" : "Save Profile Changes"}</Button>
                </div>

                {/* PT1.4 — manual / playtester Pro grant. Independent of Stripe:
                    granting here never touches a subscription, and Stripe sync
                    never revokes what is granted here. */}
                <div className="space-y-2 border-t border-border pt-3">
                  <h5 className="text-xs font-bold">Pro entitlement</h5>
                  <p className="text-[11px] text-muted-foreground">
                    Stripe subscription: <strong>{selectedUser.is_pro ? "active" : "none"}</strong> (managed by Stripe, not editable here).
                    {" "}Effective Pro: <strong>{isEffectivePro(selectedUser) ? "yes" : "no"}</strong> — {describeProSource(selectedUser)}.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px]">Grant kind</Label>
                      <Select value={grantKind} onValueChange={setGrantKind}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>{["playtest", "manual", "promo"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Expires in (days, blank = never)</Label>
                      <Input className="w-44" value={grantDays} placeholder="e.g. 90" onChange={(e) => setGrantDays(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Reason</Label>
                      <Input className="w-56" value={grantReason} placeholder="Founding playtester" onChange={(e) => setGrantReason(e.target.value)} />
                    </div>
                    <Button size="sm" disabled={grantSaving} onClick={() => setProGrant(grantKind)}>
                      {grantSaving ? "Saving…" : selectedUser.pro_grant_kind ? "Update grant" : "Grant Pro"}
                    </Button>
                    {selectedUser.pro_grant_kind && (
                      <Button size="sm" variant="destructive" disabled={grantSaving} onClick={() => setProGrant(null)}>
                        Revoke grant
                      </Button>
                    )}
                  </div>
                </div>

                {isMasterAdmin && !isSelectedMaster && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <h5 className="text-xs font-bold">Role and access changes</h5>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant={isSelectedAdmin ? "destructive" : "outline"} onClick={() => toggleAdminRole(selectedUser.user_id)}>{isSelectedAdmin ? "Remove Admin" : "Grant Admin"}</Button>
                      <Button size="sm" variant={isSelectedMod ? "destructive" : "outline"} onClick={() => toggleModeratorRole(selectedUser.user_id)}>{isSelectedMod ? "Remove Moderator" : "Grant Moderator"}</Button>
                      <Button size="sm" variant={isSelectedDemo ? "destructive" : "outline"} onClick={() => toggleDemoAccess(selectedUser.user_id)}>{isSelectedDemo ? "Remove Demo Access" : "Grant Demo Access"}</Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 border-t border-border pt-3">
                  <h5 className="text-xs font-bold text-foreground">Auth and communication actions</h5>

              {/* Password Reset */}
              <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Generate Password Recovery Link</p>
                  <p className="text-xs text-muted-foreground">Creates a sensitive recovery link. It is not emailed automatically.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!accountActionLoading || authInfo?.is_anonymous === true}
                  onClick={() => executeAccountAction("send_password_reset")}
                >
                  {accountActionLoading === "send_password_reset" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <KeyRound className="h-3 w-3 mr-1" />}
                  Generate Link
                </Button>
              </div>

              {/* Resend Verification */}
              {authInfo && !authInfo.email_confirmed && !authInfo.is_anonymous && (
                <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Generate Email Verification Link</p>
                    <p className="text-xs text-muted-foreground">Creates a sensitive verification link. It is not emailed automatically.</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!accountActionLoading}
                    onClick={() => executeAccountAction("resend_verification")}
                  >
                    {accountActionLoading === "resend_verification" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <MailCheck className="h-3 w-3 mr-1" />}
                    Generate Link
                  </Button>
                </div>
              )}

              {/* Confirm Email Manually */}
              {authInfo && !authInfo.email_confirmed && !authInfo.is_anonymous && (
                <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Confirm Email Manually</p>
                    <p className="text-xs text-muted-foreground">Mark this user's email as verified without sending an email</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!accountActionLoading}
                    onClick={() => executeAccountAction("confirm_email")}
                  >
                    {accountActionLoading === "confirm_email" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserCheck className="h-3 w-3 mr-1" />}
                    Confirm
                  </Button>
                </div>
              )}

              {/* Ban / Unban */}
              <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{authInfo?.banned_until ? "Unban User" : "Ban User"}</p>
                  <p className="text-xs text-muted-foreground">
                    {authInfo?.banned_until ? "Restore this user's access to sign in" : "Prevent this user from signing in"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={authInfo?.banned_until ? "outline" : "destructive"}
                  disabled={!!accountActionLoading}
                  onClick={() => executeAccountAction(authInfo?.banned_until ? "unban_user" : "ban_user")}
                >
                  {(accountActionLoading === "ban_user" || accountActionLoading === "unban_user") ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Ban className="h-3 w-3 mr-1" />
                  )}
                  {authInfo?.banned_until ? "Unban" : "Ban"}
                </Button>
              </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-destructive/30 pt-3">
                  <Button variant="outline" size="sm" onClick={() => setNotifOpen(true)}><Send className="h-3 w-3 mr-1" /> Send Notification</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="h-3 w-3 mr-1" /> Delete User Profile…</Button>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Generated Link Display */}
            {generatedLink && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-bold text-foreground">Sensitive generated link</p>
                <p className="text-xs text-muted-foreground">This link grants an account recovery or verification flow. Share it only with the intended user.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[10px] bg-secondary rounded p-2 text-foreground break-all select-all">{generatedLink}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink);
                      toast.success("Link copied to clipboard");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {detailTab === "notes" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <h4 className="font-bold text-sm text-foreground">Admin Notes</h4>
              <Badge variant="outline" className="text-[10px]">{noteEntries.length}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Private notes about this user. Only visible to admins.</p>

            {/* Add new note */}
            <div className="space-y-2">
              <Textarea
                placeholder="Add a note about this user (e.g. warnings, VIP status, behavior issues)…"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
              />
              <Button onClick={addNote} disabled={savingNotes || !newNoteText.trim()} size="sm">
                {savingNotes ? "Saving…" : "Add Note"}
              </Button>
            </div>

            {/* Notes thread */}
            {noteEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {noteEntries.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                    {editingNoteId === note.id ? (
                      <>
                        <Textarea
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => updateNote(note.id, editingNoteText)} disabled={savingNotes || !editingNoteText.trim()}>
                            {savingNotes ? "Saving…" : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">{note.text}</p>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                          <span>{new Date(note.created_at).toLocaleString()}</span>
                          {note.updated_at && <span className="italic">edited {new Date(note.updated_at).toLocaleString()}</span>}
                          <div className="ml-auto flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.text); }}
                            >
                              <Pencil className="h-3 w-3 mr-1" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                              onClick={() => deleteNote(note.id)}
                            >
                              <Trash2 className="h-3 w-3 mr-1" /> Delete
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {detailTab === "leagues" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select onValueChange={addToLeague}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Add to compete league…" /></SelectTrigger>
                <SelectContent>
                  {userLeagues.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not in any leagues.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Elo</TableHead>
                    <TableHead>Matches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberships.map((m) => {
                    const league = allLeagues.find(l => l.id === m.league_id);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-foreground">{league?.name || "Unknown"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{league?.type || "?"}</Badge></TableCell>
                        <TableCell>{m.elo}</TableCell>
                        <TableCell>{m.matches_played}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {detailTab === "matches" && (
          <div>
            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Opponent</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => {
                    const won = m.winner_profile_id === selectedUser.id;
                    const opponentId = won ? m.loser_profile_id : m.winner_profile_id;
                    const opponent = profiles.find((p) => p.id === opponentId);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-foreground">{getLeagueName(m.league_id)}</TableCell>
                        <TableCell>
                          <Badge variant={won ? "default" : "secondary"}>
                            {won ? "Won" : "Lost"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {opponent?.display_name || (opponentId ? "Unknown" : "—")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDate(m.created_at)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {detailTab === "purchases" && (
          <div>
            {purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground capitalize">{p.item_type.replace(/_/g, " ")}</TableCell>
                      <TableCell>${(p.amount_cents / 100).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{formatDate(p.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {detailTab === "comments" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{userComments.length} comments by this user</p>
            {userComments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No comments</p>
            ) : (
              <div className="space-y-2">
                {userComments.map((c) => (
                  <div key={c.id} className={`rounded-lg border border-border bg-card p-3 ${c.is_hidden ? "opacity-50" : ""}`}>
                    <p className="text-sm text-foreground break-words">{c.content}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>{c.league_name}</span>
                      <span>{formatDate(c.created_at)}</span>
                      {c.is_hidden && <Badge variant="outline" className="text-[9px]">Hidden</Badge>}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-6 text-destructive hover:text-destructive text-xs"
                        onClick={async () => {
                          await supabase.from("comments").delete().eq("id", c.id);
                          setUserComments((prev) => prev.filter((x) => x.id !== c.id));
                          toast.success("Comment deleted");
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {detailTab === "referrals" && (
          <div className="space-y-4">
            {!referralData ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                {/* How this user joined */}
                {referralData.redeemedWith && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1">
                    <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Gift className="h-3.5 w-3.5 text-primary" /> Joined via Invite Link
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Code: <span className="font-mono text-primary">{referralData.redeemedWith.code}</span>
                      {referralData.redeemedWith.label && ` (${referralData.redeemedWith.label})`}
                    </p>
                    {referralData.redeemedWith.referrer_name && (
                      <p className="text-xs text-muted-foreground">Referred by: <span className="text-foreground font-medium">{referralData.redeemedWith.referrer_name}</span></p>
                    )}
                  </div>
                )}

                {/* User's own invite links */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-primary" /> Their Invite Links
                  </h4>
                  {referralData.inviteLinks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No invite links created.</p>
                  ) : (
                    <div className="space-y-1">
                      {referralData.inviteLinks.map(link => (
                        <div key={link.id} className="rounded-lg border border-border bg-card px-3 py-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium text-foreground">{link.label || link.code}</p>
                            <p className="text-[10px] text-muted-foreground">
                              <span className="font-mono">{link.code}</span> · {link.type} · {link.times_used} uses · {new Date(link.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Who they referred */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-primary" /> Users They Referred ({referralData.redemptions.length})
                  </h4>
                  {referralData.redemptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No referrals yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {referralData.redemptions.map(r => (
                        <div key={r.id} className="rounded-lg border border-border bg-card px-3 py-2 flex items-center gap-3">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground">{r.redeemer_name}</p>
                            <p className="text-[10px] text-muted-foreground">via <span className="font-mono">{r.link_code}</span></p>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {detailTab === "feedback" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm">Feedback</h4>
              {!feedbackError && <Badge variant="outline">{feedback.length} recent</Badge>}
            </div>
            {feedbackError ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                Feedback could not be loaded. This is an admin query failure, not an empty feedback history.
              </div>
            ) : feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No feedback from this user.</p>
            ) : (
              <div className="space-y-2" data-testid="user-feedback-list">
                {feedback.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <Badge variant="outline" className="capitalize">{item.status}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{item.category} · {formatDate(item.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Notification</DialogTitle>
              <DialogDescription>Send a message to {selectedUser.display_name}</DialogDescription>
            </DialogHeader>
            <Textarea placeholder="Type your message…" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} rows={3} />
            <Button onClick={sendNotification} disabled={!notifMessage.trim()}>
              <Send className="h-4 w-4 mr-1" /> Send
            </Button>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this user profile?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the public profile row for {selectedUser.display_name}. The existing code does not delete the Supabase Auth user. Related profile data may also be removed by database cascades, and the built-in restore only recreates a profile snapshot.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteUser(selectedUser)}
              >
                Delete User Profile
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users by name, email, or ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button
          variant="outline"
          size="icon" aria-label="Refresh"
          className="shrink-0 h-9 w-9"
          disabled={loading}
          onClick={() => fetchProfiles()}
          title="Refresh users"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <Badge variant="outline">{filtered.length} users</Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={filterMode} onValueChange={setFilterMode}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Filter…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="signed_up">Signed Up</SelectItem>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="pro">Pro Only</SelectItem>
            <SelectItem value="free">Free Only</SelectItem>
            <SelectItem value="ads_on">Ads On</SelectItem>
            <SelectItem value="ads_off">Ads Off</SelectItem>
            <SelectItem value="admins">Admins</SelectItem>
            <SelectItem value="moderators">Moderators</SelectItem>
            <SelectItem value="has_avatar">Has Avatar</SelectItem>
            <SelectItem value="no_avatar">No Avatar</SelectItem>
            <SelectItem value="underage">Flagged Underage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortMode} onValueChange={setSortMode}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Sort…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="last_seen_recent">Recently Active</SelectItem>
            <SelectItem value="last_seen_oldest">Least Recently Active</SelectItem>
            <SelectItem value="most_diamonds">Most Diamonds</SelectItem>
            <SelectItem value="name_az">Name A-Z</SelectItem>
          </SelectContent>
        </Select>
        {(filterMode !== "signed_up" || sortMode !== "newest" || search) && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs gap-1 text-muted-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        )}
      </div>

      {!loading && profilesError && profiles.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
          Users loaded, but some admin metadata could not be retrieved. Email, role, or notes information may be incomplete.
        </div>
      )}

      {deletedUsers.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-destructive font-medium">
            <Undo2 className="h-4 w-4" /> {deletedUsers.length} recently deleted — click to restore
            <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {deletedUsers.map((d) => (
              <div key={d.profile.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground">{d.profile.display_name}</span>
                <Button variant="outline" size="sm" onClick={() => restoreUser(d)}>
                  <Undo2 className="h-3 w-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : profilesError && profiles.length === 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center text-sm text-destructive">
          The admin users query failed. No users are shown because data could not be loaded.
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No users found</p>
      ) : (
        <div className="space-y-1">
          {filtered.map((p) => {
            const roles = userRoles[p.user_id] || [];
            return (
              <button
                key={p.id}
                onClick={() => openUserDetail(p)}
                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm truncate">{p.display_name || "Unnamed"}</p>
                    {p.admin_notes && <StickyNote className="h-3 w-3 text-primary shrink-0" />}
                    {roles.includes("master_admin") && <ShieldCheck className="h-3 w-3 text-primary shrink-0" />}
                    {roles.includes("admin") && <Shield className="h-3 w-3 text-primary shrink-0" />}
                    {roles.includes("moderator") && <ShieldCheck className="h-3 w-3 text-muted-foreground shrink-0" />}
                    {p.avatar_url ? (
                      <ImageIcon className="h-3 w-3 text-primary shrink-0" />
                    ) : (
                      <ImageOff className="h-3 w-3 text-destructive shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-primary truncate">{emailMap[p.user_id] || ""}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{p.location}</span>}
                    <span>Joined {new Date(p.created_at).toLocaleDateString()}</span>
                    <span>· Last seen {timeAgo(p.last_seen_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isEffectivePro(p) && <Crown className="h-4 w-4 text-primary" />}
                  <Diamond className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{p.diamonds ?? 0}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Separate Anonymous Users Section ─── */}
      {filterMode !== "anonymous" && anonymousUsers.length > 0 && (
        <div className="border-t border-border pt-4">
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
              <Ghost className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Anonymous Users</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">{anonymousUsers.length}</Badge>
              <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {isMasterAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" disabled={purging}>
                      {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Purge All Anonymous ({anonymousUsers.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Purge all anonymous users?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {anonymousUsers.length} anonymous accounts and their auth data. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handlePurgeAnonymous} className="bg-destructive text-destructive-foreground">
                        Purge All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <div className="space-y-1">
                {anonymousUsers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openUserDetail(p)}
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Ghost className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{p.display_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Joined {new Date(p.created_at).toLocaleDateString()}</span>
                        <span>· Last seen {timeAgo(p.last_seen_at)}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
