// ---------------------------------------------------------------------------
// Admin · Bots — League bot-persona management.
//
// Replaces the legacy Mogsy dating-bot form. A bot persona is now exactly what
// a League surface needs: a display name, an avatar, a profile frame, and an
// enabled/disabled state. Age, location, dating status message, social links
// and dating preferences are gone from the form; the underlying columns are
// untouched and are simply never written.
//
// Every mutation goes through a SECURITY DEFINER RPC that re-checks
// is_master_admin server-side and writes an audit row. Nothing here inserts
// into `profiles` directly, which is why the form cannot fabricate an
// authenticated identity: `admin_create_bot_profile` generates the placeholder
// `profiles.user_id` internally, creates no auth.users row, mints no token, and
// never returns that value.
//
// Removal is SOFT-DISABLE. There is no delete control and no "delete all bots"
// button: disabling preserves the profile, its friendships, its audit history
// and every historical reference, and it is reversible. A confirmed destructive
// purge may be added later as a separate, explicitly-confirmed workflow.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Power, PowerOff, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import UserAvatar from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { notifyFriendsChanged } from "@/lib/community/friends-refresh";
import {
  LINK_FRIENDSHIP_MESSAGES,
  adminCreateBotProfile,
  adminUpdateBotProfile,
} from "@/lib/admin/admin-users";

interface BotProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  profile_frame: string | null;
  is_disabled: boolean;
  created_at: string | null;
}

const EMPTY_FORM = { display_name: "", avatar_url: "", profile_frame: "" };

export default function AdminBots() {
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  // Auto-friend is opt-in and starts OFF on every render and after every reset.
  const [addToFriends, setAddToFriends] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, profile_frame, is_disabled, created_at")
      .eq("is_bot", true)
      .order("created_at", { ascending: false });
    setBots(
      ((data ?? []) as BotProfile[]).map((b) => ({ ...b, is_disabled: b.is_disabled === true })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    const name = form.display_name.trim();
    if (!name) return;
    setCreating(true);
    const result = await adminCreateBotProfile({
      displayName: name,
      avatarUrl: form.avatar_url.trim() || null,
      profileFrame: form.profile_frame.trim() || null,
      addToMyFriends: addToFriends,
    });
    setCreating(false);

    if (!result.ok) {
      toast.error(
        result.code === "invalid_display_name"
          ? "A display name of 1–60 characters is required."
          : "Couldn't create the bot.",
      );
      return;
    }

    // Report the friendship outcome separately — a created bot whose auto-friend
    // step reported "blocked" must not read as a clean success.
    if (result.friendship) {
      if (result.friendship.ok && result.friendship.code === "created") {
        notifyFriendsChanged();
        toast.success(`${name} created and added to your friends.`);
      } else {
        toast.warning(
          `${name} created. Friend link: ${LINK_FRIENDSHIP_MESSAGES[result.friendship.code]}`,
        );
      }
    } else {
      toast.success(`${name} created.`);
    }

    setForm(EMPTY_FORM);
    setAddToFriends(false);
    void load();
  };

  const startEdit = (bot: BotProfile) => {
    setEditingId(bot.id);
    setEditForm({
      display_name: bot.display_name ?? "",
      avatar_url: bot.avatar_url ?? "",
      profile_frame: bot.profile_frame ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editForm.display_name.trim();
    if (!name) return;
    setSavingEdit(true);
    const result = await adminUpdateBotProfile({
      profileId: editingId,
      displayName: name,
      avatarUrl: editForm.avatar_url.trim() || null,
      profileFrame: editForm.profile_frame.trim() || null,
    });
    setSavingEdit(false);
    if (!result.ok) {
      toast.error(
        result.code === "not_a_bot"
          ? "That profile is not a bot."
          : result.code === "invalid_display_name"
            ? "A display name of 1–60 characters is required."
            : "Couldn't save the bot.",
      );
      return;
    }
    toast.success("Bot updated.");
    setEditingId(null);
    void load();
  };

  const toggleDisabled = async (bot: BotProfile) => {
    setTogglingId(bot.id);
    const result = await adminUpdateBotProfile({
      profileId: bot.id,
      isDisabled: !bot.is_disabled,
    });
    setTogglingId(null);
    if (!result.ok) {
      toast.error("Couldn't change the bot state.");
      return;
    }
    toast.success(bot.is_disabled ? "Bot re-enabled." : "Bot disabled.");
    void load();
  };

  return (
    <div className="space-y-6">
      {/* --- Create ------------------------------------------------------- */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-bold text-foreground">
          <UserPlus className="h-4 w-4" aria-hidden /> Create bot persona
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="bot-display-name">
              Display name
            </Label>
            <Input
              id="bot-display-name"
              value={form.display_name}
              maxLength={60}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Bot name"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="bot-avatar-url">
              Avatar URL
            </Label>
            <Input
              id="bot-avatar-url"
              value={form.avatar_url}
              onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs" htmlFor="bot-profile-frame">
              Profile frame
            </Label>
            <Input
              id="bot-profile-frame"
              value={form.profile_frame}
              onChange={(e) => setForm({ ...form, profile_frame: e.target.value })}
              placeholder="Frame identifier (optional)"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            data-testid="bot-add-to-friends"
            checked={addToFriends}
            onChange={(e) => setAddToFriends(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Add to my friends after creation
        </label>

        <Button onClick={() => void handleCreate()} disabled={creating} className="gap-1.5">
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="h-4 w-4" aria-hidden />
          )}
          Create
        </Button>
      </div>

      {/* --- List --------------------------------------------------------- */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Bot personas ({bots.length})
        </h3>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : (
          <div className="space-y-2">
            {bots.map((bot) =>
              editingId === bot.id ? (
                <div
                  key={bot.id}
                  data-testid={`bot-edit-${bot.id}`}
                  className="space-y-3 rounded-xl border border-primary/40 bg-card p-3"
                >
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label="Display name"
                      value={editForm.display_name}
                      maxLength={60}
                      onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                    />
                    <Input
                      aria-label="Avatar URL"
                      value={editForm.avatar_url}
                      onChange={(e) => setEditForm({ ...editForm, avatar_url: e.target.value })}
                    />
                    <Input
                      aria-label="Profile frame"
                      className="sm:col-span-2"
                      value={editForm.profile_frame}
                      onChange={(e) => setEditForm({ ...editForm, profile_frame: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={savingEdit} onClick={() => void saveEdit()}>
                      {savingEdit ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" aria-hidden /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={bot.id}
                  data-testid={`bot-row-${bot.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <UserAvatar
                    src={bot.avatar_url}
                    name={bot.display_name ?? "Bot"}
                    size="md"
                    className={bot.is_disabled ? "opacity-50" : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-foreground">
                        {bot.display_name || "Unnamed"}
                      </p>
                      {/* Admin surface: real state, always, regardless of the
                          show_bot_labels platform policy. */}
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                        Bot
                      </span>
                      <span
                        data-testid={`bot-state-${bot.id}`}
                        className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                          bot.is_disabled
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {bot.is_disabled ? "Disabled" : "Enabled"}
                      </span>
                    </div>
                    <p className="truncate font-mono text-[10px] text-muted-foreground/70">
                      {bot.id}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Edit"
                    onClick={() => startEdit(bot)}
                    data-testid={`bot-edit-open-${bot.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={togglingId === bot.id}
                    onClick={() => void toggleDisabled(bot)}
                    data-testid={`bot-toggle-${bot.id}`}
                  >
                    {togglingId === bot.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : bot.is_disabled ? (
                      <Power className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <PowerOff className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {bot.is_disabled ? "Re-enable" : "Disable"}
                  </Button>
                </div>
              ),
            )}
            {bots.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No bot personas yet.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Disabling retires a bot without deleting anything — its profile, friendships and
        history are preserved and it can be re-enabled at any time. A disabled bot is
        withheld from ordinary user-facing surfaces and cannot be newly added to friends.
      </p>
    </div>
  );
}
