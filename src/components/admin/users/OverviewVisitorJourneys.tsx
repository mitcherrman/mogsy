import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ChevronDown, Gamepad2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadAnalytics } from "@/lib/admin/analytics/loadAnalytics";
import { resolveRange } from "@/lib/admin/analytics/range";
import { filterDatasetByTraffic } from "@/lib/admin/analytics/traffic";
import { buildVisitorJourneys, type JourneyProfile, type VisitorJourney } from "@/lib/admin/analytics/visitorJourney";

const stamp = (at: string | null) => at ? new Date(at).toLocaleString() : "Unavailable";

export function VisitorJourneyTimeline({ journey }: { journey: VisitorJourney }) {
  const [expanded,setExpanded] = useState(false);
  const actions = journey.actions.slice(0,expanded ? 80 : 8);
  return <div className="space-y-3 border-t border-border px-3 py-4 sm:px-5">
    <p className="text-xs text-muted-foreground">{journey.accountLabel}. Browser association is not proof of a person’s identity.</p>
    <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      <div><dt className="text-muted-foreground">First recorded visit</dt><dd>{stamp(journey.firstAt)}</dd></div>
      <div><dt className="text-muted-foreground">Last observed activity</dt><dd>{stamp(journey.lastAt)}</dd></div>
    </dl>
    <p className="text-xs text-muted-foreground">Exit and drop-off unknown. Daily parent completion and full Daily / Role Challenge / More Challenges stage progress are unavailable; only recorded child stages appear below.</p>
    {actions.length === 0 ? <p className="text-sm">No activity events or sessions recorded in this range.</p> : <ol className="space-y-0">
      {actions.map((a,index)=><li key={`${a.at}-${index}`} className="relative border-l border-border pb-4 pl-4 last:pb-0">
        <span aria-hidden className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-primary" />
        <div className="flex flex-wrap justify-between gap-1"><p className="text-sm font-medium">{a.title}</p><time dateTime={a.at} className="text-xs tabular-nums text-muted-foreground">{stamp(a.at)}</time></div>
        <p className="mt-1 break-all text-xs text-muted-foreground">{a.where} · {a.evidence}</p>
        {a.event && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Technical evidence</summary><dl className="mt-2 space-y-1 break-all">
          <div><dt>Event</dt><dd>{a.event.event_name}</dd></div><div><dt>Source / entity</dt><dd>{a.event.source_system} / {a.event.source_entity_type || "unknown"} / {a.event.source_entity_id || "unavailable"}</dd></div>
          <div><dt>Host / preset / parent / stage kind</dt><dd>{["host","session_preset","parent_activity_type","parent_activity_id","parent_stage_kind"].map(key=>typeof a.event?.metadata?.[key] === "string" ? String(a.event.metadata[key]) : "unavailable").join(" / ")}</dd></div>
        </dl></details>}
      </li>)}
    </ol>}
    {journey.actions.length>8 && <Button variant="outline" size="sm" onClick={()=>setExpanded(v=>!v)}>{expanded ? "Show recent actions" : `Show more actions (${Math.min(journey.actions.length,80)})`}</Button>}
    {journey.actions.length>80 && expanded && <p className="text-xs text-muted-foreground">Showing the latest 80 of {journey.actions.length} recorded actions.</p>}
    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Browser technical details</summary><p className="mt-2 break-all">{journey.id}</p></details>
    <Link className="text-xs text-primary underline underline-offset-2" to={`/admin/users?section=audience&visitor=${encodeURIComponent(journey.id)}`}>Open visitor detail in Users</Link>
  </div>;
}

export function VisitorJourneysView({ journeys }: { journeys: VisitorJourney[] }) {
  const [filter,setFilter] = useState("all");
  const [limit,setLimit] = useState(12);
  const humans=journeys.filter(j=>j.human);
  const visible=journeys.filter(j=>filter === "all" || (filter === "traffic_unknown" ? !j.human : j.human && j.kind === filter));
  const tiles=[{label:"Human-signal visitors",value:humans.length,definition:"Distinct browsers with human input evidence; not verified people.",Icon:Users},
    {label:"Returning browsers",value:humans.filter(j=>j.returning).length,definition:"Human-signal browsers with a later recorded session in this range.",Icon:Activity},
    {label:"Game rounds started",value:humans.reduce((n,j)=>n+j.games,0),definition:"Distinct server-confirmed participant rounds linked to human-signal browsers; not Daily runs.",Icon:Gamepad2}];
  return <div className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-3">{tiles.map(t=><div key={t.label} className="rounded-lg border border-border bg-card p-4"><dt className="flex items-center gap-2 text-xs text-muted-foreground"><t.Icon className="h-4 w-4 text-primary" aria-hidden />{t.label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{t.value}</dd><dd className="mt-2 text-xs text-muted-foreground">{t.definition}</dd></div>)}</dl>
    <div className="flex flex-wrap gap-2" aria-label="Visitor account segments">
      {[{id:"all",label:"All visitors",count:journeys.length},{id:"guest",label:"Guest",count:humans.filter(j=>j.kind==="guest").length},{id:"registered",label:"Registered",count:humans.filter(j=>j.kind==="registered").length},{id:"unknown",label:"Account unknown",count:humans.filter(j=>j.kind==="unknown").length},{id:"traffic_unknown",label:"Human signal unknown",count:journeys.length-humans.length}].map(f=><Button key={f.id} variant={filter===f.id ? "secondary" : "outline"} size="sm" aria-pressed={filter===f.id} onClick={()=>{setFilter(f.id);setLimit(12);}} className="text-xs">{f.label} · {f.count}</Button>)}
    </div>
    <p className="text-xs text-muted-foreground">Guest / Registered / Account unknown segment human-signal browsers only. Unknown human signal stays separate. Signup reports are browser evidence, not verified registration dates.</p>
    {visible.length===0 && <p className="py-5 text-sm text-muted-foreground">No visitors recorded in this segment.</p>}
    <div className="divide-y divide-border">{visible.slice(0,limit).map((j,index)=><details key={j.id} className="group">
      <summary className="flex cursor-pointer list-none items-start gap-3 py-4"><ChevronDown aria-hidden className="mt-1 h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" /><div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">Visitor {index+1} · {j.human ? j.kind === "unknown" ? "Account unknown" : j.kind === "guest" ? "Guest" : "Registered" : "Human signal unknown"}</span><span className="text-xs text-muted-foreground">Last observed {stamp(j.lastAt)}</span></div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{j.source} · {j.landing} · {j.sessions} sessions · {j.games} game rounds{j.returning ? " · Returned" : ""}</p>
      </div></summary><VisitorJourneyTimeline journey={j} /></details>)}</div>
    {visible.length>limit && <Button variant="outline" size="sm" onClick={()=>setLimit(n=>Math.min(n+12,120))} disabled={limit>=120}>Show more visitors</Button>}
    {visible.length>120 && limit>=120 && <p className="text-xs text-muted-foreground">Overview shows up to 120 visitors. The full directory is in Users.</p>}
  </div>;
}

export function OverviewVisitorJourneys() {
  const [range] = useState(()=>resolveRange("7d",Date.now()));
  const query = useQuery({queryKey:["admin","overview-journeys",range.end],queryFn:()=>loadAnalytics(range),staleTime:60_000});
  const profiles=useQuery({queryKey:["admin","journey-profile-status"],queryFn:async()=>{
    const {data,error}=await supabase.rpc("admin_list_profiles");
    if (error || !Array.isArray(data)) throw new Error("Account status lookup unavailable");
    return data as JourneyProfile[];
  },staleTime:60_000});
  const journeys=useMemo(()=>{
    if (!query.data) return [];
    const filtered=filterDatasetByTraffic(query.data.dataset,"human_unknown",query.data.overrides);
    return buildVisitorJourneys(filtered.dataset,range,filtered.byVisitor,profiles.data ?? null);
  },[query.data,profiles.data,range]);
  return <section className="space-y-4" aria-label="Audience journeys" data-testid="overview-visitor-journeys">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold">Audience · last 7 days</h2><p className="text-xs text-muted-foreground">Who visited, what they did, and when — one record per browser.</p></div><Button size="sm" variant="outline" disabled={query.isFetching || profiles.isFetching} onClick={()=>{void query.refetch();void profiles.refetch();}}><RefreshCw className="h-3 w-3" aria-hidden />Refresh</Button></div>
    {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Reading visitor activity…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">Visitor activity unavailable. No counts can be confirmed.</p> : <>
      {profiles.isPending && <p role="status" className="text-xs text-muted-foreground">Checking current account status…</p>}
      {profiles.isError && <p role="alert" className="text-xs text-muted-foreground">Current profiles unavailable. Account labels use reported browser evidence only.</p>}
      {query.data && Object.values(query.data.truncated).some(Boolean) && <p role="alert" className="text-sm text-destructive">Partial analytics read: counts and journeys are incomplete.</p>}
      <VisitorJourneysView journeys={journeys} />
    </>}
  </section>;
}
