import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Megaphone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface League {
  id: string;
  name: string;
  is_promoted?: boolean;
  promoted_brand_name?: string;
  promoted_brand_logo?: string;
  promoted_until?: string;
}

export default function AdminPromotedLeagues() {
  const [allLeagues, setAllLeagues] = useState<League[]>([]);
  const [promotedForm, setPromotedForm] = useState({ league_id: "", brand_name: "", brand_logo: "", days: "30" });

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    const { data } = await supabase.from("leagues").select("id, name, is_promoted, promoted_brand_name, promoted_brand_logo, promoted_until");
    if (data) setAllLeagues(data);
  };

  const handlePromote = async () => {
    if (!promotedForm.league_id) return;
    const until = new Date(Date.now() + parseInt(promotedForm.days) * 86400000).toISOString();
    const { error } = await supabase.from("leagues").update({
      is_promoted: true,
      promoted_brand_name: promotedForm.brand_name || null,
      promoted_brand_logo: promotedForm.brand_logo || null,
      promoted_until: until,
    }).eq("id", promotedForm.league_id);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success("League promoted!");
    setPromotedForm({ league_id: "", brand_name: "", brand_logo: "", days: "30" });
    loadLeagues();
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("leagues").update({
      is_promoted: false, promoted_brand_name: null, promoted_brand_logo: null, promoted_until: null,
    }).eq("id", id);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success("Promotion removed");
    loadLeagues();
  };

  const promoted = allLeagues.filter((l) => l.is_promoted);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Megaphone className="h-4 w-4" /> Promote a League</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">League</Label>
            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={promotedForm.league_id} onChange={(e) => setPromotedForm({ ...promotedForm, league_id: e.target.value })}>
              <option value="">Select a league…</option>
              {allLeagues.filter((l) => !l.is_promoted).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Brand Name</Label><Input value={promotedForm.brand_name} onChange={(e) => setPromotedForm({ ...promotedForm, brand_name: e.target.value })} placeholder="Acme Corp" /></div>
          <div className="space-y-1"><Label className="text-xs">Brand Logo URL</Label><Input value={promotedForm.brand_logo} onChange={(e) => setPromotedForm({ ...promotedForm, brand_logo: e.target.value })} placeholder="https://..." /></div>
          <div className="space-y-1"><Label className="text-xs">Duration (days)</Label><Input type="number" value={promotedForm.days} onChange={(e) => setPromotedForm({ ...promotedForm, days: e.target.value })} /></div>
        </div>
        <Button onClick={handlePromote} className="gap-1.5"><Megaphone className="h-4 w-4" /> Promote</Button>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Active Promotions</h3>
        {promoted.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No promoted leagues yet.</p>
        ) : (
          <div className="space-y-2">
            {promoted.map((league) => (
              <div key={league.id} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card p-4">
                {league.promoted_brand_logo && <img src={league.promoted_brand_logo} alt="" className="h-10 w-10 rounded-lg object-contain bg-secondary p-1" />}
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{league.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {league.promoted_brand_name && `By ${league.promoted_brand_name} · `}
                    Ends {league.promoted_until ? new Date(league.promoted_until).toLocaleDateString() : "N/A"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRemove(league.id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
