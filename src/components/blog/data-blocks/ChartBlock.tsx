import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { useBlogAuraHistory, useBlogMatchupCounts } from "@/hooks/blog/useBlogData";

type ChartKind = "aura-history" | "matchup-counts" | "win-rate";

export default function ChartBlock(props: {
  kind?: ChartKind;
  itemId?: string;
  profileId?: string;
  leagueId?: string;
  days?: number;
  height?: number;
  title?: string;
}) {
  const { kind = "aura-history", height = 240, title } = props;
  const aura = useBlogAuraHistory({ itemId: props.itemId, profileId: props.profileId, days: props.days });
  const matchups = useBlogMatchupCounts(props.leagueId);

  const renderChart = () => {
    if (kind === "aura-history") {
      const data = aura.data ?? [];
      if (!data.length) return <Empty />;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--blog-border)" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="var(--blog-muted)" fontSize={11} />
            <YAxis stroke="var(--blog-muted)" fontSize={11} domain={["dataMin - 20", "dataMax + 20"]} />
            <Tooltip contentStyle={{ background: "var(--blog-surface)", border: "1px solid var(--blog-border)", color: "var(--blog-text)" }} />
            <Line type="monotone" dataKey="elo" stroke="var(--blog-accent)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      );
    }
    if (kind === "matchup-counts") {
      const data = matchups.data ?? [];
      if (!data.length) return <Empty />;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--blog-border)" strokeDasharray="3 3" />
            <XAxis dataKey="name" stroke="var(--blog-muted)" fontSize={11} interval={0} angle={-15} height={50} />
            <YAxis stroke="var(--blog-muted)" fontSize={11} />
            <Tooltip contentStyle={{ background: "var(--blog-surface)", border: "1px solid var(--blog-border)", color: "var(--blog-text)" }} />
            <Bar dataKey="wins" fill="var(--blog-accent)" />
            <Bar dataKey="losses" fill="var(--blog-muted)" />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    // win-rate
    const data = (matchups.data ?? []).map((r) => ({
      name: r.name,
      rate: r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0,
    }));
    if (!data.length) return <Empty />;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--blog-border)" strokeDasharray="3 3" />
          <XAxis dataKey="name" stroke="var(--blog-muted)" fontSize={11} interval={0} angle={-15} height={50} />
          <YAxis stroke="var(--blog-muted)" fontSize={11} unit="%" domain={[0, 100]} />
          <Tooltip contentStyle={{ background: "var(--blog-surface)", border: "1px solid var(--blog-border)", color: "var(--blog-text)" }} />
          <Bar dataKey="rate" fill="var(--blog-accent)" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="blog-surface rounded-2xl p-4">
      {title && <div className="text-sm font-bold mb-3">{title}</div>}
      {renderChart()}
    </div>
  );
}

function Empty() {
  return <div className="h-40 flex items-center justify-center text-sm blog-muted">No data yet</div>;
}