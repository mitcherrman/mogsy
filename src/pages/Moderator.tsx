// ---------------------------------------------------------------------------
// Moderator panel.
//
// PRESERVED, NOT DISSOLVED. The Admin Architecture reorganization deliberately
// does not fold /moderator into the unified Admin shell:
//
//   * Narrowing the panel to the subset moderator RLS actually grants would be
//     a visible behaviour change for every real moderator. Whether the UI was
//     over-promising or RLS is too tight is a product decision, not a
//     navigation one — so nothing here is narrowed.
//   * Rendering the full Admin area rail for a moderator would advertise
//     destinations their role cannot open.
//
// What DID change: it adopts the shell's navigation idiom — one flat tab strip
// instead of four-of-five pagination. Same five tabs, same components, same
// route, same gate, same capabilities. Users is absent exactly as Admin Users
// Phase 1 left it, and is not restored.
//
// AUTHORIZATION: byte-for-byte the same check as before — AdminRoute
// (moderator, admin, master_admin) at the route, plus this page's own
// user_roles read. No RLS, role or permission change of any kind.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminCollections from "@/components/admin/AdminCollections";
import AdminBots from "@/components/admin/AdminBots";
import AdminComments from "@/components/admin/AdminComments";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminEloCheck from "@/components/admin/AdminEloCheck";
import { cn } from "@/lib/utils";

const modTabs = [
  { value: "collections", label: "Collections" },
  { value: "bots", label: "Bots" },
  { value: "comments", label: "Comments" },
  { value: "invite-links", label: "Invites" },
  { value: "elo-check", label: "Aura Check" },
];

export default function Moderator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("collections");

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) {
          navigate("/");
          toast.error("Access denied");
          return;
        }
        const roles = data.map((r) => r.role as string);
        const hasMod = roles.includes("moderator") || roles.includes("admin") || roles.includes("master_admin");
        if (!hasMod) {
          navigate("/");
          toast.error("Access denied");
          return;
        }
        setAuthorized(true);
        setLoading(false);
      });
  }, [user]);

  if (loading || !authorized) {
    return <div className="min-h-dvh bg-background" />;
  }

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8" data-testid="moderator-panel">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
          <ShieldCheck className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          <h1 className="text-xl font-extrabold text-foreground sm:text-2xl">Moderator</h1>
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary sm:px-2 sm:text-xs">
            Mod
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => navigate("/admin/demo")}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 sm:text-xs"
            >
              Demo
            </button>
            <button
              onClick={() => navigate("/admin/play")}
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 sm:text-xs"
            >
              Play Layout
            </button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-6">
          {/* One flat strip. The paginated four-of-five strip this replaces was
              the same mechanism that buried tools on the legacy dashboard; no
              tab was added or removed. */}
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {modTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                data-testid={`moderator-tab-${tab.value}`}
                className={cn(
                  "rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors",
                  "hover:bg-secondary hover:text-foreground sm:text-sm",
                  "data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground",
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="collections"><AdminCollections /></TabsContent>
          <TabsContent value="bots"><AdminBots /></TabsContent>
          <TabsContent value="comments"><AdminComments /></TabsContent>
          <TabsContent value="invite-links"><AdminInviteLinks /></TabsContent>
          <TabsContent value="elo-check"><AdminEloCheck /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
