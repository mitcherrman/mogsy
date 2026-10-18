import { useState } from "react";
import { Crown, UserRoundCheck, Radio, MessageCircle, Gamepad2, Activity, Mail, BadgeCheck, Clock, ShieldAlert, CircleDot, ShoppingBag, Link2 } from "lucide-react";
import type { JourneyMoment } from "@/lib/admin/account-journey";
import { buildAccountJourney, type AccountJourneyInput } from "@/lib/admin/account-journey";

const icons = {
  auth: Mail, identity: Link2, premium: Crown, game: Gamepad2, interest: Radio, ledger: ShoppingBag,
} as const;
const tone = {
  auth: "text-sky-400 bg-sky-400/10 border-sky-400/20",
  identity: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  premium: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  game: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  interest: "text-muted-foreground bg-secondary/50 border-border",
  ledger: "text-muted-foreground bg-secondary/50 border-border",
} as const;
const stamp = (date: string) => new Date(date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const statusTone = (ok: boolean) => ok ? "text-emerald-400" : "text-muted-foreground";
function Milestone({ title, value, detail, verified }: {title:string;value:string;detail:string;verified:boolean}) {
  return <div className="min-w-0 rounded-xl border border-border/70 bg-background/50 px-3 py-3">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
    <p className={`mt-1 truncate text-sm font-semibold ${statusTone(verified)}`}>{verified && <BadgeCheck className="mr-1 inline h-3.5 w-3.5"/>}{value}</p>
    <p className="mt-1 truncate text-[11px] text-muted-foreground" title={detail}>{detail}</p>
  </div>;
}
export function AdminAccountJourney({ input, email, loading, error, browserLoading = false }: {input:AccountJourneyInput;email:string|null;loading:boolean;error:boolean;browserLoading?:boolean}) {
  const moments=buildAccountJourney(input);
  const [expanded, setExpanded]=useState(false);
  const shownMoments=expanded ? moments : moments.slice(0, 8);
  const signup= input.events.find(e=>e.event_name==="signup_completed" && e.source_system==="web");
  const emailStatus=input.auth?.email_confirmed ? "Confirmed" : input.auth ? "Not confirmed" : "Not loaded";
  return <section data-testid="admin-account-journey" className="space-y-4">
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"/>
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary"><Activity className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-[.18em]">Account intelligence</span></div>
          <h4 className="mt-1 text-lg font-semibold tracking-tight">Account journey</h4>
          <p className="max-w-xl text-xs text-muted-foreground">Verified account milestones and observed gameplay in one place. Events without a dependable account ID are deliberately excluded.</p>
        </div>
        <span className="rounded-full border border-border bg-background/70 px-3 py-1 text-[11px] text-muted-foreground">{moments.length} milestones / events</span>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Milestone title="Email" value={email ? emailStatus : "Unavailable"} detail={email || "Owner email lookup unavailable"} verified={!!email && !!input.auth?.email_confirmed}/>
        <Milestone title="Discord" value={input.discord?.verifiedAt ? "Verified" : input.discord ? "Not verified" : "Not linked"} detail={input.discord?.label || "No verified link"} verified={!!input.discord?.verifiedAt}/>
        <Milestone title="Riot ID" value={input.riot?.verifiedAt ? "Verified" : input.riot ? "Not verified" : "Not linked"} detail={input.riot?.label || "No verified link"} verified={!!input.riot?.verifiedAt}/>
        <Milestone title="Premium" value={input.effectivePremium ? "Active" : "No entitlement"} detail={input.effectivePremium ? input.premiumSource : "No active entitlement"} verified={input.effectivePremium}/>
      </div>
      <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3"/>Auth created: {stamp(input.auth?.created_at || input.profileCreatedAt)}</span>
        {signup && <span className="inline-flex items-center gap-1"><CircleDot className="h-3 w-3"/>Signup event: {stamp(signup.received_at)}</span>}
        {input.auth?.email_confirmed_at && <span className="inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3"/>Email confirmed: {stamp(input.auth.email_confirmed_at)}</span>}
      </div>
    </div>
    <section data-testid="account-acquisition" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary"/>
        <div>
          <h4 className="text-sm font-semibold">Acquisition context</h4>
          <p className="text-[11px] text-muted-foreground">Deterministically associated first-party browser IDs. A browser can be shared; this is not proof of a person's first visit.</p>
        </div>
      </div>
      {input.linkedBrowserError && <p role="alert" className="mb-3 text-xs text-amber-400">Browser association lookup failed; acquisition information is incomplete.</p>}
      {browserLoading
        ? <p role="status" className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Loading browser associations…</p>
        : !input.linkedBrowsers?.length
          ? <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">No deterministic browser association recorded. Source unknown, not necessarily direct.</p>
          : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {input.linkedBrowsers.map(browser => (
            <div key={browser.visitorId} className="rounded-lg border border-border/70 bg-background/50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Browser acquisition</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="min-w-0 break-all text-sm font-semibold">{browser.source || "Unknown source"}</span>
                {browser.campaign && <span title={browser.campaign} className="max-w-full truncate rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">{browser.campaign}</span>}
              </div>
              <p className="mt-1 break-all text-[11px] text-muted-foreground">Landing: {browser.landing || "Unknown"} · First browser visit: {browser.firstSeenAt ? stamp(browser.firstSeenAt) : "Unknown"}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">Visitor {browser.visitorId.slice(0,8)}… · Linked {stamp(browser.firstObservedAt)}</p>
            </div>
          ))}
        </div>}
    </section>
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Timeline</h4>
          <p className="text-[11px] text-muted-foreground">Newest first · bounded account-linked records only</p>
        </div>
        {loading && <span role="status" className="text-xs text-muted-foreground">Loading account activity…</span>}
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-300">Some activity could not be loaded. This timeline is incomplete.</p>}
      {moments.length===0 ? <p className="py-7 text-center text-sm text-muted-foreground">No account-linked history available.</p> : <ol className="space-y-0" data-testid="account-timeline">
        {shownMoments.map((m: JourneyMoment, index) => {
          const Icon = icons[m.kind];
          return <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < shownMoments.length-1 && <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px bg-border"/>}
            <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${tone[m.kind]}`}><Icon className="h-3.5 w-3.5"/></div>
            <div className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background/30 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-0.5">
                <p className="text-xs font-semibold text-foreground">{m.title}</p>
                <time className="text-[10px] tabular-nums text-muted-foreground" dateTime={m.at}>{stamp(m.at)}</time>
              </div>
              <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{m.detail}</p>
              {m.authority==="legacy" && <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-500"><ShieldAlert className="h-3 w-3"/>Legacy ledger, payment unverified</span>}
            </div>
          </li>;
        })}
      </ol>}
      {moments.length > 8 && <button type="button" data-testid="account-timeline-expand"
        className="mt-3 w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={() => setExpanded(value => !value)}>
        {expanded ? "Show recent activity only" : `Show all ${moments.length} account events`}
      </button>}
    </div>
  </section>;
}

export function AccountOperationsPulse({ values, loading }:{
 values: {registered:number;bots:number;knownQa:number;discord:number;riot:number;premium:number;active7d:number};
 loading:boolean;
}) {
 const entries=[
  {label:"Email accounts",value:values.registered,icon:UserRoundCheck,caption:"Permanent · QA may be included"},
  {label:"Active in 7 days",value:values.active7d,icon:Activity,caption:"Profile last-seen signal"},
  {label:"Known QA emails",value:values.knownQa,icon:ShieldAlert,caption:"Recognized test address pattern"},
  {label:"Discord connected",value:values.discord,icon:MessageCircle,caption:"Verified identity links"},
  {label:"Riot connected",value:values.riot,icon:Gamepad2,caption:"Verified identity links"},
  {label:"Premium access",value:values.premium,icon:Crown,caption:"Includes legitimate grants"},
 ];
 return <section data-testid="admin-accounts-operations-pulse" className="overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
     <div className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Audience · Accounts</div>
     <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Your player community</h3>
     <p className="mt-1 text-xs text-muted-foreground">Permanent accounts first. Anonymous guests and bots excluded; QA email accounts remain included and are labeled separately.</p>
   </div>
   <span className="rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground">{values.bots} bot account{values.bots===1?"":"s"} excluded</span>
  </div>
  <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
   {entries.map(({label,value,icon:Icon,caption})=><div key={label} className="rounded-xl border border-border/70 bg-background/50 px-3 py-3">
    <div className="flex items-center justify-between text-muted-foreground"><span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span><Icon className="h-4 w-4 text-primary/75"/></div>
    <div className="mt-2 text-2xl font-bold tabular-nums">{loading?"—":value}</div>
    <p className="mt-1 text-[10px] text-muted-foreground">{caption}</p>
   </div>)}
  </div>
 </section>;
}
