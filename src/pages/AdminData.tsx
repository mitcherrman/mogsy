import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, BarChart3, PieChart, LineChart, AreaChart, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getDataSources, getCategories, getDataSourceById, type DataSourceResult } from "@/lib/admin-data-sources";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer, BarChart, Bar, LineChart as RLineChart, Line, PieChart as RPieChart, Pie, Cell,
  AreaChart as RAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

type ChartType = "bar" | "line" | "pie" | "area";

interface GraphCard {
  id: string;
  sourceId: string;
  chartType: ChartType;
  data: DataSourceResult | null;
  loading: boolean;
  error: boolean;
}

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--accent))", "hsl(210 70% 55%)", "hsl(150 60% 45%)",
  "hsl(340 70% 55%)", "hsl(45 80% 55%)", "hsl(270 60% 55%)", "hsl(180 50% 45%)",
];

const STORAGE_KEY = "admin_graph_configs";

function loadSavedGraphs(): { sourceId: string; chartType: ChartType }[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function saveGraphConfigs(graphs: GraphCard[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs.map(g => ({ sourceId: g.sourceId, chartType: g.chartType }))));
}

const chartTypeIcons: Record<ChartType, any> = { bar: BarChart3, line: LineChart, pie: PieChart, area: AreaChart };

function ChartRenderer({ data, chartType }: { data: DataSourceResult; chartType: ChartType }) {
  const chartData = data.labels.map((label, i) => {
    const point: any = { name: label };
    for (const ds of data.datasets) point[ds.label] = ds.values[i];
    return point;
  });
  const dataKeys = data.datasets.map(ds => ds.label);

  if (chartType === "pie") {
    const pieData = data.labels.map((name, i) => ({ name, value: data.datasets[0]?.values[i] || 0 }));
    return (
      <ResponsiveContainer width="100%" height={300}>
        <RPieChart>
          <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip />
        </RPieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <RLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
          <Legend />
          {dataKeys.map((key, i) => <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
        </RLineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <RAreaChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
          <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
          <Legend />
          {dataKeys.map((key, i) => <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.2} />)}
        </RAreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} stroke="hsl(var(--muted-foreground))" />
        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
        <Legend />
        {dataKeys.map((key, i) => <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AdminData() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [graphs, setGraphs] = useState<GraphCard[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedChart, setSelectedChart] = useState<ChartType>("bar");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [stats, setStats] = useState({ users: 0, matches: 0, avgElo: 0, activeToday: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      if (!data?.some(r => (r.role as string) === "master_admin")) {
        navigate("/admin");
        toast.error("Access denied");
        return;
      }
      setAuthorized(true);
      setLoading(false);
    });
  }, [user]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [profilesRes, matchesRes, eloRes] = await Promise.all([
        supabase.from("profiles").select("id, last_seen_at", { count: "exact", head: false }).eq("is_bot", false),
        supabase.from("matches").select("id", { count: "exact", head: true }),
        supabase.from("league_memberships").select("elo"),
      ]);
      const profiles = profilesRes.data || [];
      const active = profiles.filter(p => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 86400000).length;
      const elos = (eloRes.data || []).map(e => e.elo);
      const avg = elos.length > 0 ? Math.round(elos.reduce((a, b) => a + b, 0) / elos.length) : 1200;
      setStats({ users: profiles.length, matches: matchesRes.count || 0, avgElo: avg, activeToday: active });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    if (authorized) fetchStats();
  }, [authorized, fetchStats]);

  const fetchGraphData = useCallback(async (cardId: string, sourceId: string, currentGraphs?: GraphCard[]) => {
    const source = getDataSourceById(sourceId);
    if (!source) return;
    try {
      const data = await source.fetch();
      setGraphs(prev => {
        const base = currentGraphs || prev;
        return base.map(g => g.id === cardId ? { ...g, data, loading: false, error: false } : g);
      });
    } catch (err) {
      console.error("Failed to fetch data source:", err);
      setGraphs(prev => prev.map(g => g.id === cardId ? { ...g, loading: false, error: true } : g));
    }
  }, []);

  // Load saved graphs
  useEffect(() => {
    if (!authorized) return;
    const saved = loadSavedGraphs();
    if (saved.length > 0) {
      const cards: GraphCard[] = saved.map((s, i) => ({
        id: `saved-${i}-${Date.now()}`,
        sourceId: s.sourceId,
        chartType: s.chartType,
        data: null,
        loading: true,
        error: false,
      }));
      setGraphs(cards);
      cards.forEach((card) => fetchGraphData(card.id, card.sourceId, cards));
    }
  }, [authorized, fetchGraphData]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    // Refresh stats
    await fetchStats();
    // Refresh all graphs
    setGraphs(prev => prev.map(g => ({ ...g, loading: true, error: false })));
    setGraphs(prev => {
      prev.forEach(g => fetchGraphData(g.id, g.sourceId));
      return prev;
    });
    setLastRefreshed(new Date());
    setRefreshing(false);
    toast.success("Data refreshed");
  }, [fetchStats, fetchGraphData]);

  const refreshSingleGraph = useCallback((id: string, sourceId: string) => {
    setGraphs(prev => prev.map(g => g.id === id ? { ...g, loading: true, error: false } : g));
    fetchGraphData(id, sourceId);
  }, [fetchGraphData]);

  const addGraph = () => {
    if (!selectedSource) { toast.error("Select a data source"); return; }
    const card: GraphCard = {
      id: `graph-${Date.now()}`,
      sourceId: selectedSource,
      chartType: selectedChart,
      data: null,
      loading: true,
      error: false,
    };
    setGraphs(prev => {
      const updated = [...prev, card];
      saveGraphConfigs(updated);
      return updated;
    });
    fetchGraphData(card.id, card.sourceId);
    setSelectedSource("");
  };

  const removeGraph = (id: string) => {
    setGraphs(prev => {
      const updated = prev.filter(g => g.id !== id);
      saveGraphConfigs(updated);
      return updated;
    });
  };

  const changeChartType = (id: string, type: ChartType) => {
    setGraphs(prev => {
      const updated = prev.map(g => g.id === id ? { ...g, chartType: type } : g);
      saveGraphConfigs(updated);
      return updated;
    });
  };

  if (loading || !authorized) return <div className="min-h-dvh bg-background" />;

  const dataSources = getDataSources();
  const categories = getCategories();
  const timeAgo = Math.round((Date.now() - lastRefreshed.getTime()) / 1000);
  const timeLabel = timeAgo < 5 ? "just now" : timeAgo < 60 ? `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate("/admin")} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <BarChart3 className="h-5 w-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">Admin Data</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {timeLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={refreshAll}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Users", value: stats.users },
            { label: "Total Matches", value: stats.matches.toLocaleString() },
            { label: "Avg Elo", value: stats.avgElo },
            { label: "Active Today", value: stats.activeToday },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Graph Builder */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6">
          <h2 className="text-sm font-bold text-foreground mb-3">Add Graph</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select data source..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map(cat => (
                  <div key={cat}>
                    <p className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{cat}</p>
                    {dataSources.filter(s => s.category === cat).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              {(["bar", "line", "pie", "area"] as ChartType[]).map(t => {
                const Icon = chartTypeIcons[t];
                return (
                  <Button
                    key={t}
                    variant={selectedChart === t ? "default" : "outline"}
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setSelectedChart(t)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                );
              })}
            </div>
            <Button onClick={addGraph} className="gap-1">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        {/* Graphs */}
        <div className="space-y-4">
          {graphs.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No graphs yet. Add one above to start visualizing data.</p>
            </div>
          )}
          {graphs.map(g => {
            const source = getDataSourceById(g.sourceId);
            return (
              <div key={g.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{source?.name || g.sourceId}</h3>
                    <p className="text-[10px] text-muted-foreground">{source?.description}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => refreshSingleGraph(g.id, g.sourceId)}
                      disabled={g.loading}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                      title="Refresh this graph"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${g.loading ? "animate-spin" : ""}`} />
                    </button>
                    <div className="w-px h-5 bg-border mx-0.5" />
                    {(["bar", "line", "pie", "area"] as ChartType[]).map(t => {
                      const Icon = chartTypeIcons[t];
                      return (
                        <button
                          key={t}
                          onClick={() => changeChartType(g.id, t)}
                          className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${g.chartType === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      );
                    })}
                    <div className="w-px h-5 bg-border mx-0.5" />
                    <button onClick={() => removeGraph(g.id)} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {g.loading ? (
                  <div className="h-[300px] flex flex-col items-center justify-center gap-3">
                    <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading data...</p>
                  </div>
                ) : g.error ? (
                  <div className="h-[300px] flex flex-col items-center justify-center gap-3">
                    <p className="text-sm text-destructive">Failed to load data</p>
                    <Button variant="outline" size="sm" onClick={() => refreshSingleGraph(g.id, g.sourceId)} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Retry
                    </Button>
                  </div>
                ) : g.data && g.data.labels.length > 0 ? (
                  <ChartRenderer data={g.data} chartType={g.chartType} />
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">No data available</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
