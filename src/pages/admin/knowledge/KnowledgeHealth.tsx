import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { knowledgeApi } from "@/lib/knowledge-admin/api";
import type { ChampionHealth, HealthCategory } from "@/lib/knowledge-admin/types";
import { ErrorBanner, HealthCategoryBadge, SkeletonRow, relativeTime } from "./shared";
import { cn } from "@/lib/utils";

const CATEGORIES: (HealthCategory | "ALL")[] = ["ALL", "HEALTHY", "NEEDS_REVIEW", "CRITICAL", "NO_DATA"];

/** Champion Health Dashboard — full roster in one request, client-side sort/search. */
export default function KnowledgeHealth() {
  const [params, setParams] = useSearchParams();
  const category = (params.get("category") as HealthCategory | null) ?? null;
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);

  const q = useQuery({
    queryKey: ["knowledge", "health"],
    queryFn: () => knowledgeApi.health(),
  });

  const rows = useMemo(() => {
    let list: ChampionHealth[] = q.data?.champions ?? [];
    if (category) list = list.filter((c) => c.health_category === category);
    if (gapsOnly) list = list.filter((c) => c.parser_gap);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((c) => c.champion.toLowerCase().includes(s));
    }
    return list;
  }, [q.data, category, gapsOnly, search]);

  const summary = q.data?.summary;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => {
          const active = c === "ALL" ? !category : category === c;
          const count = summary && c !== "ALL" ? summary[c as HealthCategory] : q.data?.count;
          return (
            <button
              key={c}
              onClick={() => {
                const next = new URLSearchParams(params);
                if (c === "ALL") next.delete("category");
                else next.set("category", c);
                setParams(next, { replace: true });
              }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {c === "ALL" ? "All" : c.replace("_", " ")} <span className="opacity-70 tabular-nums">{count ?? "—"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search champion…"
          className="rounded border border-border bg-background px-2 py-1 w-48"
        />
        <label className="inline-flex items-center gap-1 text-muted-foreground">
          <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
          parser gaps only
        </label>
      </div>

      {q.error && <ErrorBanner error={q.error} onRetry={() => q.refetch()} />}

      {q.isLoading && (
        <div className="space-y-1.5">{Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} className="h-10" />)}</div>
      )}

      {!q.isLoading && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">Champion</th>
                  <th className="px-3 py-2 font-semibold text-right">Score</th>
                  <th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold text-right">Coverage</th>
                  <th className="px-3 py-2 font-semibold text-right">Pending</th>
                  <th className="px-3 py-2 font-semibold text-right">Verified</th>
                  <th className="px-3 py-2 font-semibold">Last scan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.champion} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-3 py-2 font-semibold">
                      <Link to={`/admin/knowledge/health/${encodeURIComponent(c.champion)}`} className="hover:underline">
                        {c.champion}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.parser_gap ? <span className="text-muted-foreground">⛔</span> : c.health_score.toFixed(1)}
                    </td>
                    <td className="px-3 py-2">
                      {c.parser_gap
                        ? <span className="text-[10px] font-extrabold uppercase text-muted-foreground">PARSER GAP</span>
                        : <HealthCategoryBadge category={c.health_category} />}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.parser_gap ? "—" : `${c.coverage_pct.toFixed(0)}%`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.pending_review_count > 0 ? (
                        <Link to={`/admin/knowledge/queue?champion=${encodeURIComponent(c.champion)}`} className="text-primary hover:underline">
                          {c.pending_review_count}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.parser_gap ? "—" : `${c.properties_verified}/${c.properties_in_registry}`}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {relativeTime(c.last_successful_verification)}
                      {c.last_provider && <span className="ml-1 text-[10px]">({c.last_provider})</span>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground italic">No rows match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}