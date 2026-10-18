import { createRoot } from "react-dom/client";
import "@/index.css";
import { AdminAccountJourney, AccountOperationsPulse } from "@/components/admin/users/AdminAccountJourney";
import type { AccountJourneyInput } from "@/lib/admin/account-journey";
const input: AccountJourneyInput = {
 profileCreatedAt:"2026-10-14T10:00:00Z",lastSeenAt:"2026-10-18T09:00:00Z",
 auth:{created_at:"2026-10-14T10:00:00Z",email_confirmed:true,email_confirmed_at:"2026-10-15T09:00:00Z",
       last_sign_in_at:"2026-10-18T09:00:00Z",is_anonymous:false},
 discord:{provider:"discord",label:"ExampleDiscord",verifiedAt:"2026-10-17T10:00:00Z"},
 riot:{provider:"riot",label:"Example#NA1",verifiedAt:"2026-10-18T10:00:00Z"},
 effectivePremium:true,premiumSource:"Playtest grant",premiumGrantedAt:"2026-10-18T11:00:00Z",
 premiumAcquiredAt:null,stripeStatus:null,stripeSubscriptionId:null,
 events:[
  {event_name:"ranked_started",received_at:"2026-10-18T10:30:00Z",source_system:"railway"},
  {event_name:"practice_quiz_opened",received_at:"2026-10-17T10:00:00Z",source_system:"web"},
  {event_name:"signup_completed",received_at:"2026-10-15T09:00:00Z",source_system:"web"},
 ],
 matches:[{id:"game-one",created_at:"2026-10-18T10:45:00Z"}],
 purchases:[{id:"p-one",item_type:"rewinds",status:"completed",created_at:"2026-10-16T10:00:00Z"}],
};
function Demo(){return <main className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-6">
 <AccountOperationsPulse values={{registered:7,bots:1,discord:1,riot:1,premium:1,active7d:4}} loading={false}/>
 <AdminAccountJourney input={input} email="example@mogzy.test" loading={false} error={false}/>
</main>;}
createRoot(document.getElementById("root")!).render(<Demo/>);