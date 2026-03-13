import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gamepad2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminSwipeGameConfig from "@/components/admin/AdminSwipeGameConfig";
import AdminEloCheck from "@/components/admin/AdminEloCheck";
import AdminMultiplayer from "@/components/admin/AdminMultiplayer";
import AdminAds from "@/components/admin/AdminAds";
import AdminCardAnimations from "@/components/admin/AdminCardAnimations";
import AdminSounds from "@/components/admin/AdminSounds";
import AdminLeagueSettings from "@/components/admin/AdminLeagueSettings";

const allTabs = [
  { value: "swipe-games", label: "Swipe Games" },
  { value: "aura-check", label: "Aura Check" },
  { value: "multiplayer", label: "Multiplayer" },
  { value: "league-display", label: "League Display" },
  { value: "ads", label: "Ads" },
  { value: "animations", label: "Animations" },
  { value: "sounds", label: "Sounds" },
];

export default function AdminGaming() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("swipe-games");
  const [tabPage, setTabPage] = useState(0);

  const TABS_PER_PAGE = isMobile ? 3 : 5;

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) {
          navigate("/"); toast.error("Access denied"); return;
        }
        const roles = data.map(r => r.role as string);
        if (!roles.includes("admin") && !roles.includes("master_admin")) {
          navigate("/"); toast.error("Access denied"); return;
        }
        setIsAdmin(true);
        setLoading(false);
      });
  }, [user]);

  if (loading || !isAdmin) return <div className="min-h-screen" />;

  const totalPages = Math.ceil(allTabs.length / TABS_PER_PAGE);
  const paginatedTabs = allTabs.slice(tabPage * TABS_PER_PAGE, (tabPage + 1) * TABS_PER_PAGE);

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
          <button
            onClick={() => navigate("/admin")}
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <Gamepad2 className="h-5 w-5 sm:h-7 sm:w-7 text-primary" />
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">Gaming Config</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-6">
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
              {paginatedTabs.map(tab => (
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

          <TabsContent value="swipe-games"><AdminSwipeGameConfig /></TabsContent>
          <TabsContent value="aura-check"><AdminEloCheck /></TabsContent>
          <TabsContent value="multiplayer"><AdminMultiplayer /></TabsContent>
          <TabsContent value="league-display"><AdminLeagueSettings /></TabsContent>
          <TabsContent value="ads"><AdminAds /></TabsContent>
          <TabsContent value="ad-analytics"><AdminAdAnalytics /></TabsContent>
          <TabsContent value="animations"><AdminCardAnimations /></TabsContent>
          <TabsContent value="sounds"><AdminSounds /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
