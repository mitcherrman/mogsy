import { useEffect, useRef, useState } from "react";
import { Upload, ImageOff, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useChampionAssets,
  getChampionSplash,
  getChampionLoading,
  getChampionIcon,
  getChampionSkins,
} from "@/hooks/useChampionAssets";

const BUCKET = "champion-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

type Props = {
  championId: string;
  championLabel?: string;
  role?: "attacker" | "defender";
  level?: number;
  items?: string[];
  emptyMessage?: string;
  /** Selected skin key for art preview. "default" or undefined = base art. */
  skinKey?: string;
  /** When provided, a compact skin selector is rendered (if 2+ skins). */
  onSkinChange?: (key: string) => void;
};

export default function ChampionProfile({
  championId,
  championLabel,
  role,
  level,
  items,
  emptyMessage,
  skinKey,
  onSkinChange,
}: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [bucketImageUrl, setBucketImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: manifest } = useChampionAssets();

  // Manifest-resolved art with priority: skin splash → skin loading → default
  // splash → default loading → icon. Falls back to bucket image, then placeholder.
  const manifestSplash = getChampionSplash(manifest, championId, skinKey);
  const manifestLoading = getChampionLoading(manifest, championId, skinKey);
  const manifestIcon = getChampionIcon(manifest, championId, skinKey);
  const manifestUrl = manifestSplash || manifestLoading || manifestIcon || null;
  const imageUrl = manifestUrl || bucketImageUrl;
  const isIconArt = !manifestSplash && !manifestLoading && !!manifestIcon;
  const skins = getChampionSkins(manifest, championId);

  // admin check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin" as any)
        .maybeSingle();
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // load bucket fallback image whenever champion changes
  useEffect(() => {
    let cancelled = false;
    setBucketImageUrl(null);
    if (!championId) return;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("champion_images")
        .select("storage_path")
        .eq("champion_id", championId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.storage_path) {
        setBucketImageUrl(null);
        setLoading(false);
        return;
      }
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.storage_path, SIGNED_URL_TTL);
      if (cancelled) return;
      setBucketImageUrl(signed?.signedUrl ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [championId]);

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !championId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please choose an image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const safeId = championId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const path = `${safeId}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // fetch existing to clean up old file
      const { data: existing } = await supabase
        .from("champion_images")
        .select("storage_path")
        .eq("champion_id", championId)
        .maybeSingle();

      const { data: { user } } = await supabase.auth.getUser();
      const { error: dbErr } = await supabase
        .from("champion_images")
        .upsert({
          champion_id: championId,
          storage_path: path,
          updated_by: user?.id ?? null,
        });
      if (dbErr) throw dbErr;

      if (existing?.storage_path && existing.storage_path !== path) {
        await supabase.storage.from(BUCKET).remove([existing.storage_path]);
      }

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      setBucketImageUrl(signed?.signedUrl ?? null);
      toast({ title: "Image uploaded", description: championLabel || championId });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!championId) return;
    const { data: existing } = await supabase
      .from("champion_images")
      .select("storage_path")
      .eq("champion_id", championId)
      .maybeSingle();
    if (!existing) return;
    await supabase.from("champion_images").delete().eq("champion_id", championId);
    if (existing.storage_path) {
      await supabase.storage.from(BUCKET).remove([existing.storage_path]);
    }
    setBucketImageUrl(null);
    toast({ title: "Image removed" });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {role === "attacker"
            ? "Attacker Profile"
            : role === "defender"
              ? "Defender Profile"
              : "Champion Profile"}
        </div>
        {isAdmin && bucketImageUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive"
            onClick={handleRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="relative flex-1 min-h-[160px] max-h-[220px] bg-gradient-to-br from-muted/30 to-muted/5">
        {loading && !imageUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={championLabel || championId || "Champion"}
            className={`absolute inset-0 h-full w-full ${isIconArt ? "object-contain p-4" : "object-cover"}`}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/70">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">
              {championId
                ? "No image uploaded"
                : emptyMessage ||
                  (role === "attacker"
                    ? "Select an attacker"
                    : role === "defender"
                      ? "Select a defender"
                      : "Select a champion")}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium truncate">
            {championLabel || championId || "—"}
          </div>
          {typeof level === "number" && championId && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lv {level}
            </span>
          )}
        </div>
        {items && items.length > 0 && championId && (
          <div className="mt-1.5 text-[11px] text-muted-foreground truncate" title={items.join(", ")}>
            {items.slice(0, 3).join(", ")}
            {items.length > 3 ? ` +${items.length - 3}` : ""}
          </div>
        )}
        {onSkinChange && championId && skins.length > 1 && (
          <div className="mt-2">
            <select
              value={skinKey || "default"}
              onChange={(e) => onSkinChange(e.target.value)}
              className="h-7 w-full rounded-md border border-border/60 bg-background/60 px-2 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              aria-label="Skin"
            >
              {skins.map((s) => (
                <option key={s.key} value={s.key}>
                  Skin · {s.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {isAdmin && championId && (
          <div className="mt-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-full text-xs"
              onClick={handlePick}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {bucketImageUrl ? "Replace image" : "Upload image"}
            </Button>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Admin only · max 5MB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}