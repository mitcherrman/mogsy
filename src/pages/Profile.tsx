import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Crown, Zap, ArrowLeft, AlertCircle, CheckCircle2, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { containsProfanity, getProfanityMessage } from "@/lib/profanity-filter";
import { searchCities } from "@/lib/cities-data";
import { validateSocialLink } from "@/lib/social-validators";

const frameOptions = [
  { id: "default", label: "Default", preview: "" },
  { id: "gold", label: "Gold", preview: "ring-4 ring-yellow-400/60" },
  { id: "neon", label: "Neon", preview: "ring-4 ring-blue-500/60 shadow-[0_0_15px_hsl(210_80%_60%/0.4)]" },
  { id: "fire", label: "Fire", preview: "ring-4 ring-orange-500/60 shadow-[0_0_15px_hsl(25_100%_50%/0.4)]" },
  { id: "diamond", label: "Diamond", preview: "ring-4 ring-cyan-300/60 shadow-[0_0_15px_hsl(180_80%_70%/0.4)]" },
];

const SOCIAL_PLACEHOLDERS: Record<string, string> = {
  instagram: "https://instagram.com/yourname",
  tiktok: "https://tiktok.com/@yourname",
  youtube: "https://youtube.com/@yourchannel",
  x: "https://x.com/yourhandle",
  twitch: "https://twitch.tv/yourname",
  website: "https://yourwebsite.com",
};

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
  const [nameError, setNameError] = useState("");
  const [ageWarning, setAgeWarning] = useState("");
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const cityRef = useRef<HTMLDivElement>(null);

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

  // Close city dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    if (field === "displayName") {
      setNameError(containsProfanity(value) ? getProfanityMessage() : "");
    }
    if (field === "age") {
      // Only allow numeric input
      const numeric = value.replace(/\D/g, "");
      const age = parseInt(numeric);
      if (numeric && age < 18) {
        setAgeWarning("Users under 18 will be flagged for review.");
      } else {
        setAgeWarning("");
      }
      setForm((prev) => ({ ...prev, [field]: numeric }));
      return;
    }
    if (field === "location") {
      const results = searchCities(value);
      setCitySuggestions(results);
      setShowCityDropdown(results.length > 0);
    }
    // Validate social links
    if (["instagram", "tiktok", "youtube", "x", "twitch", "website"].includes(field)) {
      const result = validateSocialLink(field, value);
      setSocialErrors((prev) => ({ ...prev, [field]: result.valid ? "" : result.message }));
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectCity = (city: string) => {
    setForm((prev) => ({ ...prev, location: city }));
    setShowCityDropdown(false);
    setCitySuggestions([]);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !profileId || !user) return;
    const file = e.target.files[0];

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Only JPEG, PNG, WebP and GIF images are allowed.", variant: "destructive" });
      return;
    }

    // Validate file size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({ title: "File too large", description: "Maximum file size is 5MB.", variant: "destructive" });
      return;
    }

    // Validate file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      toast({ title: "Invalid file extension", description: "Only .jpg, .png, .webp and .gif files are allowed.", variant: "destructive" });
      return;
    }

    // Use sanitized filename
    const sanitizedName = `${Date.now()}${ext}`;
    const filePath = `${user.id}/${sanitizedName}`;
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
    const { error } = await supabase.from("profiles").update({
      active_boost_until: until,
      boost_credits: boostCredits - 1,
    }).eq("id", profileId);
    if (error) {
      toast({ title: "Boost failed", description: "No boost credits available.", variant: "destructive" });
      return;
    }
    setBoostActive(true);
    setBoostCredits((c) => c - 1);
    toast({ title: "⚡ Boost activated!", description: "You'll appear 3x more often for 24 hours." });
  };

  const hasFormErrors = !!nameError || Object.values(socialErrors).some(Boolean);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId) return;
    if (containsProfanity(form.displayName)) {
      toast({ title: "Inappropriate name", description: getProfanityMessage(), variant: "destructive" });
      return;
    }
    // Re-validate socials
    const socialKeys = ["instagram", "tiktok", "youtube", "x", "twitch", "website"];
    for (const key of socialKeys) {
      const result = validateSocialLink(key, (form as any)[key]);
      if (!result.valid) {
        toast({ title: `Invalid ${key}`, description: result.message, variant: "destructive" });
        return;
      }
    }

    const age = form.age ? parseInt(form.age) : null;

    setSaving(true);
    const socials = {
      instagram: form.instagram,
      tiktok: form.tiktok,
      youtube: form.youtube,
      x: form.x,
      twitch: form.twitch,
      website: form.website,
    };

    // Flag underage if age < 18
    const updatePayload: any = {
      display_name: form.displayName,
      age,
      location: form.location,
      status_message: form.statusMessage,
      socials,
      profile_frame: isPro ? selectedFrame : "default",
    };
    if (age !== null && age < 18) {
      updatePayload.is_flagged_underage = true;
    } else if (age !== null && age >= 18) {
      updatePayload.is_flagged_underage = false;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updatePayload)
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
      <div className="container mx-auto max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-extrabold text-foreground">Edit Profile</h1>
          </div>

          <form onSubmit={handleSave}>
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left sidebar: Exposure Boost */}
              <div className="lg:w-56 shrink-0 order-2 lg:order-1">
                <div className="sticky top-8 rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-sm text-foreground">Boost</h3>
                  </div>
                  {boostActive ? (
                    <div className="text-center space-y-2">
                      <div className="text-2xl">⚡</div>
                      <p className="text-xs text-primary font-medium">Boost active!</p>
                      <p className="text-[10px] text-muted-foreground">3x more visibility for 24h</p>
                    </div>
                  ) : boostCredits > 0 ? (
                    <div className="space-y-2 text-center">
                      <p className="text-xs text-muted-foreground">{boostCredits} credit{boostCredits > 1 ? "s" : ""}</p>
                      <Button type="button" size="sm" className="w-full text-xs" onClick={handleActivateBoost}>
                        <Zap className="h-3 w-3 mr-1" /> Activate
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <p className="text-xs text-muted-foreground">No credits</p>
                      <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => navigate("/shop")}>
                        Get Boosts
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: Main profile form */}
              <div className="flex-1 min-w-0 order-1 lg:order-2 space-y-6">
                {/* Photos */}
                <div className="rounded-2xl border border-border bg-card p-5">
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
                  <p className="text-[10px] text-muted-foreground mt-2">Add up to 6 photos. First photo is your main profile picture.</p>
                </div>

                {/* Basic info */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                  <Label className="text-base font-bold block">Basic Info</Label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name *</Label>
                      <Input id="displayName" value={form.displayName} onChange={(e) => handleChange("displayName", e.target.value)} required maxLength={30} />
                      {nameError ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {nameError}
                        </p>
                      ) : form.displayName.length > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" /> {30 - form.displayName.length} characters left
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="age">Age</Label>
                      <Input
                        id="age"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Your age"
                        value={form.age}
                        onChange={(e) => handleChange("age", e.target.value)}
                        maxLength={3}
                      />
                      {ageWarning && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {ageWarning}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2 relative" ref={cityRef}>
                      <Label htmlFor="location">Location</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="location"
                          placeholder="Start typing a city…"
                          value={form.location}
                          onChange={(e) => handleChange("location", e.target.value)}
                          onFocus={() => { if (citySuggestions.length > 0) setShowCityDropdown(true); }}
                          className="pl-9"
                          autoComplete="off"
                        />
                      </div>
                      {showCityDropdown && citySuggestions.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                          {citySuggestions.map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => selectCity(city)}
                              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary transition-colors"
                            >
                              <MapPin className="inline h-3 w-3 mr-2 text-muted-foreground" />
                              {city}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="statusMessage">Status Message</Label>
                      <Textarea
                        id="statusMessage"
                        placeholder="What's on your mind?"
                        value={form.statusMessage}
                        onChange={(e) => handleChange("statusMessage", e.target.value)}
                        rows={2}
                        maxLength={150}
                      />
                      <p className="text-[10px] text-muted-foreground text-right">{form.statusMessage.length}/150</p>
                    </div>
                  </div>
                </div>

                {/* Social links */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <Label className="text-base font-bold block">Social Links</Label>
                  <p className="text-xs text-muted-foreground">Paste the full link to your profile. Usernames and @ handles won't be accepted.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {["instagram", "tiktok", "youtube", "x", "twitch", "website"].map((s) => (
                      <div key={s} className="space-y-1">
                        <Label htmlFor={s} className="text-xs capitalize text-muted-foreground">{s}</Label>
                        <Input
                          id={s}
                          placeholder={SOCIAL_PLACEHOLDERS[s] || `Your ${s}`}
                          value={(form as any)[s]}
                          onChange={(e) => handleChange(s, e.target.value)}
                          className={socialErrors[s] ? "border-destructive" : ""}
                        />
                        {socialErrors[s] && (
                          <p className="text-[10px] text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> {socialErrors[s]}
                          </p>
                        )}
                        {!socialErrors[s] && (form as any)[s] && (
                          <p className="text-[10px] text-primary flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Valid
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={saving || hasFormErrors}>
                  {saving ? "Saving…" : "Save Profile"}
                </Button>
              </div>

              {/* Right sidebar: Profile Frame */}
              <div className="lg:w-56 shrink-0 order-3">
                <div className="sticky top-8 rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-sm text-foreground">Frame</h3>
                    {!isPro && <span className="text-[8px] uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-bold">Pro</span>}
                  </div>
                  {isPro ? (
                    <div className="grid grid-cols-2 gap-2">
                      {frameOptions.map((frame) => (
                        <button
                          key={frame.id}
                          type="button"
                          onClick={() => setSelectedFrame(frame.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                            selectedFrame === frame.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/30"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full bg-secondary ${frame.preview}`} />
                          <span className="text-[9px] font-medium text-muted-foreground">{frame.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-full bg-secondary ring-4 ring-primary/30" />
                      <p className="text-[10px] text-muted-foreground">Unlock premium frames</p>
                      <Button type="button" variant="outline" size="sm" className="w-full text-xs" onClick={() => navigate("/shop")}>
                        <Crown className="h-3 w-3 mr-1" /> Go Pro
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
