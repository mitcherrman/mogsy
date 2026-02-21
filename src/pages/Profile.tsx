import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
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
          <h1 className="text-3xl font-extrabold text-foreground mb-6">Edit Profile</h1>

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
