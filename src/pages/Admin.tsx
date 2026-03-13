import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, ChevronRight, ChevronLeft, Bell, Download, BarChart3, Gamepad2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminStats from "@/components/admin/AdminStats";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminRankSettings from "@/components/admin/AdminRankSettings";
import AdminCollections from "@/components/admin/AdminCollections";
import AdminBots from "@/components/admin/AdminBots";
import AdminPromotedLeagues from "@/components/admin/AdminPromotedLeagues";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminComments from "@/components/admin/AdminComments";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminBanners from "@/components/admin/AdminBanners";
import AdminPushNotifications from "@/components/admin/AdminPushNotifications";
import AdminThemes from "@/components/admin/AdminThemes";
import AdminOnboarding from "@/components/admin/AdminOnboarding";
import AdminMultiplayer from "@/components/admin/AdminMultiplayer";
import AdminTutorialTips from "@/components/admin/AdminTutorialTips";
import AdminUserReports from "@/components/admin/AdminUserReports";
import AdminFeedback from "@/components/admin/AdminFeedback";
import AdminModeratorConfig from "@/components/admin/AdminModeratorConfig";
import { exportAdminCSV } from "@/lib/admin-csv-export";

const allTabs = [
  { value: "users", label: "Users", masterOnly: false },
  { value: "collections", label: "Collections", masterOnly: false },
  { value: "bots", label: "Bots", masterOnly: false },
  { value: "promoted", label: "Promoted", masterOnly: false },
  { value: "comments", label: "Comments", masterOnly: false },
  { value: "invite-links", label: "Invites", masterOnly: false },
  { value: "push", label: "Push", masterOnly: false },
  { value: "banners", label: "Banners", masterOnly: false },
  { value: "reports", label: "Reports", masterOnly: false },
  { value: "tutorials", label: "Tutorials", masterOnly: false },
  { value: "feedback", label: "Feedback", masterOnly: false },
  { value: "mod-config", label: "Mod Config", masterOnly: false },
  { value: "themes", label: "Themes", masterOnly: true },
  { value: "ranks", label: "Ranks", masterOnly: true },
  { value: "onboard", label: "Onboard", masterOnly: true },
  { value: "settings", label: "Settings", masterOnly: true },
];

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState("users");
  const [csvExporting, setCsvExporting] = useState(false);
  const [tabPage, setTabPage] = useState(0);

  const TABS_PER_PAGE = 4;

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
        const hasAdmin = roles.includes("admin") || roles.includes("master_admin");
        const hasMaster = roles.includes("master_admin");
        if (!hasAdmin) {
          navigate("/");
          toast.error("Access denied");
          return;
        }
        setIsAdmin(true);
        setIsMasterAdmin(hasMaster);
        setLoading(false);
      });

    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false)
      .then(({ count }) => {
        setUnreadCount(count || 0);
      });
  }, [user]);

  if (loading || !isAdmin) {
    return <div className="min-h-screen" />;
  }

  const visibleTabs = allTabs.filter(t => !t.masterOnly || isMasterAdmin);
  const totalPages = Math.ceil(visibleTabs.length / TABS_PER_PAGE);
  const paginatedTabs = visibleTabs.slice(tabPage * TABS_PER_PAGE, (tabPage + 1) * TABS_PER_PAGE);

  return (
    <div className="min-h-screen px-3 sm:px-4 py-4 sm:py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6">
          <Shield className="h-5 w-5 sm:h-7 sm:w-7 text-accent-foreground" />
          <h1 className="text-xl sm:text-3xl font-extrabold text-foreground">Admin</h1>
          {isMasterAdmin && (
            <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-1.5 sm:px-2 py-0.5 rounded-full">Master</span>
          )}
          {isMasterAdmin && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate("/admin/play")}
                className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
              >
                Play Layout
              </button>
              <button
                onClick={() => navigate("/admin/data")}
                className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
              >
                <BarChart3 className="h-3 w-3" /> Data
              </button>
              <button
                onClick={() => navigate("/admin/demo")}
                className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
              >
                Demo
              </button>
              <button
                onClick={() => navigate("/admin/gaming")}
                className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-primary/30 bg-primary/5 text-primary text-[10px] sm:text-xs font-bold hover:bg-primary/10 transition-colors"
              >
                <Gamepad2 className="h-3 w-3" /> Gaming
              </button>
              <button
                disabled={csvExporting}
                onClick={async () => { setCsvExporting(true); try { await exportAdminCSV(); toast.success("CSV exported"); } catch { toast.error("Export failed"); } finally { setCsvExporting(false); } }}
                className="shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border bg-card text-muted-foreground text-[10px] sm:text-xs font-bold hover:bg-secondary transition-colors disabled:opacity-50"
              >
                <Download className="h-3 w-3" /> {csvExporting ? "..." : "CSV"}
              </button>
            </div>
          )}
          <button
            onClick={() => setActiveTab("notifications")}
            className={`shrink-0 ml-auto flex items-center justify-center h-8 w-8 rounded-lg border transition-colors relative ${
              activeTab === "notifications"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-4 min-w-4 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <AdminStats />

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

          <TabsContent value="notifications"><AdminNotifications onReadChange={(count) => setUnreadCount(count)} /></TabsContent>
          <TabsContent value="users"><AdminUsers isMasterAdmin={isMasterAdmin} /></TabsContent>
          <TabsContent value="collections"><AdminCollections /></TabsContent>
          <TabsContent value="bots"><AdminBots /></TabsContent>
          <TabsContent value="promoted"><AdminPromotedLeagues /></TabsContent>
          <TabsContent value="elo-check"><AdminEloCheck /></TabsContent>
          <TabsContent value="comments"><AdminComments /></TabsContent>
          <TabsContent value="invite-links"><AdminInviteLinks /></TabsContent>
          <TabsContent value="push"><AdminPushNotifications /></TabsContent>
          <TabsContent value="ads"><AdminAds /></TabsContent>
          <TabsContent value="banners"><AdminBanners /></TabsContent>
          <TabsContent value="animations"><AdminCardAnimations /></TabsContent>
          <TabsContent value="sounds"><AdminSounds /></TabsContent>
          <TabsContent value="multiplayer"><AdminMultiplayer /></TabsContent>
          <TabsContent value="reports"><AdminUserReports /></TabsContent>
          <TabsContent value="tutorials"><AdminTutorialTips /></TabsContent>
          <TabsContent value="feedback"><AdminFeedback /></TabsContent>
          <TabsContent value="mod-config"><AdminModeratorConfig /></TabsContent>
          {isMasterAdmin && <TabsContent value="themes"><AdminThemes /></TabsContent>}
          {isMasterAdmin && <TabsContent value="ranks"><AdminRankSettings /></TabsContent>}
          {isMasterAdmin && <TabsContent value="onboard"><AdminOnboarding /></TabsContent>}
          {isMasterAdmin && <TabsContent value="settings"><AdminSettings /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}
