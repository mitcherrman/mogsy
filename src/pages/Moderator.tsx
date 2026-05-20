import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminCollections from "@/components/admin/AdminCollections";
import AdminBots from "@/components/admin/AdminBots";
import AdminComments from "@/components/admin/AdminComments";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminEloCheck from "@/components/admin/AdminEloCheck";

const modTabs = [
  { value: "users", label: "Users" },
  { value: "collections", label: "Collections" },
  { value: "bots", label: "Bots" },
  { value: "comments", label: "Comments" },
  { value: "invite-links", label: "Invites" },
  { value: "elo-check", label: "Aura Check" },
];

const TABS_PER_PAGE = 4;

export default function Moderator() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [tabPage, setTabPage] = useState(0);

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

  const totalPages = Math.ceil(modTabs.length / TABS_PER_PAGE);
  const paginatedTabs = modTabs.slice(tabPage * TABS_PER_PAGE, (tabPage + 1) * TABS_PER_PAGE);

  return (
    <div className="min-h-dvh px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
          <ShieldCheck className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">Moderator</h1>
          <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded-full">Mod</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => navigate("/admin/demo")}
              className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
            >
              Demo
            </button>
            <button
              onClick={() => navigate("/admin/play")}
              className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
            >
              Play Layout
            </button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3 sm:mt-6 space-y-3 sm:space-y-6">
          <div className="flex items-center gap-1">
            {tabPage > 0 && (
              <button
                onClick={() => setTabPage(p => p - 1)}
                className="shrink-0 flex items-center justify-center h-8 w-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <TabsList className="flex-1 flex gap-1 h-auto bg-transparent p-0">
              {paginatedTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 min-w-0 text-[10px] sm:text-sm px-1 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-border bg-card hover:bg-secondary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary font-semibold transition-all truncate"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabPage < totalPages - 1 && (
              <button
                onClick={() => setTabPage(p => p + 1)}
                className="shrink-0 flex items-center justify-center h-8 w-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <TabsContent value="users"><AdminUsers isMasterAdmin={false} /></TabsContent>
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
