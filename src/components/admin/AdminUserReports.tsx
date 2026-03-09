import { useState, useEffect } from "react";
import { Flag, CheckCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import UserAvatar from "@/components/UserAvatar";

interface UserReport {
  id: string;
  reporter_profile_id: string;
  reported_profile_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter?: { display_name: string | null; avatar_url: string | null };
  reported?: { display_name: string | null; avatar_url: string | null };
}

export default function AdminUserReports() {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const profileIds = [...new Set(data.flatMap(r => [r.reporter_profile_id, r.reported_profile_id]))];
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, avatar_url")
        .in("id", profileIds);

      const pMap = new Map((profiles || []).map(p => [p.id, p]));
      setReports(data.map(r => ({
        ...r,
        reporter: pMap.get(r.reporter_profile_id) || undefined,
        reported: pMap.get(r.reported_profile_id) || undefined,
      })) as UserReport[]);
    } else {
      setReports([]);
    }
    setLoading(false);
  };

  const resolveReport = async (id: string) => {
    await supabase.from("user_reports").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: "resolved" } : r));
    toast.success("Report resolved");
  };

  if (loading) return <div className="h-20 rounded-xl bg-muted animate-pulse" />;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <Flag className="h-4 w-4" /> User Reports ({reports.filter(r => r.status === "pending").length} pending)
      </h3>
      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No reports</p>
      ) : (
        reports.map(r => (
          <div key={r.id} className={`p-3 rounded-xl border ${r.status === "pending" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <UserAvatar src={r.reported?.avatar_url || null} name={r.reported?.display_name || ""} size="sm" />
                  <span className="text-sm font-bold text-foreground">{r.reported?.display_name || "Unknown"}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === "pending" ? "bg-destructive/20 text-destructive" : "bg-green-500/20 text-green-500"}`}>
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  Reported by {r.reporter?.display_name || "Unknown"} · {r.reason}
                </p>
                {r.details && <p className="text-xs text-foreground/70 bg-muted/50 rounded-lg p-2">{r.details}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              {r.status === "pending" && (
                <Button size="sm" variant="outline" onClick={() => resolveReport(r.id)} className="h-7 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
