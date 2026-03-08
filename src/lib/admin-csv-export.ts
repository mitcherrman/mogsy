import { supabase } from "@/integrations/supabase/client";

export async function exportAdminCSV() {
  const sections: string[] = [];

  const add = (title: string, headers: string[], rows: string[][]) => {
    sections.push(`\n=== ${title} ===`);
    sections.push(headers.join(","));
    for (const row of rows) sections.push(row.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
  };

  // Users
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, created_at, is_pro, is_bot, is_anonymous, location, custom_theme, swipe_animation, onboarding_completed, last_seen_at, diamonds, boost_credits, elo_shields, reveals, rewinds, age, profile_frame");
  const users = (profiles || []).filter(p => !p.is_bot);
  const bots = (profiles || []).filter(p => p.is_bot);
  add("User Summary", ["Metric", "Value"], [
    ["Total Users", String(users.length)],
    ["Total Bots", String(bots.length)],
    ["Pro Users", String(users.filter(u => u.is_pro).length)],
    ["Anonymous Users", String(users.filter(u => u.is_anonymous).length)],
    ["Onboarding Completed", String(users.filter(u => u.onboarding_completed).length)],
    ["Active (24h)", String(users.filter(u => u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 86400000).length)],
    ["Active (7d)", String(users.filter(u => u.last_seen_at && Date.now() - new Date(u.last_seen_at).getTime() < 7 * 86400000).length)],
  ]);

  // Theme distribution
  const themeCount = new Map<string, number>();
  for (const u of users) { const t = u.custom_theme || "default"; themeCount.set(t, (themeCount.get(t) || 0) + 1); }
  add("Theme Usage", ["Theme", "Users"], Array.from(themeCount.entries()).sort((a, b) => b[1] - a[1]).map(([t, c]) => [t, String(c)]));

  // Animation distribution
  const animCount = new Map<string, number>();
  for (const u of users) { const a = u.swipe_animation || "default"; animCount.set(a, (animCount.get(a) || 0) + 1); }
  add("Animation Usage", ["Animation", "Users"], Array.from(animCount.entries()).sort((a, b) => b[1] - a[1]).map(([a, c]) => [a, String(c)]));

  // Leagues
  const { data: leagues } = await supabase.from("leagues").select("id, name, category, subcategory, type");
  const { data: memberships } = await supabase.from("league_memberships").select("league_id, elo");
  const { data: allMatches } = await supabase.from("matches").select("league_id, winner_item_id, loser_item_id, winner_profile_id, loser_profile_id");
  const { data: allItems } = await supabase.from("preset_items").select("id, name, elo, league_id");
  
  const leagueMembers = new Map<string, number>();
  const leagueAvgElo = new Map<string, { sum: number; count: number }>();
  for (const m of memberships || []) {
    leagueMembers.set(m.league_id, (leagueMembers.get(m.league_id) || 0) + 1);
    const e = leagueAvgElo.get(m.league_id) || { sum: 0, count: 0 };
    e.sum += m.elo; e.count++;
    leagueAvgElo.set(m.league_id, e);
  }
  const leagueMatchCount = new Map<string, number>();
  for (const m of allMatches || []) leagueMatchCount.set(m.league_id, (leagueMatchCount.get(m.league_id) || 0) + 1);

  add("Leagues", ["Name", "Category", "Subcategory", "Type", "Members", "Matches", "Avg Elo"],
    (leagues || []).map(l => [
      l.name, l.category || "", l.subcategory || "", l.type,
      String(leagueMembers.get(l.id) || 0),
      String(leagueMatchCount.get(l.id) || 0),
      String(leagueAvgElo.has(l.id) ? Math.round(leagueAvgElo.get(l.id)!.sum / leagueAvgElo.get(l.id)!.count) : 1200),
    ])
  );

  // Items with win rates
  const itemWins = new Map<string, number>();
  const itemTotal = new Map<string, number>();
  for (const m of allMatches || []) {
    if (m.winner_item_id) { itemWins.set(m.winner_item_id, (itemWins.get(m.winner_item_id) || 0) + 1); itemTotal.set(m.winner_item_id, (itemTotal.get(m.winner_item_id) || 0) + 1); }
    if (m.loser_item_id) { itemTotal.set(m.loser_item_id, (itemTotal.get(m.loser_item_id) || 0) + 1); }
  }
  const leagueNameMap = new Map((leagues || []).map(l => [l.id, l.name]));
  add("Items", ["Name", "League", "Elo", "Matches", "Win Rate %"],
    (allItems || []).map(i => [
      i.name, leagueNameMap.get(i.league_id) || "", String(i.elo),
      String(itemTotal.get(i.id) || 0),
      itemTotal.has(i.id) && (itemTotal.get(i.id)! > 0)
        ? String(Math.round(((itemWins.get(i.id) || 0) / itemTotal.get(i.id)!) * 100))
        : "N/A",
    ])
  );

  // Matches summary
  add("Match Summary", ["Metric", "Value"], [
    ["Total Matches", String((allMatches || []).length)],
    ["Item Matches", String((allMatches || []).filter(m => m.winner_item_id).length)],
    ["User Matches", String((allMatches || []).filter(m => m.winner_profile_id).length)],
  ]);

  // Purchases
  const { data: purchases } = await supabase.from("purchases").select("item_type, amount_cents");
  const purchaseCount = new Map<string, number>();
  for (const p of purchases || []) purchaseCount.set(p.item_type, (purchaseCount.get(p.item_type) || 0) + 1);
  add("Purchases", ["Type", "Count"], Array.from(purchaseCount.entries()).map(([t, c]) => [t, String(c)]));

  // Comments
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

  // Aura check
  const { data: eloGames } = await supabase.from("elo_check_games").select("is_correct");
  const correct = (eloGames || []).filter(g => g.is_correct).length;
  add("Aura Check", ["Metric", "Value"], [
    ["Total Games", String((eloGames || []).length)],
    ["Correct", String(correct)],
    ["Accuracy %", (eloGames || []).length > 0 ? String(Math.round((correct / (eloGames || []).length) * 100)) : "N/A"],
  ]);

  // Elo snapshots summary
  const { data: snapshots } = await supabase.from("global_elo_snapshots").select("id", { count: "exact", head: true });
  add("Elo Snapshots", ["Metric", "Value"], [
    ["Total Snapshots", String(snapshots || 0)],
  ]);

  // Build & download
  const csv = sections.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mogsy-stats-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
