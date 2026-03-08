import { supabase } from "@/integrations/supabase/client";

export interface DataSourceResult {
  labels: string[];
  datasets: { label: string; values: number[] }[];
}

export interface DataSourceDef {
  id: string;
  name: string;
  category: string;
  description: string;
  fetch: (options?: { days?: number; leagueId?: string }) => Promise<DataSourceResult>;
}

// Helper: bucket dates into day strings
function bucketByDay(dates: string[], days: number): { labels: string[]; counts: number[] } {
  const now = new Date();
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map.set(d.toISOString().slice(0, 10), 0);
  }
  for (const d of dates) {
    const key = d.slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
  }
  return { labels: Array.from(map.keys()), counts: Array.from(map.values()) };
}

function countField(rows: any[], field: string): { labels: string[]; counts: number[] } {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = (r[field] || "none") as string;
    map.set(v, (map.get(v) || 0) + 1);
  }
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  return { labels: sorted.map(s => s[0]), counts: sorted.map(s => s[1]) };
}

// ── DATA SOURCES ──────────────────────────────────────────

const sources: DataSourceDef[] = [
  // ─── USERS ───
  {
    id: "user_signups",
    name: "User Signups Over Time",
    category: "Users",
    description: "New user registrations per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("profiles").select("created_at").gte("created_at", since).eq("is_bot", false);
      const b = bucketByDay((data || []).map(r => r.created_at), days);
      return { labels: b.labels, datasets: [{ label: "Signups", values: b.counts }] };
    },
  },
  {
    id: "active_users",
    name: "Active Users (24h / 7d / 30d)",
    category: "Users",
    description: "Users active in last 24h, 7d, 30d",
    fetch: async () => {
      const now = Date.now();
      const { data } = await supabase.from("profiles").select("last_seen_at").eq("is_bot", false);
      const rows = data || [];
      const c24 = rows.filter(r => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 86400000).length;
      const c7 = rows.filter(r => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 7 * 86400000).length;
      const c30 = rows.filter(r => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() < 30 * 86400000).length;
      return { labels: ["24h", "7d", "30d"], datasets: [{ label: "Active Users", values: [c24, c7, c30] }] };
    },
  },
  {
    id: "pro_vs_free",
    name: "Pro vs Free Users",
    category: "Users",
    description: "Distribution of pro and free users",
    fetch: async () => {
      const { data } = await supabase.from("profiles").select("is_pro").eq("is_bot", false);
      const rows = data || [];
      const pro = rows.filter(r => r.is_pro).length;
      return { labels: ["Pro", "Free"], datasets: [{ label: "Users", values: [pro, rows.length - pro] }] };
    },
  },
  {
    id: "users_by_location",
    name: "Users by Location",
    category: "Users",
    description: "Top user locations",
    fetch: async () => {
      const { data } = await supabase.from("profiles").select("location").eq("is_bot", false);
      const b = countField(data || [], "location");
      return { labels: b.labels.slice(0, 20), datasets: [{ label: "Users", values: b.counts.slice(0, 20) }] };
    },
  },
  {
    id: "onboarding_completion",
    name: "Onboarding Completion",
    category: "Users",
    description: "Completed vs incomplete onboarding",
    fetch: async () => {
      const { data } = await supabase.from("profiles").select("onboarding_completed").eq("is_bot", false);
      const rows = data || [];
      const done = rows.filter(r => r.onboarding_completed).length;
      return { labels: ["Completed", "Incomplete"], datasets: [{ label: "Users", values: [done, rows.length - done] }] };
    },
  },

  // ─── MATCHES ───
  {
    id: "matches_per_day",
    name: "Matches Per Day",
    category: "Matches",
    description: "Total matches recorded per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("matches").select("created_at").gte("created_at", since);
      const b = bucketByDay((data || []).map(r => r.created_at), days);
      return { labels: b.labels, datasets: [{ label: "Matches", values: b.counts }] };
    },
  },
  {
    id: "matches_per_league",
    name: "Matches Per League",
    category: "Matches",
    description: "Match count grouped by league",
    fetch: async () => {
      const { data: leagues } = await supabase.from("leagues").select("id, name");
      const { data: matches } = await supabase.from("matches").select("league_id");
      const leagueMap = new Map((leagues || []).map(l => [l.id, l.name]));
      const countMap = new Map<string, number>();
      for (const m of matches || []) {
        const name = leagueMap.get(m.league_id) || m.league_id;
        countMap.set(name, (countMap.get(name) || 0) + 1);
      }
      const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
      return { labels: sorted.map(s => s[0]), datasets: [{ label: "Matches", values: sorted.map(s => s[1]) }] };
    },
  },
  {
    id: "daily_sessions",
    name: "Daily Swiping Sessions",
    category: "Matches",
    description: "Unique daily global sessions per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase.from("daily_global_sessions").select("session_date").gte("session_date", since);
      const map = new Map<string, number>();
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        map.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of data || []) {
        if (map.has(r.session_date)) map.set(r.session_date, (map.get(r.session_date) || 0) + 1);
      }
      return { labels: Array.from(map.keys()), datasets: [{ label: "Sessions", values: Array.from(map.values()) }] };
    },
  },

  // ─── ELO & RANK ───
  {
    id: "global_elo_distribution",
    name: "Global Elo Distribution",
    category: "Elo & Rank",
    description: "Distribution of global Elo across items and users",
    fetch: async () => {
      const { data: items } = await supabase.from("preset_items").select("elo");
      const { data: members } = await supabase.from("league_memberships").select("elo");
      const all = [...(items || []).map(i => i.elo), ...(members || []).map(m => m.elo)];
      const buckets = { "< 1000": 0, "1000-1100": 0, "1100-1200": 0, "1200-1300": 0, "1300-1400": 0, "1400+": 0 };
      for (const e of all) {
        if (e < 1000) buckets["< 1000"]++;
        else if (e < 1100) buckets["1000-1100"]++;
        else if (e < 1200) buckets["1100-1200"]++;
        else if (e < 1300) buckets["1200-1300"]++;
        else if (e < 1400) buckets["1300-1400"]++;
        else buckets["1400+"]++;
      }
      return { labels: Object.keys(buckets), datasets: [{ label: "Count", values: Object.values(buckets) }] };
    },
  },
  {
    id: "elo_changes_over_time",
    name: "Global Elo Changes Over Time",
    category: "Elo & Rank",
    description: "Average Elo from snapshots over time",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("global_elo_snapshots").select("elo, snapshot_at").gte("snapshot_at", since).order("snapshot_at");
      const dayMap = new Map<string, { sum: number; count: number }>();
      for (const r of data || []) {
        const day = r.snapshot_at.slice(0, 10);
        const e = dayMap.get(day) || { sum: 0, count: 0 };
        e.sum += r.elo; e.count++;
        dayMap.set(day, e);
      }
      const labels = Array.from(dayMap.keys());
      const values = labels.map(l => Math.round((dayMap.get(l)!.sum / dayMap.get(l)!.count)));
      return { labels, datasets: [{ label: "Avg Elo", values }] };
    },
  },
  {
    id: "local_vs_global_divergence",
    name: "Local vs Global Rank Divergence",
    category: "Elo & Rank",
    description: "How much personal rankings differ from global consensus",
    fetch: async () => {
      const { data: local } = await supabase.from("local_rankings").select("item_id, local_elo, league_id").not("item_id", "is", null).limit(500);
      const { data: items } = await supabase.from("preset_items").select("id, elo");
      const globalMap = new Map((items || []).map(i => [i.id, i.elo]));
      const diffs: number[] = [];
      for (const lr of local || []) {
        const ge = globalMap.get(lr.item_id!);
        if (ge !== undefined) diffs.push(lr.local_elo - ge);
      }
      const buckets = { "< -100": 0, "-100 to -50": 0, "-50 to 0": 0, "0 to 50": 0, "50 to 100": 0, "> 100": 0 };
      for (const d of diffs) {
        if (d < -100) buckets["< -100"]++;
        else if (d < -50) buckets["-100 to -50"]++;
        else if (d < 0) buckets["-50 to 0"]++;
        else if (d < 50) buckets["0 to 50"]++;
        else if (d < 100) buckets["50 to 100"]++;
        else buckets["> 100"]++;
      }
      return { labels: Object.keys(buckets), datasets: [{ label: "Items", values: Object.values(buckets) }] };
    },
  },
  {
    id: "combined_elo_movement",
    name: "Combined Elo Movement Per Day",
    category: "Elo & Rank",
    description: "Net Elo change across all leagues from snapshots",
    fetch: async ({ days = 14 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("global_elo_snapshots").select("elo, snapshot_at").gte("snapshot_at", since).order("snapshot_at");
      const dayMap = new Map<string, number>();
      for (const r of data || []) {
        const day = r.snapshot_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) || 0) + (r.elo - 1200));
      }
      return { labels: Array.from(dayMap.keys()), datasets: [{ label: "Net Elo Δ from 1200", values: Array.from(dayMap.values()) }] };
    },
  },
  {
    id: "top_risers_fallers",
    name: "Top Elo Risers & Fallers (Items)",
    category: "Elo & Rank",
    description: "Items with biggest Elo changes in recent snapshots",
    fetch: async () => {
      const { data } = await supabase.from("global_elo_snapshots").select("item_id, elo, snapshot_at").not("item_id", "is", null).order("snapshot_at").limit(1000);
      const itemFirst = new Map<string, number>();
      const itemLast = new Map<string, number>();
      for (const r of data || []) {
        if (!itemFirst.has(r.item_id!)) itemFirst.set(r.item_id!, r.elo);
        itemLast.set(r.item_id!, r.elo);
      }
      const deltas: { id: string; delta: number }[] = [];
      for (const [id, first] of itemFirst) {
        deltas.push({ id, delta: (itemLast.get(id) || first) - first });
      }
      deltas.sort((a, b) => b.delta - a.delta);
      const top = [...deltas.slice(0, 5), ...deltas.slice(-5)];
      const { data: items } = await supabase.from("preset_items").select("id, name").in("id", top.map(t => t.id));
      const nameMap = new Map((items || []).map(i => [i.id, i.name]));
      return {
        labels: top.map(t => nameMap.get(t.id) || t.id.slice(0, 8)),
        datasets: [{ label: "Elo Δ", values: top.map(t => t.delta) }],
      };
    },
  },

  // ─── ITEMS ───
  {
    id: "top_items_by_elo",
    name: "Top Items by Elo",
    category: "Items",
    description: "Highest rated preset items globally",
    fetch: async () => {
      const { data } = await supabase.from("preset_items").select("name, elo").order("elo", { ascending: false }).limit(20);
      return { labels: (data || []).map(d => d.name), datasets: [{ label: "Elo", values: (data || []).map(d => d.elo) }] };
    },
  },
  {
    id: "most_matched_items",
    name: "Most Matched Items",
    category: "Items",
    description: "Items appearing in the most matches",
    fetch: async () => {
      const { data: matches } = await supabase.from("matches").select("winner_item_id, loser_item_id").not("winner_item_id", "is", null).limit(1000);
      const countMap = new Map<string, number>();
      for (const m of matches || []) {
        if (m.winner_item_id) countMap.set(m.winner_item_id, (countMap.get(m.winner_item_id) || 0) + 1);
        if (m.loser_item_id) countMap.set(m.loser_item_id, (countMap.get(m.loser_item_id) || 0) + 1);
      }
      const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
      const { data: items } = await supabase.from("preset_items").select("id, name").in("id", sorted.map(s => s[0]));
      const nameMap = new Map((items || []).map(i => [i.id, i.name]));
      return {
        labels: sorted.map(s => nameMap.get(s[0]) || s[0].slice(0, 8)),
        datasets: [{ label: "Appearances", values: sorted.map(s => s[1]) }],
      };
    },
  },
  {
    id: "item_win_rates",
    name: "Item Win Rates (Sentiment)",
    category: "Items",
    description: "Win rate of top items — shows how positively users feel about them",
    fetch: async () => {
      const { data: matches } = await supabase.from("matches").select("winner_item_id, loser_item_id").not("winner_item_id", "is", null).limit(1000);
      const wins = new Map<string, number>();
      const total = new Map<string, number>();
      for (const m of matches || []) {
        if (m.winner_item_id) {
          wins.set(m.winner_item_id, (wins.get(m.winner_item_id) || 0) + 1);
          total.set(m.winner_item_id, (total.get(m.winner_item_id) || 0) + 1);
        }
        if (m.loser_item_id) {
          total.set(m.loser_item_id, (total.get(m.loser_item_id) || 0) + 1);
        }
      }
      const rates = Array.from(total.entries())
        .filter(([_, t]) => t >= 5)
        .map(([id, t]) => ({ id, rate: Math.round(((wins.get(id) || 0) / t) * 100) }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 15);
      const { data: items } = await supabase.from("preset_items").select("id, name").in("id", rates.map(r => r.id));
      const nameMap = new Map((items || []).map(i => [i.id, i.name]));
      return {
        labels: rates.map(r => nameMap.get(r.id) || r.id.slice(0, 8)),
        datasets: [{ label: "Win %", values: rates.map(r => r.rate) }],
      };
    },
  },
  {
    id: "controversial_items",
    name: "Most Controversial Items",
    category: "Items",
    description: "Items closest to 50% win rate — most divisive",
    fetch: async () => {
      const { data: matches } = await supabase.from("matches").select("winner_item_id, loser_item_id").not("winner_item_id", "is", null).limit(1000);
      const wins = new Map<string, number>();
      const total = new Map<string, number>();
      for (const m of matches || []) {
        if (m.winner_item_id) { wins.set(m.winner_item_id, (wins.get(m.winner_item_id) || 0) + 1); total.set(m.winner_item_id, (total.get(m.winner_item_id) || 0) + 1); }
        if (m.loser_item_id) { total.set(m.loser_item_id, (total.get(m.loser_item_id) || 0) + 1); }
      }
      const rates = Array.from(total.entries())
        .filter(([_, t]) => t >= 5)
        .map(([id, t]) => ({ id, rate: ((wins.get(id) || 0) / t) * 100, diff: Math.abs(50 - ((wins.get(id) || 0) / t) * 100) }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 15);
      const { data: items } = await supabase.from("preset_items").select("id, name").in("id", rates.map(r => r.id));
      const nameMap = new Map((items || []).map(i => [i.id, i.name]));
      return {
        labels: rates.map(r => nameMap.get(r.id) || r.id.slice(0, 8)),
        datasets: [{ label: "Win %", values: rates.map(r => Math.round(r.rate)) }],
      };
    },
  },

  // ─── USER SENTIMENT (users as swiped targets) ───
  {
    id: "user_win_rates",
    name: "User Win Rates (Sentiment)",
    category: "Elo & Rank",
    description: "Win rate of users in matchups — how positively they're perceived",
    fetch: async () => {
      const { data: matches } = await supabase.from("matches").select("winner_profile_id, loser_profile_id").not("winner_profile_id", "is", null).limit(1000);
      const wins = new Map<string, number>();
      const total = new Map<string, number>();
      for (const m of matches || []) {
        if (m.winner_profile_id) { wins.set(m.winner_profile_id, (wins.get(m.winner_profile_id) || 0) + 1); total.set(m.winner_profile_id, (total.get(m.winner_profile_id) || 0) + 1); }
        if (m.loser_profile_id) { total.set(m.loser_profile_id, (total.get(m.loser_profile_id) || 0) + 1); }
      }
      const rates = Array.from(total.entries())
        .filter(([_, t]) => t >= 3)
        .map(([id, t]) => ({ id, rate: Math.round(((wins.get(id) || 0) / t) * 100) }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 15);
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", rates.map(r => r.id));
      const nameMap = new Map((profiles || []).map(p => [p.id, p.display_name]));
      return {
        labels: rates.map(r => nameMap.get(r.id) || "User"),
        datasets: [{ label: "Win %", values: rates.map(r => r.rate) }],
      };
    },
  },

  // ─── FEATURES ───
  {
    id: "theme_popularity",
    name: "Theme Popularity",
    category: "Features",
    description: "Distribution of selected themes",
    fetch: async () => {
      const { data } = await supabase.from("profiles").select("custom_theme").eq("is_bot", false);
      const b = countField(data || [], "custom_theme");
      return { labels: b.labels, datasets: [{ label: "Users", values: b.counts }] };
    },
  },
  {
    id: "animation_popularity",
    name: "Swipe Animation Popularity",
    category: "Features",
    description: "Distribution of selected swipe animations",
    fetch: async () => {
      const { data } = await supabase.from("profiles").select("swipe_animation").eq("is_bot", false);
      const b = countField(data || [], "swipe_animation");
      return { labels: b.labels, datasets: [{ label: "Users", values: b.counts }] };
    },
  },
  {
    id: "animation_usage",
    name: "Animation Usage Logs",
    category: "Features",
    description: "Which animations are actually played most",
    fetch: async () => {
      const { data } = await supabase.from("animation_usage_logs").select("animation_id");
      const b = countField(data || [], "animation_id");
      return { labels: b.labels.slice(0, 15), datasets: [{ label: "Times Played", values: b.counts.slice(0, 15) }] };
    },
  },
  {
    id: "aura_check_accuracy",
    name: "Aura Check Accuracy",
    category: "Features",
    description: "Correct vs incorrect guesses in Aura Check",
    fetch: async () => {
      const { data } = await supabase.from("elo_check_games").select("is_correct");
      const rows = data || [];
      const correct = rows.filter(r => r.is_correct).length;
      return { labels: ["Correct", "Incorrect"], datasets: [{ label: "Guesses", values: [correct, rows.length - correct] }] };
    },
  },
  {
    id: "purchases_by_type",
    name: "Purchases by Type",
    category: "Features",
    description: "Breakdown of power-up purchases",
    fetch: async () => {
      const { data } = await supabase.from("purchases").select("item_type");
      const b = countField(data || [], "item_type");
      return { labels: b.labels, datasets: [{ label: "Purchases", values: b.counts }] };
    },
  },
  {
    id: "invite_redemptions_over_time",
    name: "Invite Redemptions Over Time",
    category: "Features",
    description: "Invite link usage per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("invite_redemptions").select("created_at").gte("created_at", since);
      const b = bucketByDay((data || []).map(r => r.created_at), days);
      return { labels: b.labels, datasets: [{ label: "Redemptions", values: b.counts }] };
    },
  },

  // ─── COMMENTS ───
  {
    id: "comments_over_time",
    name: "Comments Over Time",
    category: "Comments",
    description: "Comment volume per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("comments").select("created_at").gte("created_at", since);
      const b = bucketByDay((data || []).map(r => r.created_at), days);
      return { labels: b.labels, datasets: [{ label: "Comments", values: b.counts }] };
    },
  },
  {
    id: "comments_per_league",
    name: "Comments Per League",
    category: "Comments",
    description: "Comment count grouped by league",
    fetch: async () => {
      const { data: leagues } = await supabase.from("leagues").select("id, name");
      const { data: comments } = await supabase.from("comments").select("league_id").not("league_id", "is", null);
      const leagueMap = new Map((leagues || []).map(l => [l.id, l.name]));
      const countMap = new Map<string, number>();
      for (const c of comments || []) {
        const name = leagueMap.get(c.league_id!) || "Unknown";
        countMap.set(name, (countMap.get(name) || 0) + 1);
      }
      const sorted = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
      return { labels: sorted.map(s => s[0]), datasets: [{ label: "Comments", values: sorted.map(s => s[1]) }] };
    },
  },
  {
    id: "reaction_distribution",
    name: "Reaction Emoji Distribution",
    category: "Comments",
    description: "Most used reaction emojis",
    fetch: async () => {
      const { data } = await supabase.from("comment_reactions").select("emoji");
      const b = countField(data || [], "emoji");
      return { labels: b.labels.slice(0, 10), datasets: [{ label: "Reactions", values: b.counts.slice(0, 10) }] };
    },
  },
  {
    id: "category_distribution",
    name: "League Category Distribution",
    category: "Matches",
    description: "Leagues grouped by category",
    fetch: async () => {
      const { data } = await supabase.from("leagues").select("category");
      const b = countField(data || [], "category");
      return { labels: b.labels, datasets: [{ label: "Leagues", values: b.counts }] };
    },
  },
  // ─── ADS ───
  {
    id: "ad_impressions_over_time",
    name: "Ad Impressions Over Time",
    category: "Ads",
    description: "Daily ad impression count",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("ad_events").select("created_at").eq("event_type", "impression").gte("created_at", since);
      const b = bucketByDay((data || []).map((r: any) => r.created_at), days);
      return { labels: b.labels, datasets: [{ label: "Impressions", values: b.counts }] };
    },
  },
  {
    id: "ad_clicks_over_time",
    name: "Ad Clicks Over Time",
    category: "Ads",
    description: "Daily ad click count (CTA + skip)",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("ad_events").select("created_at, event_type").in("event_type", ["click", "cta_click", "skip"]).gte("created_at", since);
      const clicks = (data || []).filter((r: any) => r.event_type !== "skip");
      const skips = (data || []).filter((r: any) => r.event_type === "skip");
      const bClicks = bucketByDay(clicks.map((r: any) => r.created_at), days);
      const bSkips = bucketByDay(skips.map((r: any) => r.created_at), days);
      return { labels: bClicks.labels, datasets: [{ label: "CTA Clicks", values: bClicks.counts }, { label: "Skips", values: bSkips.counts }] };
    },
  },
  {
    id: "ad_impressions_by_placement",
    name: "Ad Impressions by Placement",
    category: "Ads",
    description: "Impression count grouped by placement",
    fetch: async () => {
      const { data } = await supabase.from("ad_events").select("placement").eq("event_type", "impression");
      const b = countField(data || [], "placement");
      return { labels: b.labels, datasets: [{ label: "Impressions", values: b.counts }] };
    },
  },
  {
    id: "ad_mode_distribution",
    name: "Ad Mode Distribution",
    category: "Ads",
    description: "Popup vs In-Swipe impressions",
    fetch: async () => {
      const { data } = await supabase.from("ad_events").select("ad_mode").eq("event_type", "impression");
      const b = countField(data || [], "ad_mode");
      return { labels: b.labels, datasets: [{ label: "Impressions", values: b.counts }] };
    },
  },
  {
    id: "ad_source_distribution",
    name: "Ad Source Distribution",
    category: "Ads",
    description: "Custom vs AdSense vs Hybrid impressions",
    fetch: async () => {
      const { data } = await supabase.from("ad_events").select("ad_source").eq("event_type", "impression");
      const b = countField(data || [], "ad_source");
      return { labels: b.labels, datasets: [{ label: "Impressions", values: b.counts }] };
    },
  },
  {
    id: "ad_ctr_over_time",
    name: "Ad CTR Over Time",
    category: "Ads",
    description: "Click-through rate per day",
    fetch: async ({ days = 30 } = {}) => {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data } = await supabase.from("ad_events").select("created_at, event_type").gte("created_at", since);
      const dayImpressions = new Map<string, number>();
      const dayClicks = new Map<string, number>();
      const numDays = days;
      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayImpressions.set(key, 0);
        dayClicks.set(key, 0);
      }
      for (const e of data || []) {
        const key = (e as any).created_at.slice(0, 10);
        if ((e as any).event_type === "impression") dayImpressions.set(key, (dayImpressions.get(key) || 0) + 1);
        if ((e as any).event_type === "cta_click" || (e as any).event_type === "click") dayClicks.set(key, (dayClicks.get(key) || 0) + 1);
      }
      const labels = Array.from(dayImpressions.keys());
      const values = labels.map(l => {
        const imp = dayImpressions.get(l) || 0;
        return imp > 0 ? Math.round(((dayClicks.get(l) || 0) / imp) * 1000) / 10 : 0;
      });
      return { labels, datasets: [{ label: "CTR %", values }] };
    },
  },
];

export function getDataSources(): DataSourceDef[] {
  return sources;
}

export function getDataSourceById(id: string): DataSourceDef | undefined {
  return sources.find(s => s.id === id);
}

export function getCategories(): string[] {
  return Array.from(new Set(sources.map(s => s.category)));
}
