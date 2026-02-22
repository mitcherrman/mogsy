import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function AdminSettings() {
  const [requireAuth, setRequireAuth] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .eq("key", "require_auth")
      .single()
      .then(({ data }) => {
        if (data) setRequireAuth((data.value as any)?.enabled ?? true);
        setLoading(false);
      });
  }, []);

  const toggle = async (checked: boolean) => {
    setRequireAuth(checked);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: { enabled: checked }, updated_at: new Date().toISOString() })
      .eq("key", "require_auth");
    if (error) {
      toast.error("Failed to update setting");
      setRequireAuth(!checked);
      return;
    }
    toast.success(checked ? "Auth required — users must sign up" : "Auth disabled — guests can browse");
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-foreground flex items-center gap-2">
        <Settings2 className="h-4 w-4" /> App Settings
      </h3>
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div>
          <Label className="text-sm font-medium">Require Account Sign-Up</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            When off, users can browse without creating an account
          </p>
        </div>
        <Switch checked={requireAuth} onCheckedChange={toggle} />
      </div>
    </div>
  );
}
