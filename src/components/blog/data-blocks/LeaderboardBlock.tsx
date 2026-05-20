import { useBlogLeaderboard } from "@/hooks/blog/useBlogData";

export default function LeaderboardBlock({ leagueId, limit = 10 }: { leagueId?: string; limit?: number }) {
  const { data, isLoading } = useBlogLeaderboard(leagueId, limit);
  if (!leagueId) return <div className="blog-surface rounded-xl p-4 text-center blog-muted">Pick a league</div>;
  if (isLoading) return <div className="blog-surface rounded-xl p-4 animate-pulse h-48" />;
  if (!data?.league) return <div className="blog-surface rounded-xl p-4 blog-muted">League not found</div>;

  return (
    <div className="blog-surface rounded-2xl overflow-hidden">
      <div className="p-4 border-b blog-border">
        <div className="text-[10px] uppercase tracking-widest blog-muted">Leaderboard</div>
        <div className="text-lg font-bold">{data.league.name}</div>
      </div>
      <ol className="divide-y divide-[var(--blog-border)]">
        {data.rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-6 text-sm font-bold blog-muted">{i + 1}</span>
            {r.image_url && <img src={r.image_url} alt={r.name} className="w-8 h-8 rounded object-cover" loading="lazy" />}
            <span className="flex-1 truncate text-sm font-semibold">{r.name}</span>
            <span className="text-sm font-bold blog-accent">{r.elo}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}