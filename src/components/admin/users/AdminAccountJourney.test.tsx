import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AdminAccountJourney, AccountOperationsPulse } from "./AdminAccountJourney";
import type { AccountJourneyInput } from "@/lib/admin/account-journey";

const input: AccountJourneyInput = {
  profileCreatedAt:"2026-10-14T12:00:00Z",lastSeenAt:"2026-10-18T12:00:00Z",
  auth:{created_at:"2026-10-14T12:00:00Z",email_confirmed:true,
    email_confirmed_at:"2026-10-17T12:00:00Z",last_sign_in_at:null,is_anonymous:false},
  discord:{provider:"discord",verifiedAt:"2026-10-17T14:00:00Z",label:"Example#0001"},
  riot:null,
  effectivePremium:false,premiumSource:"Free",premiumGrantedAt:null,premiumAcquiredAt:null,
  stripeStatus:null,stripeSubscriptionId:null,
  events:[{event_name:"ranked_started",received_at:"2026-10-18T11:00:00Z",source_system:"railway"}],
  matches:[], purchases:[{id:"purchase-1",created_at:"2026-10-17T18:00:00Z",item_type:"pro_subscription",status:"completed"}],
  linkedBrowsers:[{visitorId:"browser-a",firstSeenAt:"2026-10-14T10:00:00Z",firstObservedAt:"2026-10-15T10:00:00Z",source:"youtube",landing:"/lol",campaign:"creator_launch"}],
};
afterEach(cleanup);
describe("owner account intelligence",()=>{
 it("shows verified email and Discord, Riot unlinked, Premium not implied from legacy purchase",()=>{
   render(<AdminAccountJourney input={input} email="qa@example.test" loading={false} error={false}/>);
   expect(screen.getByTestId("admin-account-journey")).toHaveTextContent("Confirmed");
   expect(screen.getByTestId("admin-account-journey")).toHaveTextContent("Example#0001");
   expect(screen.getByTestId("admin-account-journey")).toHaveTextContent("Not linked");
   expect(screen.getByTestId("admin-account-journey")).toHaveTextContent("No entitlement");
   expect(screen.getByTestId("account-timeline")).toHaveTextContent("Legacy ledger");
   expect(screen.getByTestId("account-timeline")).toHaveTextContent("payment unverified");
   expect(screen.getByTestId("account-timeline")).toHaveTextContent("Ranked-engine round started");
   expect(screen.getByTestId("account-acquisition")).toHaveTextContent("youtube");
   expect(screen.getByTestId("account-acquisition")).toHaveTextContent("creator_launch");
   expect(screen.getByTestId("account-acquisition")).toHaveTextContent("browser can be shared");
 });
 it("does not claim email verification when owner-authorized auth read has not loaded",()=>{
   render(<AdminAccountJourney input={{...input,auth:null,discord:null,purchases:[],events:[]}} email="qa@example.test" loading error/>);
   expect(screen.getByTestId("admin-account-journey")).toHaveTextContent("Not loaded");
   expect(screen.getByRole("alert")).toHaveTextContent("timeline is incomplete");
   expect(screen.getByTestId("account-timeline")).toHaveTextContent("Profile created");
 });
 it("starts with recent history but lets the owner inspect all bounded records",()=>{
   const longEvents=Array.from({length:20},(_,i)=>({
     event_name:"ranked_started",received_at:new Date(Date.parse("2026-10-18T12:00:00Z")-i*60000).toISOString(),
     source_system:"railway",
   }));
   render(<AdminAccountJourney input={{...input,events:longEvents}} email="qa@example.test" loading={false} error={false}/>);
   expect(screen.getByTestId("account-timeline").querySelectorAll("li")).toHaveLength(8);
   fireEvent.click(screen.getByTestId("account-timeline-expand"));
   expect(screen.getByTestId("account-timeline").querySelectorAll("li").length).toBeGreaterThan(20);
   fireEvent.click(screen.getByTestId("account-timeline-expand"));
   expect(screen.getByTestId("account-timeline").querySelectorAll("li")).toHaveLength(8);
 });
 it("exposes accurate profile counts without billing guesses",()=>{
   render(<AccountOperationsPulse loading={false} values={{registered:7,bots:1,knownQa:2,verifiedEmails:5,emailCoverage:6,discord:0,riot:0,premium:1,active7d:3}}/>);
   expect(screen.getByTestId("admin-accounts-operations-pulse")).toHaveTextContent("Permanent accounts");
   expect(screen.getByTestId("admin-accounts-operations-pulse")).toHaveTextContent("7");
   expect(screen.getByTestId("admin-accounts-operations-pulse")).toHaveTextContent("1 bot account excluded");
 });
});
