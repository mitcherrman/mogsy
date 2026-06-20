import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { HexPopoutStyle } from "./HexZipperCard";

type Props = {
  value: HexPopoutStyle;
  onChange: (next: HexPopoutStyle) => void;
};

/**
 * Admin-only floating segmented pill that switches the LoL Hub champion
 * popout style globally. Persisted in app_settings under the
 * `lol_hub_popout_style` key. Optimistically updates the parent and reverts
 * with a toast if the write fails.
 */
export default function LolPopoutStyleToggle({ value, onChange }: Props) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    (async () => {
      for (const role of ["admin", "master_admin"] as const) {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: role,
        });
        if (cancelled) return;
        if (!error && data === true) {
          setIsAdmin(true);
          return;
        }
      }
      if (!cancelled) setIsAdmin(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!isAdmin) return null;

  const set = async (next: HexPopoutStyle) => {
    if (next === value || saving) return;
    const prev = value;
    onChange(next);
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "lol_hub_popout_style", value: { style: next } },
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) {
      onChange(prev);
      toast.error("Couldn't save popout style");
    } else {
      toast.success(`Popout style: ${next}`);
    }
  };

  const Btn = ({ k, label }: { k: HexPopoutStyle; label: string }) => (
    <button
      type="button"
      onClick={() => set(k)}
      disabled={saving}
      className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
        value === k
          ? "bg-[#0ac8ff]/20 text-[#0ac8ff]"
          : "text-[#a09b8c] hover:text-[#f0e6d2]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-0 rounded-full border border-[#c9a84c]/40 bg-[#0a1428]/95 backdrop-blur-md shadow-[0_0_20px_rgba(10,200,255,0.25)] overflow-hidden">
      <span className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]/80 border-r border-[#c9a84c]/30">
        Admin
      </span>
      <Btn k="splash" label="Splash" />
      <Btn k="cutout" label="Cutout" />
    </div>
  );
}