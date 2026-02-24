import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminStats from "@/components/admin/AdminStats";
import AdminSettings from "@/components/admin/AdminSettings";
import AdminCollections from "@/components/admin/AdminCollections";
import AdminBots from "@/components/admin/AdminBots";
import AdminPromotedLeagues from "@/components/admin/AdminPromotedLeagues";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminEloCheck from "@/components/admin/AdminEloCheck";
import AdminComments from "@/components/admin/AdminComments";
import AdminInviteLinks from "@/components/admin/AdminInviteLinks";
import AdminAds from "@/components/admin/AdminAds";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMasterAdmin, setIsMasterAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

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

    // Fetch unread notification count
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false)
      .then(({ count }) => {
        setUnreadCount(count || 0);
      });
  }, [user]);

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-7 w-7 text-accent-foreground" />
          <h1 className="text-3xl font-extrabold text-foreground">Admin Panel</h1>
          {isMasterAdmin && (
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Master</span>
          )}
        </div>

        <AdminStats />

        <Tabs defaultValue="notifications" className="mt-6 space-y-6">
          <TabsList className="bg-secondary flex-wrap">
            <TabsTrigger value="notifications" className="relative">
              Alerts
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="bots">Bots</TabsTrigger>
            <TabsTrigger value="promoted">Promoted</TabsTrigger>
            <TabsTrigger value="elo-check">Elo Check</TabsTrigger>
            <TabsTrigger value="comments">Comments</TabsTrigger>
            <TabsTrigger value="invite-links">Invite Links</TabsTrigger>
            <TabsTrigger value="ads">Ads</TabsTrigger>
            {isMasterAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
          </TabsList>

          <TabsContent value="notifications"><AdminNotifications onReadChange={(count) => setUnreadCount(count)} /></TabsContent>
          <TabsContent value="users"><AdminUsers isMasterAdmin={isMasterAdmin} /></TabsContent>
          <TabsContent value="collections"><AdminCollections /></TabsContent>
          <TabsContent value="bots"><AdminBots /></TabsContent>
          <TabsContent value="promoted"><AdminPromotedLeagues /></TabsContent>
          <TabsContent value="elo-check"><AdminEloCheck /></TabsContent>
          <TabsContent value="comments"><AdminComments /></TabsContent>
          <TabsContent value="invite-links"><AdminInviteLinks /></TabsContent>
          <TabsContent value="ads"><AdminAds /></TabsContent>
          {isMasterAdmin && <TabsContent value="settings"><AdminSettings /></TabsContent>}
        </Tabs>
      </div>
    </div>
  );
}
