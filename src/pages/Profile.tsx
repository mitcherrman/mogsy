import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Crown, Zap, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const frameOptions = [
  { id: "default", label: "Default", preview: "" },
  { id: "gold", label: "Gold", preview: "ring-4 ring-yellow-400/60" },
  { id: "neon", label: "Neon", preview: "ring-4 ring-blue-500/60 shadow-[0_0_15px_hsl(210_80%_60%/0.4)]" },
  { id: "fire", label: "Fire", preview: "ring-4 ring-orange-500/60 shadow-[0_0_15px_hsl(25_100%_50%/0.4)]" },
  { id: "diamond", label: "Diamond", preview: "ring-4 ring-cyan-300/60 shadow-[0_0_15px_hsl(180_80%_70%/0.4)]" },
];

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState("default");
  const [boostActive, setBoostActive] = useState(false);
  const [boostCredits, setBoostCredits] = useState(0);
  const [form, setForm] = useState({
    displayName: "",
    age: "",
    location: "",
    statusMessage: "",
    instagram: "",
    tiktok: "",
    youtube: "",
    x: "",
    twitch: "",
    website: "",
  });
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user!.id)
      .single();

    if (profile) {
      setProfileId(profile.id);
      setIsPro(profile.is_pro || false);
      setSelectedFrame(profile.profile_frame || "default");
      setBoostCredits(profile.boost_credits || 0);
      setBoostActive(profile.active_boost_until ? new Date(profile.active_boost_until) > new Date() : false);
      const socials = (profile.socials as any) || {};
      setForm({
        displayName: profile.display_name || "",
        age: profile.age?.toString() || "",
        location: profile.location || "",
        statusMessage: profile.status_message || "",
        instagram: socials.instagram || "",
        tiktok: socials.tiktok || "",
        youtube: socials.youtube || "",
        x: socials.x || "",
        twitch: socials.twitch || "",
        website: socials.website || "",
      });

      const { data: photoData } = await supabase
        .from("profile_photos")
        .select("*")
        .eq("profile_id", profile.id)
        .order("sort_order");
      if (photoData) setPhotos(photoData.map((p) => ({ id: p.id, url: p.url })));
    }
    setLoading(false);
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !profileId || !user) return;
    const file = e.target.files[0];
    const filePath = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("profile-photos").upload(filePath, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(filePath);
    await supabase.from("profile_photos").insert({ profile_id: profileId, url: urlData.publicUrl, sort_order: photos.length });
    setPhotos((prev) => [...prev, { id: "temp", url: urlData.publicUrl }]);
    toast({ title: "Photo uploaded" });
  };

  const handlePhotoRemove = async (index: number) => {
    const photo = photos[index];
    await supabase.from("profile_photos").delete().eq("id", photo.id);
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleActivateBoost = async () => {
    if (!profileId || boostCredits <= 0) return;
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("profiles").update({
      active_boost_until: until,
      boost_credits: boostCredits - 1,
    }).eq("id", profileId);
    setBoostActive(true);
    setBoostCredits((c) => c - 1);
    toast({ title: "⚡ Boost activated!", description: "You'll appear 3x more often for 24 hours." });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;
    setSaving(true);
    const socials = {
      instagram: form.instagram,
      tiktok: form.tiktok,
      youtube: form.youtube,
      x: form.x,
      twitch: form.twitch,
      website: form.website,
    };
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: form.displayName,
        age: form.age ? parseInt(form.age) : null,
        location: form.location,
        status_message: form.statusMessage,
        socials,
        profile_frame: isPro ? selectedFrame : "default",
      })
      .eq("id", profileId);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile saved!" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-extrabold text-foreground">Edit Profile</h1>
          </div>

          <form onSubmit={handleSave} className="space-y-8">
            {/* Photos */}
            <div>
              <Label className="text-base font-bold mb-3 block">Photos</Label>
              <div className="flex gap-3 flex-wrap">
                {photos.map((photo, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => handlePhotoRemove(i)} className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5">
                      <X className="h-3 w-3 text-foreground" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 transition-colors cursor-pointer">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            </div>

            {/* Exposure Boost */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-2">
                <Zap className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Exposure Boost</h3>
              </div>
              {boostActive ? (
                <p className="text-sm text-primary font-medium">⚡ Boost is active! You're appearing 3x more often.</p>
              ) : boostCredits > 0 ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{boostCredits} boost credit{boostCredits > 1 ? "s" : ""} available</p>
                  <Button type="button" size="sm" onClick={handleActivateBoost}>
                    Activate Boost
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No boost credits. <a href="/shop" className="text-primary hover:underline">Buy in Shop →</a>
                </p>
              )}
            </div>

            {/* Profile Frame (Pro only) */}
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <Crown className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-foreground">Profile Frame</h3>
                {!isPro && <span className="text-[10px] uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">Pro</span>}
              </div>
              {isPro ? (
                <div className="flex gap-3 flex-wrap">
                  {frameOptions.map((frame) => (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => setSelectedFrame(frame.id)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                        selectedFrame === frame.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full bg-secondary ${frame.preview}`} />
                      <span className="text-[10px] font-medium text-muted-foreground">{frame.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro to unlock premium profile frames. <a href="/shop" className="text-primary hover:underline">Go to Shop →</a>
                </p>
              )}
            </div>

            {/* Basic info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input id="displayName" value={form.displayName} onChange={(e) => handleChange("displayName", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input id="age" type="number" value={form.age} onChange={(e) => handleChange("age", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" placeholder="City, Country" value={form.location} onChange={(e) => handleChange("location", e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="statusMessage">Status Message</Label>
                <Textarea id="statusMessage" placeholder="What's on your mind?" value={form.statusMessage} onChange={(e) => handleChange("statusMessage", e.target.value)} rows={2} />
              </div>
            </div>

            {/* Social links */}
            <div>
              <Label className="text-base font-bold mb-3 block">Social Links</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {["instagram", "tiktok", "youtube", "x", "twitch", "website"].map((s) => (
                  <div key={s} className="space-y-1">
                    <Label htmlFor={s} className="text-xs capitalize text-muted-foreground">{s}</Label>
                    <Input id={s} placeholder={`Your ${s} handle`} value={(form as any)[s]} onChange={(e) => handleChange(s, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={saving}>
              {saving ? "Saving…" : "Save Profile"}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
