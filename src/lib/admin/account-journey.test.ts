import { describe, expect, it } from "vitest";
import {
  buildAccountJourney, countAccountMilestones,
  type AccountJourneyInput,
} from "./account-journey";

const BASE: AccountJourneyInput = {
  profileCreatedAt: "2026-10-14T09:00:00Z",
  lastSeenAt: "2026-10-18T11:00:00Z",
  auth: { created_at: "2026-10-14T08:00:00Z", email_confirmed: true,
    email_confirmed_at: "2026-10-17T12:00:00Z", is_anonymous: false,
    last_sign_in_at: "2026-10-18T11:00:00Z" },
  discord: { provider: "discord", verifiedAt: "2026-10-18T10:00:00Z", label: "Example Discord" },
  riot: null,
  effectivePremium: false, premiumSource: "Free", premiumGrantedAt: null,
  premiumAcquiredAt: null, stripeStatus: null, stripeSubscriptionId: null,
  events: [
    { event_name: "signup_completed", received_at: "2026-10-17T11:00:00Z", source_system: "web" },
    { event_name: "ranked_started", received_at: "2026-10-17T13:00:00Z", source_system: "railway" },
    { event_name: "ranked_started", received_at: "2026-10-17T14:00:00Z", source_system: "web" },
    { event_name: "practice_quiz_opened", received_at: "2026-10-17T15:00:00Z", source_system: "web" },
  ],
  matches: [{ id: "m1", created_at: "2026-10-17T16:00:00Z" }],
  purchases: [{ id: "p1", created_at: "2026-10-17T17:00:00Z", status: "completed", item_type: "pro_subscription" }],
};

describe("verified account journey projection", () => {
  it("distinguishes permanent email confirmation from a browser signup event and guest account birth", () => {
    const rows = buildAccountJourney(BASE);
    expect(rows.find(x=>x.id==="auth-created")).toMatchObject({
      title: "Auth identity created", authority: "verified", at: "2026-10-14T08:00:00Z",
    });
    expect(rows.find(x=>x.id==="email-confirmed")).toMatchObject({
      title: "Email confirmed", authority: "verified", at: "2026-10-17T12:00:00Z",
    });
    expect(rows.find(x=>x.title==="Signup completion recorded")?.detail).toContain("not an independently verified");
    expect(rows.find(x=>x.title==="Auth identity created")?.detail).toContain("predate email signup");
    expect(rows[0].title).toBe("Discord account verified");
  });

  it("shows only server-authoritative starts and labels web opens as interest", () => {
    const rows = buildAccountJourney(BASE);
    expect(rows.filter(x=>x.title==="Ranked-engine round started")).toHaveLength(1);
    expect(rows.find(x=>x.title==="Practice opened")?.detail).toContain("not proof of play");
  });

  it("never counts the legacy Premium ledger as a verified Stripe payment", () => {
    const rows = buildAccountJourney(BASE);
    expect(rows.find(x=>x.id==="ledger-p1")).toMatchObject({ kind:"ledger", authority:"legacy" });
    expect(rows.find(x=>x.id==="ledger-p1")?.detail).toContain("Not verified Stripe revenue");
    expect(rows.some(x=>x.title==="Premium purchased")).toBe(false);
  });

  it("uses an observed profile date until auth info arrives", () => {
    const rows=buildAccountJourney({ ...BASE, auth:null, discord:null, events:[],matches:[], purchases:[] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({title:"Profile created",authority:"observed"});
  });

  it("excludes malformed dates and caps potentially huge event histories", () => {
    const rows=buildAccountJourney({ ...BASE, events: Array.from({length:240},(_,i)=>({
      event_name:"ranked_started", received_at:i===0?"invalid":"2026-10-18T11:00:00Z",source_system:"railway",
    }))});
    expect(rows.length).toBe(80);
    expect(rows.every(x=>Number.isFinite(Date.parse(x.at)))).toBe(true);
  });
});

describe("account overview cohorts",()=>{
  const profiles=[
    {id:"real1",is_anonymous:false,is_bot:false,last_seen_at:"2026-10-18T09:00:00Z"},
    {id:"real2",is_anonymous:false,is_bot:false,last_seen_at:"2026-09-12T09:00:00Z"},
    {id:"bot",is_anonymous:false,is_bot:true,last_seen_at:"2026-10-18T09:00:00Z"},
    {id:"guest",is_anonymous:true,is_bot:false,last_seen_at:"2026-10-18T09:00:00Z"},
  ];
  it("excludes bots and anonymous auth identities from registered human-signal population",()=>{
    const links=new Map([["real1",{discord:{verifiedAt:"2026-10-18"},riot:null}],["bot",{discord:{},riot:{}}]]);
    expect(countAccountMilestones(profiles,links,id=>id==="real2"||id==="bot",Date.parse("2026-10-18T12:00:00Z"))).toEqual({
      registered:2,bots:1,knownQa:0,discord:1,riot:0,premium:1,active7d:1,
    });
  });
});

describe("known QA email labeling",()=>{
  it("recognizes only the documented release test address prefix",async ()=>{
    const { isKnownQaEmail }=await import("./account-journey");
    expect(isKnownQaEmail("mogzy-launch-qa-9f3@mogzy.lol")).toBe(true);
    expect(isKnownQaEmail("someone@gmail.com")).toBe(false);
    expect(isKnownQaEmail("mogzy-launch-qa-bad@mogzyxlol")).toBe(false);
  });
});

describe("source attribution is first-party browser evidence only",()=>{
  it("uses explicit UTM source before referrer, with safe origin-only fallback",async ()=>{
    const { acquisitionSource } = await import("./account-journey");
    expect(acquisitionSource("youtube","https://m.facebook.com/post")).toBe("youtube");
    expect(acquisitionSource(null,"https://m.facebook.com/path")).toBe("m.facebook.com");
    expect(acquisitionSource(null,"javascript:evil()")).toBeNull();
    expect(acquisitionSource(null,"not a url")).toBeNull();
    expect(acquisitionSource(null,null)).toBeNull();
  });
});
