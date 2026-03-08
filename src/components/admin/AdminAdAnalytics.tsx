import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Eye, MousePointerClick, SkipForward, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))", "hsl(var(--accent))", "hsl(210 70% 55%)",
  "hsl(150 60% 45%)", "hsl(340 70% 55%)", "hsl(45 80% 55%)",
];

interface AdEvent {
  event_type: string;
  placement: string;
  ad_mode: string;
  ad_source: string;
  creative_id: string | null;
  created_at: string;
}

export default function AdminAdAnalytics() {
  const [events, setEvents] = useState<AdEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("7");

  useEffect(() => {
    loadEvents();
  }, [days]);

  const loadEvents = async () => {
    setLoading(true);
    const since = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
    const { data } = await supabase
      .from("ad_events")
      .select("event_type, placement, ad_mode, ad_source, creative_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    setEvents((data as AdEvent[]) || []);
    setLoading(false);
  };

  const impressions = events.filter(e => e.event_type === "impression").length;
  const clicks = events.filter(e => e.event_type === "click" || e.event_type === "cta_click").length;
  const skips = events.filter(e => e.event_type === "skip").length;
  const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(1) : "0";

  // Events over time
  const dayMap = new Map<string, { impressions: number; clicks: number; skips: number }>();
  const numDays = parseInt(days);
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap.set(d.toISOString().slice(0, 10), { impressions: 0, clicks: 0, skips: 0 });
  }
  for (const e of events) {
    const key = e.created_at.slice(0, 10);
    const entry = dayMap.get(key);
    if (entry) {
      if (e.event_type === "impression") entry.impressions++;
      else if (e.event_type === "click" || e.event_type === "cta_click") entry.clicks++;
      else if (e.event_type === "skip") entry.skips++;
    }
  }
  const timelineData = Array.from(dayMap.entries()).map(([date, v]) => ({
    name: date.slice(5),
    Impressions: v.impressions,
    Clicks: v.clicks,
    Skips: v.skips,
  }));

  // By placement
  const placementMap = new Map<string, number>();
  for (const e of events.filter(e => e.event_type === "impression")) {
    placementMap.set(e.placement, (placementMap.get(e.placement) || 0) + 1);
  }
  const placementData = Array.from(placementMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  // By mode
  const modeMap = new Map<string, number>();
  for (const e of events.filter(e => e.event_type === "impression")) {
    modeMap.set(e.ad_mode, (modeMap.get(e.ad_mode) || 0) + 1);
  }
  const modeData = Array.from(modeMap.entries()).map(([name, value]) => ({ name, value }));

  // By source
  const sourceMap = new Map<string, number>();
  for (const e of events.filter(e => e.event_type === "impression")) {
    sourceMap.set(e.ad_source, (sourceMap.get(e.ad_source) || 0) + 1);
  }
  const sourceData = Array.from(sourceMap.entries()).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Ad Analytics
        </h4>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7" className="text-xs">7 days</SelectItem>
            <SelectItem value="14" className="text-xs">14 days</SelectItem>
            <SelectItem value="30" className="text-xs">30 days</SelectItem>
            <SelectItem value="90" className="text-xs">90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading analytics…</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-secondary rounded-lg p-2.5 text-center">
              <Eye className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold text-foreground">{impressions.toLocaleString()}</p>
              <span className="text-[10px] text-muted-foreground">Impressions</span>
            </div>
            <div className="bg-secondary rounded-lg p-2.5 text-center">
              <MousePointerClick className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold text-foreground">{clicks.toLocaleString()}</p>
              <span className="text-[10px] text-muted-foreground">Clicks</span>
            </div>
            <div className="bg-secondary rounded-lg p-2.5 text-center">
              <SkipForward className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold text-foreground">{skips.toLocaleString()}</p>
              <span className="text-[10px] text-muted-foreground">Skips</span>
            </div>
            <div className="bg-secondary rounded-lg p-2.5 text-center">
              <ExternalLink className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-lg font-bold text-foreground">{ctr}%</p>
              <span className="text-[10px] text-muted-foreground">CTR</span>
            </div>
          </div>

          {events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs">No ad events recorded yet. Events will appear as users interact with ads.</p>
            </div>
          ) : (
            <>
              {/* Timeline */}
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold text-foreground mb-2">Events Over Time</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="Impressions" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Clicks" stroke={COLORS[2]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Skips" stroke={COLORS[4]} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown charts */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* By placement */}
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">By Placement</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={placementData} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* By mode */}
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">By Ad Mode</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={modeData} cx="50%" cy="50%" outerRadius={60} dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        style={{ fontSize: 9 }}>
                        {modeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* By source */}
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">By Ad Source</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={sourceData} cx="50%" cy="50%" outerRadius={60} dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        style={{ fontSize: 9 }}>
                        {sourceData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
