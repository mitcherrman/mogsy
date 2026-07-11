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

export type ChampionVisualMode = "splash";
// Future modes (loading art, transparent cutout, animated video, 3D/WebGL model)
// should be added here and switched on inside the media area only — the outer
// frame, overlay, and controls are mode-agnostic by design.

type Props = {
  championId: string;
  championLabel?: string;
  role?: "attacker" | "defender";
  level?: number;
  mode?: ChampionVisualMode;
  emptyMessage?: string;
  /** Selected skin key for art preview. "default" or undefined = base art. */
  skinKey?: string;
  /** When provided, a compact skin selector is rendered (if 2+ skins). */
  onSkinChange?: (key: string) => void;
  className?: string;
};

export default function ChampionVisual({
  championId,
  championLabel,
  role,
  level,
  mode = "splash",
  emptyMessage,
  skinKey,
  onSkinChange,
  className,
}: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [bucketImageUrl, setBucketImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
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

  // reset fade whenever the resolved art changes
  useEffect(() => {
    setImgLoaded(false);
  }, [imageUrl]);

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

  const roleTone =
    role === "attacker"
      ? "border-primary/40"
      : role === "defender"
        ? "border-accent/40"
        : "border-border/60";

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-xl border ${roleTone} bg-gradient-to-b from-muted/20 to-background/70 ${className ?? ""}`}
    >
      {/* Media area — mode-specific content lives inside this box only */}
      <div className="absolute inset-0">
        {mode === "splash" && imageUrl ? (
          <img
            key={imageUrl}
            src={imageUrl}
            alt={championLabel || championId || "Champion"}
            onLoad={() => setImgLoaded(true)}
            className={`h-full w-full ${isIconArt ? "object-contain p-6" : "object-cover object-top"} transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground/70">
            <ImageOff className="h-8 w-8" />
            <span className="px-4 text-center text-xs">
              {championId
                ? "No image available"
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

      {/* Role tag */}
      {role && (
        <div className="absolute left-2 top-2 rounded-md bg-background/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-foreground/80 backdrop-blur-sm">
          {role}
        </div>
      )}

      {/* Admin art controls */}
      {isAdmin && championId && (
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] bg-background/60 backdrop-blur-sm"
            onClick={handlePick}
            disabled={uploading}
            title={bucketImageUrl ? "Replace image (admin)" : "Upload image (admin)"}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
          </Button>
          {bucketImageUrl && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-destructive"
              onClick={handleRemove}
              title="Remove uploaded image (admin)"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {/* Bottom overlay: gradient + name + level + skin */}
      <div className="relative mt-auto bg-gradient-to-t from-background via-background/80 to-transparent px-3 pb-2.5 pt-8">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold leading-tight text-foreground drop-shadow">
              {championLabel || championId || "—"}
            </div>
            {typeof level === "number" && championId && (
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Level {level}
              </div>
            )}
          </div>
          {onSkinChange && championId && skins.length > 1 && (
            <select
              value={skinKey || "default"}
              onChange={(e) => onSkinChange(e.target.value)}
              className="h-6 max-w-[45%] shrink-0 rounded-md border border-border/60 bg-background/70 px-1.5 text-[10px] text-foreground backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
              aria-label="Skin"
            >
              {skins.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
