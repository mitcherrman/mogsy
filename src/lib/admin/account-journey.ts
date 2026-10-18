/** ADMIN-ACCOUNT-JOURNEY1
 * Render only observed milestones. Never infer a verified account registration
 * from profile.created_at (guest profiles predate upgrades), nor treat a
 * legacy purchases row as proof of Stripe settlement.
 */
export interface AccountActivityEvent {
  event_name: string;
  received_at: string;
  source_system: string;
  route?: string | null;
}
export interface AccountMilestoneIdentity {
  provider: "discord" | "riot";
  verifiedAt: string | null;
  label: string | null;
}
export interface AccountAuthSnapshot {
  email_confirmed: boolean;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_anonymous: boolean;
}
export interface AccountJourneyInput {
  profileCreatedAt: string;
  lastSeenAt: string | null;
  auth: AccountAuthSnapshot | null;
  discord: AccountMilestoneIdentity | null;
  riot: AccountMilestoneIdentity | null;
  effectivePremium: boolean;
  premiumSource: string;
  premiumGrantedAt: string | null;
  premiumAcquiredAt: string | null;
  stripeStatus: string | null;
  stripeSubscriptionId: string | null;
  events: AccountActivityEvent[];
  matches: Array<{ id: string; created_at: string }>;
  purchases: Array<{ id: string; created_at: string; item_type: string; status: string }>;
}
export type JourneyKind = "auth" | "identity" | "premium" | "game" | "interest" | "ledger";
export interface JourneyMoment {
  id: string;
  at: string;
  title: string;
  detail: string;
  kind: JourneyKind;
  authority: "verified" | "observed" | "legacy";
}
const readable = (name: string): string => name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const events: Record<string, { title: string; detail: string; kind: JourneyKind }> = {
  signup_completed: { title: "Signup completion recorded", detail: "Client event, not an independently verified registration timestamp", kind: "auth" },
  signup_offer_clicked: { title: "Signup invitation clicked", detail: "A contextual offer was clicked; not proof of registration", kind: "interest" },
  ranked_started: { title: "Ranked game started", detail: "Server-reported game start", kind: "game" },
  ranked_completed: { title: "Ranked game completed", detail: "Server-reported game completion", kind: "game" },
  practice_quiz_started: { title: "Practice quiz started", detail: "Server-reported quiz start", kind: "game" },
  practice_quiz_completed: { title: "Practice quiz completed", detail: "Server-reported quiz completion", kind: "game" },
  mastery_started: { title: "Mastery activity started", detail: "Server-reported start", kind: "game" },
  mastery_completed: { title: "Mastery activity completed", detail: "Server-reported completion", kind: "game" },
  ranked_opened: { title: "Ranked opened", detail: "Browser open only; not proof of play", kind: "interest" },
  practice_quiz_opened: { title: "Practice opened", detail: "Browser open only; not proof of play", kind: "interest" },
  hub_entered: { title: "League Hub entered", detail: "Browser navigation", kind: "interest" },
};
function validTime(value: string | null | undefined): value is string {
  return !!value && Number.isFinite(Date.parse(value));
}
/** Bounded, most-recent-first event projection; associated user_id events only. */
export function buildAccountJourney(input: AccountJourneyInput): JourneyMoment[] {
  const result: JourneyMoment[] = [];
  const add = (moment: JourneyMoment) => { if (validTime(moment.at)) result.push(moment); };
  add({
    id: "auth-created", at: input.auth?.created_at || input.profileCreatedAt,
    title: "Auth identity created",
    detail: "May predate email signup when this account began as a guest",
    kind: "auth", authority: "verified",
  });
  if (input.auth?.email_confirmed && input.auth.email_confirmed_at) {
    add({ id: "email-confirmed", at: input.auth.email_confirmed_at,
      title: "Email confirmed", detail: "Supabase Auth verification timestamp",
      kind: "auth", authority: "verified" });
  }
  for (const identity of [input.discord, input.riot]) {
    if (!identity?.verifiedAt) continue;
    add({ id: `linked-${identity.provider}`, at: identity.verifiedAt,
      title: `${identity.provider === "riot" ? "Riot" : "Discord"} account verified`,
      detail: identity.label || "Verified linked identity",
      kind: "identity", authority: "verified" });
  }
  if (input.effectivePremium) {
    const at = input.premiumGrantedAt || input.premiumAcquiredAt;
    if (at) add({ id: "premium-record", at, title: "Premium entitlement recorded",
      detail: `Source: ${input.premiumSource}. Not proof of a successful payment.`,
      kind: "premium", authority: "observed" });
  }
  const canonicalServer = new Set(["ranked_started", "ranked_completed", "practice_quiz_started", "practice_quiz_completed", "mastery_started", "mastery_completed"]);
  input.events.forEach((e, i) => {
    const def = events[e.event_name];
    if (!def) return;
    if (canonicalServer.has(e.event_name) && e.source_system !== "railway") return;
    if (!canonicalServer.has(e.event_name) && e.source_system !== "web") return;
    add({ id: `event-${i}`, at: e.received_at, title: def.title,
      detail: def.detail + (e.route ? ` · ${e.route}` : ""),
      kind: def.kind, authority: "observed" });
  });
  input.matches.forEach(m => add({
    id: `match-${m.id}`, at: m.created_at, title: "League match recorded",
    detail: "League match history; no inference about other quiz modes",
    kind: "game", authority: "observed",
  }));
  input.purchases.forEach(p => add({
    id: `ledger-${p.id}`, at: p.created_at,
    title: `Legacy ledger · ${readable(p.item_type)}`,
    detail: `Ledger status: ${p.status}. Not verified Stripe revenue.`,
    kind: "ledger", authority: "legacy",
  }));
  return result.sort((a,b) => Date.parse(b.at) - Date.parse(a.at)).slice(0,80);
}

export function countAccountMilestones(items: Array<{
  is_bot: boolean | null;
  is_anonymous: boolean | null;
  last_seen_at: string | null;
  id: string;
}>, linked: Map<string,{discord: unknown;riot: unknown}>, premium: (id:string)=>boolean, now:number) {
  const real = items.filter(p => !p.is_anonymous && !p.is_bot);
  return {
    registered: real.length,
    bots: items.filter(p => !p.is_anonymous && !!p.is_bot).length,
    discord: real.filter(p => !!linked.get(p.id)?.discord).length,
    riot: real.filter(p => !!linked.get(p.id)?.riot).length,
    premium: real.filter(p => premium(p.id)).length,
    active7d: real.filter(p => validTime(p.last_seen_at) && Date.parse(p.last_seen_at) >= now - 7*86400_000 && Date.parse(p.last_seen_at) <= now).length,
  };
}
