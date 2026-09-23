// ---------------------------------------------------------------------------
// Admin CSV export (Operations › Data Maintenance).
//
// An operator-triggered dump of the account-side tables Supabase owns. It is
// NOT product analytics: visitors, sessions, funnel and gameplay live in Admin
// › Analytics, computed from analytics_events / analytics_sessions /
// analytics_visitors and the Railway-authoritative rows.
//
// LEGACY1 removed every section that summarised the retired voting product —
// leagues and league memberships, preset items and their win rates, matches,
// Aura Check games, global Elo snapshots, swipe-animation usage, and the
// per-profile currency columns (diamonds, boosts, ELO shields, reveals,
// rewinds). Those tables still exist; this export simply no longer presents
// them as current product state.
// ---------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { isEffectivePro } from "@/lib/pro/entitlement";

export async function exportAdminCSV() {
  const sections: string[] = [];

  const add = (title: string, headers: string[], rows: string[][]) => {
    sections.push(`\n=== ${title} ===`);
    sections.push(headers.join(","));
    for (const row of rows) sections.push(row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
  };

  // Users
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, created_at, is_pro, pro_grant_kind, pro_grant_expires_at, is_bot, is_anonymous, custom_theme, onboarding_completed, last_seen_at, profile_frame");
  const users = (profiles || []).filter(p => !p.is_bot);
  const bots = (profiles || []).filter(p => p.is_bot);
  add("User Summary", ["Metric", "Value"], [
    ["Total Users", String(users.length)],
    ["Total Bots", String(bots.length)],
    ["Premium Users", String(users.filter(u => isEffectivePro(u)).length)],  // PT1.4: Stripe OR valid grant
    ["Anonymous Users", String(users.filter(u => u.is_anonymous).length)],
    ["Onboarding Completed", String(users.filter(u => u.onboarding_completed).length)],
    ["Active (24h)", String(users.filter(u => u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 86400000).length)],
    ["Active (7d)", String(users.filter(u => u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 7 * 86400000).length)],
  ]);

  // Profile theme distribution
  const themeCount = new Map<string, number>();
  for (const u of users) { const t = u.custom_theme || "default"; themeCount.set(t, (themeCount.get(t) || 0) + 1); }
  add("Theme Usage", ["Theme", "Users"], Array.from(themeCount.entries()).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, String(c)]));

  // Profile frame distribution
  const frameCount = new Map<string, number>();
  for (const u of users) { const f = u.profile_frame || "default"; frameCount.set(f, (frameCount.get(f) || 0) + 1); }
  add("Profile Frames", ["Frame", "Users"], Array.from(frameCount.entries()).sort((a, b) => b[1] - a[1]).map(([f, c]) => [f, String(c)]));

  // Purchases
  const { data: purchases } = await supabase.from("purchases").select("item_type, amount_cents");
  const purchaseCount = new Map<string, number>();
  for (const p of purchases || []) purchaseCount.set(p.item_type, (purchaseCount.get(p.item_type) || 0) + 1);
  add("Purchases", ["Type", "Count"], Array.from(purchaseCount.entries()).map(([t, c]) => [t, String(c)]));

  // Comments (blog post discussion) and reactions
  const { data: comments } = await supabase.from("comments").select("id", { count: "exact", head: true });
  const { data: reactions } = await supabase.from("comment_reactions").select("id", { count: "exact", head: true });
  add("Comments & Reactions", ["Metric", "Value"], [
    ["Total Comments", String(comments || 0)],
    ["Total Reactions", String(reactions || 0)],
  ]);

  // Invite stats
  const { data: invLinks } = await supabase.from("invite_links").select("id", { count: "exact", head: true });
  const { data: invRedeems } = await supabase.from("invite_redemptions").select("id", { count: "exact", head: true });
  add("Invites", ["Metric", "Value"], [
    ["Total Invite Links", String(invLinks || 0)],
    ["Total Redemptions", String(invRedeems || 0)],
  ]);

  // Build & download
  const csv = sections.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mogzy-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
