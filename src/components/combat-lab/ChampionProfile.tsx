import { useEffect, useRef, useState } from "react";
import { Upload, ImageOff, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "champion-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

type Props = {
  championId: string;
  championLabel?: string;
};

export default function ChampionProfile({ championId, championLabel }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  // load image whenever champion changes
  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
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
        setImageUrl(null);
        setLoading(false);
        return;
      }
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.storage_path, SIGNED_URL_TTL);
      if (cancelled) return;
      setImageUrl(signed?.signedUrl ?? null);
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
      setImageUrl(signed?.signedUrl ?? null);
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
    setImageUrl(null);
    toast({ title: "Image removed" });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Champion Profile
        </div>
        {isAdmin && imageUrl && (
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

      <div className="relative flex-1 min-h-[240px] bg-gradient-to-br from-muted/30 to-muted/5">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={championLabel || championId || "Champion"}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/70">
            <ImageOff className="h-8 w-8" />
            <span className="text-xs">
              {championId ? "No image uploaded" : "Select a champion"}
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 px-4 py-3">
        <div className="text-sm font-medium">
          {championLabel || championId || "—"}
        </div>
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
              {imageUrl ? "Replace image" : "Upload image"}
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