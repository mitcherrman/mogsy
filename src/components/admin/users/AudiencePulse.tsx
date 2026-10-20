/** Launch-focused operator overview. No invented first-play attribution:
 * Railway parent Daily lifecycle is not yet instrumented, so this does not
 * call child Ranked starts first-time Daily plays.
 */
import { useMemo } from "react";
import type { AnalyticsDataset } from "@/lib/admin/analytics/metrics";
import { computeOverview } from "@/lib/admin/analytics/metrics";
import { buildVisitorRows } from "@/lib/admin/analytics/population";
import type { AnalyticsRange } from "@/lib/admin/analytics/range";
import type { VisitorClassification } from "@/lib/admin/analytics/traffic";

interface Props {
  dataset: AnalyticsDataset;
  range: AnalyticsRange;
  now: number;
  classification: Map<string, VisitorClassification>;
  onVisitor: (id: string) => void;
}

function sourceOf(firstUtmSource: string | null, firstReferrer: string | null): string {
  if (firstUtmSource) return firstUtmSource;
  if (!firstReferrer) return "Direct / unknown";
  try { return new URL(firstReferrer).hostname || "Direct / unknown"; }
  catch { return "Direct / unknown"; }
}

export function AudiencePulse({ dataset, range, now, classification, onVisitor }: Props) {
  const overview = useMemo(() => computeOverview(dataset, range, now), [dataset, range, now]);
  const recent = useMemo(
    () => buildVisitorRows(dataset, range, classification)
      .filter((row) => row.sessionsInRange > 0 || row.eventsInRange > 0)
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
      .slice(0, 12),
    [dataset, range, classification],
  );
  const visitorClasses = useMemo(() => {
    const ids = new Set<string>();
    for (const session of dataset.sessions) {
      const started = Date.parse(session.started_at);
      if ((range.start === null || started >= range.start) && started <= range.end) ids.add(session.visitor_id);
    }
    for (const event of dataset.events) {
      if (event.source_system !== "web" || !event.visitor_id) continue;
      const received = Date.parse(event.received_at);
      if ((range.start === null || received >= range.start) && received <= range.end) ids.add(event.visitor_id);
    }
    let human = 0;
    let unknown = 0;
    for (const id of ids) {
      const kind = classification.get(id)?.trafficClass;
      if (kind === "human") human++;
      if (kind === "unknown") unknown++;
    }
    return { human, unknown };
  }, [dataset, range, classification]);

  return (
    <section data-testid="users-audience-pulse" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Audience Pulse</h2>
        <p className="text-xs text-muted-foreground">
          Who arrived, who played, and who joined. Browser identities are not verified people.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3" data-testid="pulse-arrivals">
          <div className="text-[10px] uppercase text-muted-foreground">Human-signal visitors</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{visitorClasses.human}</div>
          <p className="text-[11px] text-muted-foreground">+ {visitorClasses.unknown} unknown; not confirmed human</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3" data-testid="pulse-first-plays">
          <div className="text-[10px] uppercase text-muted-foreground">First-time players</div>
          <div className="mt-2 text-sm font-semibold">Not yet reliable</div>
          <p className="text-[11px] text-muted-foreground">Daily parent starts and browser-to-game joins need certification.</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3" data-testid="pulse-signups">
          <div className="text-[10px] uppercase text-muted-foreground">Recorded signups</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{overview.signups}</div>
          <p className="text-[11px] text-muted-foreground">Signup events, not authenticated-user count</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3" data-testid="pulse-returning">
          <div className="text-[10px] uppercase text-muted-foreground">Returning browser visitors</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{overview.returningVisitors}</div>
          <p className="text-[11px] text-muted-foreground">Repeat browser sessions; not unique people</p>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="text-sm font-semibold">Recent visitor activity</h3>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Latest 12 browser records in the selected population; opens show interest, not confirmed gameplay.
        </p>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">No visitors recorded in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                <th className="p-2">Last seen</th><th className="p-2">Visitor</th><th className="p-2">Source</th><th className="p-2">Opened</th><th className="p-2">Account</th>
              </tr></thead>
              <tbody>{recent.map((row) => (
                <tr key={row.visitorId} className="border-b border-border/40">
                  <td className="p-2 whitespace-nowrap">{row.lastSeen ? new Date(row.lastSeen).toLocaleString() : "—"}</td>
                  <td className="p-2"><button className="text-primary underline underline-offset-2" onClick={() => onVisitor(row.visitorId)}>
                    {row.visitorId.slice(0, 8)} · {row.trafficClass}
                  </button></td>
                  <td className="p-2">{sourceOf(row.firstUtmSource, row.firstReferrer)}</td>
                  <td className="p-2">{row.modesOpened.join(", ") || "—"}</td>
                  <td className="p-2">{row.signedUp ? "Signed up in range" : row.registered ? "Registered" : row.userIds.length ? "Guest identity" : "No account"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
