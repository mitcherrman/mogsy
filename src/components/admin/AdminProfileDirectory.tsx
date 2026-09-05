import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { describePremiumProvenance } from "@/lib/pro/entitlement";
import { Search, ExternalLink } from "lucide-react";
import UserAvatar from "@/components/UserAvatar";
import { useNavigate } from "react-router-dom";

interface DirectoryProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  /** PT1.4: the Stripe-derived half ONLY. Never badge from this alone. */
  is_pro: boolean | null;
  pro_grant_kind: string | null;
  pro_grant_expires_at: string | null;
  is_bot: boolean | null;
  created_at: string;
}

export default function AdminProfileDirectory() {
  const [profiles, setProfiles] = useState<DirectoryProfile[]>([]);
  const [filtered, setFiltered] = useState<DirectoryProfile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      // ADMIN1A: the grant columns are selected because `isEffectivePro`
      // silently reads a row without them as Stripe-only — which badged a
      // comped playtester as Free. Entitlement is composed by the shared
      // helper, never recomputed here.
      .select(
        "id, display_name, avatar_url, is_pro, pro_grant_kind, pro_grant_expires_at, is_bot, created_at",
      )
      .eq("is_anonymous", false)
      .order("created_at", { ascending: false })
      .limit(500);

    const list = (data || []) as DirectoryProfile[];
    setProfiles(list);
    setFiltered(list);
    setLoading(false);
  };

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(profiles);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(profiles.filter(p => (p.display_name || "").toLowerCase().includes(q)));
  }, [search, profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{profiles.length} profiles</p>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => navigate(`/user/${p.id}`)}
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-secondary transition-colors text-left"
          >
            <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden">
              {p.avatar_url && !p.avatar_url.includes("dicebear") ? (
                <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <UserAvatar name={p.display_name || "?"} size="sm" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground truncate">
                  {p.display_name || "Unnamed"}
                </span>
                {(() => {
                  const premium = describePremiumProvenance(p);
                  if (!premium.effectivePremium) return null;
                  return (
                    <span
                      data-testid="directory-premium-badge"
                      data-premium-source={premium.source}
                      title={`Source: ${premium.sourceLabel}`}
                      className="text-[9px] font-bold text-primary bg-primary/10 px-1 py-0.5 rounded"
                    >
                      PREMIUM · {premium.sourceLabel}
                    </span>
                  );
                })()}
                {p.is_bot && (
                  <span className="text-[9px] font-bold text-muted-foreground bg-muted px-1 py-0.5 rounded">BOT</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Joined {new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No profiles found</p>
      )}
    </div>
  );
}