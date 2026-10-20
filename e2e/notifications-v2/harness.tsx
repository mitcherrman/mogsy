/**
 * Notifications 2.0 (#92) — browser acceptance harness.
 *
 * Mounts the REAL notification surfaces (the HUD menu, the admin inbox page and
 * the player notifications page) over an in-memory server that implements the
 * v2 RPC semantics (src/test/notifications/inboxServer.ts — the SQL itself is
 * proven separately on Postgres). The server's state is persisted in
 * localStorage, so a reload behaves like a reload against the database, and a
 * second tab's writes arrive as realtime frames via the `storage` event —
 * which is how two devices converge in production.
 *
 * Dev-only (served by `vite --mode e2e`); never part of a production build.
 * ?view=admin | menu | player | sync   ?role=admin | player   ?seed=reset
 */
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@/index.css";
import { supabase } from "@/integrations/supabase/client";
import { createInboxServer, type FakeAdminRow, type FakePlayerRow } from "@/test/notifications/inboxServer";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster as Sonner } from "@/components/ui/sonner";
import MogzyIdentityMenu from "@/components/hud/MogzyIdentityMenu";
import AdminNotifications from "@/components/admin/AdminNotifications";
import Notifications from "@/pages/Notifications";

const params = new URLSearchParams(window.location.search);
const view = params.get("view") ?? "admin";
const role = params.get("role") ?? "admin";
const KEY = "nv2-harness-state";

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

const seedAdmin = (): FakeAdminRow[] => [
  {
    id: "q1", type: "feedback", category: "action", priority: "high", title: "New feedback: Wrong answer on item quiz",
    message: "The answer key says Long Sword gives 40 AD.", subject_type: "feedback", subject_id: "fb-1", created_at: iso(30),
    metadata: { feedback: { entry_intent: "question_report", reason: "incorrect_answer", question_prompt: "Which item gives exactly 40 attack damage?", selected_answer: "Long Sword", canonical_answer: "Pickaxe", has_evidence: true, status: "open" } },
  },
  { id: "c1", type: "comment_report", category: "action", priority: "critical", title: "Comment auto-hidden", message: "A comment received 5 reports and was automatically hidden.", subject_type: "comment", subject_id: "cm-1", occurrence_count: 5, created_at: iso(90) },
  { id: "u1", type: "user_report", category: "action", priority: "high", title: "User reported", message: "Reason: harassment", subject_type: "user_report", subject_id: "ur-1", created_at: iso(60 * 24 * 40) },
  { id: "s1", type: "feedback", category: "community", priority: "normal", title: "New feedback: Add a dark parchment theme", subject_type: "feedback", subject_id: "fb-2", created_at: iso(200), metadata: { feedback: { entry_intent: "feature", status: "open" } } },
  { id: "s2", type: "feedback", category: "community", priority: "normal", title: "New feedback: More Ranked modes", subject_type: "feedback", subject_id: "fb-3", created_at: iso(400), is_read: true },
  { id: "p1", type: "system_notice", category: "platform", priority: "low", title: "Nightly content refresh finished", created_at: iso(600) },
  { id: "r1", type: "user_report", category: "action", priority: "high", title: "User reported (handled)", subject_type: "user_report", subject_id: "ur-0", created_at: iso(60 * 24 * 3), resolved_at: iso(60 * 24 * 2), resolution: "resolved_report" },
];

const seedPlayer = (): FakePlayerRow[] => [
  { id: "f1", type: "friend_request", title: "Ana sent you a friend request", created_at: iso(5), metadata: { requester_profile_id: "p-ana" } },
  { id: "b1", type: "feedback_update", title: "Update on your report: Resolved", message: "\"Wrong answer on item quiz\" is now Resolved.", action_url: "/feedback", created_at: iso(45) },
  { id: "a1", type: "update", title: "Patch 26.20 is live", message: "New items and balance changes.", created_at: iso(120) },
  { id: "w1", type: "warning", title: "Account notice: confirm your email", created_at: iso(240) },
];

const server = createInboxServer();
type Persisted = { admin: FakeAdminRow[]; player: FakePlayerRow[]; muted: string[] };
const load = (): Persisted | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = () => localStorage.setItem(KEY, JSON.stringify({ admin: server.admin, player: server.player, muted: server.muted }));
const restore = (state: Persisted | null) => {
  server.admin = state?.admin ?? seedAdmin();
  server.player = state?.player ?? seedPlayer();
  server.muted = state?.muted ?? [];
};
restore(params.get("seed") === "reset" ? null : load());
save();

// Writes persist; every RPC re-reads persisted state first so another tab's
// writes are honoured exactly like rows in a shared database.
const rpc = server.client.rpc;
server.client.rpc = async (name: string, args?: Record<string, unknown>) => {
  restore(load());
  const result = await rpc(name, args);
  save();
  return result;
};
// Another tab wrote: deliver it as realtime would.
window.addEventListener("storage", e => {
  if (e.key !== KEY) return;
  restore(load());
  server.emit("admin_notification_states", "UPDATE", {});
  server.emit("user_notification_states", "UPDATE", {});
});

// Swap the client's data methods for the in-memory server. Auth stays real but
// is driven by the dev-only E2E persona (VITE_E2E_AUTH), so nothing here can
// reach a Supabase project.
Object.assign(supabase, {
  rpc: server.client.rpc,
  from: server.client.from,
  channel: server.client.channel,
  removeChannel: server.client.removeChannel,
});
Object.assign(window, { __inbox: server });

localStorage.setItem(
  "mogsy_e2e_identity",
  JSON.stringify({
    token: "e2e-harness",
    user: { id: role === "admin" ? "admin-a" : "player-a", email: null, is_anonymous: false },
    admin: role === "admin",
  }),
);

function Harness() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {(view === "menu" || view === "sync") && (
        <header className="flex justify-end border-b border-border px-3 py-2" data-testid="harness-header">
          <MogzyIdentityMenu />
        </header>
      )}
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
        {(view === "admin" || view === "sync") && <AdminNotifications />}
        {view === "player" && <Notifications />}
      </main>
      <Sonner />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <Harness />
    </AuthProvider>
  </BrowserRouter>,
);
