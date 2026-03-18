import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Crown, Zap, ArrowLeft, AlertCircle, CheckCircle2, MapPin, User, Instagram, Youtube, Twitch, Globe, Twitter, Star, Pencil, Palette, Lock, Heart, Search, Trash2, Settings, Gift, ShieldCheck } from "lucide-react";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { containsProfanity, getProfanityMessage } from "@/lib/profanity-filter";
import { searchCities } from "@/lib/cities-data";
import { validateSocialLink } from "@/lib/social-validators";
import SEOHead from "@/components/SEOHead";
import { profileThemes } from "@/lib/profile-themes";
import FavoritesEditor from "@/components/FavoritesEditor";


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
  const [selectedTheme, setSelectedTheme] = useState("default");
  const [boostActive, setBoostActive] = useState(false);
  const [boostCredits, setBoostCredits] = useState(0);
  const [nameError, setNameError] = useState("");
  const [ageWarning, setAgeWarning] = useState("");
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
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
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

  const isEditing = (field: string) => editingFields.has(field);
  const toggleEdit = (field: string) => {
    setEditingFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };
  const isFieldFilled = (field: string) => {
    const val = (form as any)[field];
    return typeof val === "string" && val.trim().length > 0;
  };

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
    if (!user) {
      // Reset state when user signs out
      setLoading(false);
      setProfileId(null);
      return;
    }
    setLoading(true);
    loadProfile();
    // Check if user is a moderator
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      const roles = data?.map(r => r.role as string) || [];
      setIsModerator(roles.includes("moderator") || roles.includes("admin") || roles.includes("master_admin"));
    });
  }, [user?.id]);

  const loadProfile = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      setProfileId(profile.id);
      setIsPro(profile.is_pro || false);
      setSelectedFrame(profile.profile_frame || "default");
      setSelectedTheme(profile.custom_theme || "default");
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

      // Fields that are empty start in edit mode
      const allFields = ["displayName", "age", "location", "statusMessage", "instagram", "tiktok", "youtube", "x", "twitch", "website"];
      const formValues: Record<string, string> = {
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
      };
      const emptyFields = new Set(allFields.filter((f) => !formValues[f]?.trim()));
      setEditingFields(emptyFields);

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

  const checkImageResolution = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
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

    // Check image resolution
    const { width, height } = await checkImageResolution(file);
    const MIN_RECOMMENDED = 400;
    const MIN_ALLOWED = 150;

    if (width < MIN_ALLOWED || height < MIN_ALLOWED) {
      toast({ title: "Image too small", description: `Minimum resolution is ${MIN_ALLOWED}×${MIN_ALLOWED}px. Your image is ${width}×${height}px.`, variant: "destructive" });
      return;
    }

    if (width < MIN_RECOMMENDED || height < MIN_RECOMMENDED) {
      toast({
        title: "⚠️ Low resolution image",
        description: `Your image (${width}×${height}px) may appear blurry on profile cards. We recommend at least ${MIN_RECOMMENDED}×${MIN_RECOMMENDED}px for the best quality.`,
      });
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
    const newPhotos = [...photos, { id: "temp", url: urlData.publicUrl }];
    setPhotos(newPhotos);
    // Auto-sync avatar_url to a random photo from the first 3
    const rotationPhotos = newPhotos.slice(0, 3);
    const randomPhoto = rotationPhotos[Math.floor(Math.random() * rotationPhotos.length)];
    await supabase.from("profiles").update({ avatar_url: randomPhoto.url }).eq("id", profileId);
    toast({ title: "Photo uploaded" });
  };

  const handlePhotoRemove = async (index: number) => {
    const photo = photos[index];
    await supabase.from("profile_photos").delete().eq("id", photo.id);
    const remaining = photos.filter((_, i) => i !== index);
    setPhotos(remaining);
    // Auto-sync avatar_url after removal
    if (profileId) {
      if (remaining.length > 0) {
        const rotationPhotos = remaining.slice(0, 3);
        const randomPhoto = rotationPhotos[Math.floor(Math.random() * rotationPhotos.length)];
        await supabase.from("profiles").update({ avatar_url: randomPhoto.url }).eq("id", profileId);
      } else {
        await supabase.from("profiles").update({ avatar_url: "" }).eq("id", profileId);
      }
    }
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

    const updatePayload: any = {
      display_name: form.displayName,
      age,
      location: form.location,
      status_message: form.statusMessage,
      socials,
      profile_frame: isPro ? selectedFrame : "default",
      custom_theme: selectedTheme,
    };
    // Set avatar_url to a random photo from the first 3
    if (photos.length > 0) {
      const rotationPhotos = photos.slice(0, 3);
      const randomPhoto = rotationPhotos[Math.floor(Math.random() * rotationPhotos.length)];
      updatePayload.avatar_url = randomPhoto.url;
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
    return <div className="min-h-screen" />;
  }

  const socialIcons: Record<string, React.ElementType> = {
    instagram: Instagram, youtube: Youtube, twitch: Twitch, x: Twitter, website: Globe,
  };

  return (
    <div className="min-h-screen px-2 sm:px-4 py-4 sm:py-8">
      <SEOHead title="My Profile — Mogsy" description="View and edit your Mogsy profile. Manage your photos, bio, social links, and see your ranking stats." />
      <div className="container mx-auto max-w-4xl xl:max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground shrink-0 h-8 w-8 sm:h-10 sm:w-10">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h1 className="text-xl sm:text-3xl font-extrabold text-foreground truncate">Edit Profile</h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {isModerator && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => navigate("/moderator")}
                  className="text-primary hover:text-primary hover:bg-primary/10 h-8 w-8 sm:h-10 sm:w-10"
                  title="Moderator Panel"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate("/referral")}
                className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-10 sm:w-10"
              >
                <Gift className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => navigate("/settings")}
                className="text-muted-foreground hover:text-foreground h-8 w-8 sm:h-10 sm:w-10"
              >
                <Settings className="h-4 w-4" />
              </Button>
              {profileId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/user/${profileId}`)}
                  className="gap-1 text-[10px] sm:text-xs h-8 px-2 sm:px-3"
                >
                  <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden xs:inline">Preview</span>
                  <span className="xs:hidden"><User className="h-3 w-3" /></span>
                </Button>
              )}
            </div>
          </div>



          <form onSubmit={handleSave}>
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
              {/* Left sidebar: Exposure Boost */}
              <div className="lg:w-56 shrink-0 order-2 lg:order-1">
                <div className="sticky top-20 rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
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
              <div className="flex-1 min-w-0 order-1 lg:order-2 space-y-4 sm:space-y-6">
                {/* Photos */}
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
                  <Label className="text-sm sm:text-base font-bold mb-2 sm:mb-3 block">Photos</Label>
                  <div className="flex gap-2 sm:gap-3 flex-wrap">
                    {photos.map((photo, i) => (
                      <div key={i} className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 ${i < 3 ? "border-primary/60 ring-2 ring-primary/20" : "border-border"}`}>
                        <img src={photo.url} alt="" className="w-full h-full object-cover" />
                        {i < 3 && (
                          <div className="absolute top-0.5 left-0.5">
                            <Star className="h-3 w-3 text-primary fill-primary" />
                          </div>
                        )}
                        <button type="button" onClick={() => handlePhotoRemove(i)} className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5">
                          <X className="h-3 w-3 text-foreground" />
                        </button>
                      </div>
                    ))}
                    <label className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 transition-colors cursor-pointer">
                      <Plus className="h-5 w-5 text-muted-foreground" />
                      <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">Add up to 6 photos. Your first 3 photos (★) will be rotated as your profile picture across the app.</p>
                  {photos.length >= 2 && photos.length <= 6 && (
                    <p className="text-[10px] text-primary font-medium flex items-center gap-1 mt-1">
                      <Star className="h-3 w-3 fill-primary" /> {Math.min(photos.length, 3)} photo{Math.min(photos.length, 3) > 1 ? "s" : ""} in rotation
                    </p>
                  )}
                </div>

                {/* Basic info */}
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 space-y-3 sm:space-y-4">
                  <Label className="text-sm sm:text-base font-bold block">Basic Info</Label>
                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    {/* Display Name */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="displayName">Display Name *</Label>
                        {isFieldFilled("displayName") && !isEditing("displayName") && (
                          <button type="button" onClick={() => toggleEdit("displayName")} className="text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isEditing("displayName") || !isFieldFilled("displayName") ? (
                        <>
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
                        </>
                      ) : (
                        <p className="text-sm text-foreground py-2 px-3 rounded-md bg-muted/30 border border-border">{form.displayName}</p>
                      )}
                    </div>

                    {/* Age */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="age">Age</Label>
                        {isFieldFilled("age") && !isEditing("age") && (
                          <button type="button" onClick={() => toggleEdit("age")} className="text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isEditing("age") || !isFieldFilled("age") ? (
                        <>
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
                        </>
                      ) : (
                        <p className="text-sm text-foreground py-2 px-3 rounded-md bg-muted/30 border border-border">{form.age}</p>
                      )}
                    </div>

                    {/* Location */}
                    <div className="space-y-2 sm:col-span-2 relative" ref={cityRef}>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="location">Location</Label>
                        {isFieldFilled("location") && !isEditing("location") && (
                          <button type="button" onClick={() => toggleEdit("location")} className="text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isEditing("location") || !isFieldFilled("location") ? (
                        <>
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
                        </>
                      ) : (
                        <p className="text-sm text-foreground py-2 px-3 rounded-md bg-muted/30 border border-border flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />{form.location}
                        </p>
                      )}
                    </div>

                    {/* Status Message */}
                    <div className="space-y-2 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="statusMessage">Status Message</Label>
                        {isFieldFilled("statusMessage") && !isEditing("statusMessage") && (
                          <button type="button" onClick={() => toggleEdit("statusMessage")} className="text-muted-foreground hover:text-primary transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isEditing("statusMessage") || !isFieldFilled("statusMessage") ? (
                        <>
                          <Textarea
                            id="statusMessage"
                            placeholder="What's on your mind?"
                            value={form.statusMessage}
                            onChange={(e) => handleChange("statusMessage", e.target.value)}
                            rows={2}
                            maxLength={150}
                          />
                          <p className="text-[10px] text-muted-foreground text-right">{form.statusMessage.length}/150</p>
                        </>
                      ) : (
                        <p className="text-sm text-foreground/80 italic py-2 px-3 rounded-md bg-muted/30 border border-border">"{form.statusMessage}"</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Social links */}
                <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 space-y-3">
                  <Label className="text-sm sm:text-base font-bold block">Social Links</Label>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Paste the full link to your profile. Usernames and @ handles won't be accepted.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {["instagram", "tiktok", "youtube", "x", "twitch", "website"].map((s) => (
                      <div key={s} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={s} className="text-xs capitalize text-muted-foreground">{s}</Label>
                          {isFieldFilled(s) && !isEditing(s) && (
                            <button type="button" onClick={() => toggleEdit(s)} className="text-muted-foreground hover:text-primary transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {isEditing(s) || !isFieldFilled(s) ? (
                          <>
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
                          </>
                        ) : (
                          <p className="text-xs text-foreground py-2 px-3 rounded-md bg-muted/30 border border-border truncate">{(form as any)[s]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>



                {/* Favorites */}
                <FavoritesEditor profileId={profileId} />

                {/* Save button */}
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={saving || hasFormErrors}>
                  {saving ? "Saving…" : "Save Profile"}
                </Button>
              </div>

              {/* Right sidebar: Profile Frame */}
              <div className="lg:w-56 shrink-0 order-3">
                <div className="sticky top-20 rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
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

                {/* Profile Theme */}
                <div className="sticky top-[22rem] rounded-2xl border border-border bg-card p-4 space-y-3 mt-4">
                  <div className="flex items-center gap-2">
                    <Palette className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-sm text-foreground">Theme</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {profileThemes.map((t) => {
                      const locked = t.isPro && !isPro;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={locked}
                          onClick={async () => {
                            if (locked || !profileId) return;
                            setSelectedTheme(t.id);
                            const { error } = await supabase
                              .from("profiles")
                              .update({ custom_theme: t.id })
                              .eq("id", profileId);
                            if (error) {
                              toast({ title: "Failed to save theme", variant: "destructive" });
                            } else {
                              toast({ title: `Theme changed to ${t.label}` });
                            }
                          }}
                          className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                            selectedTheme === t.id
                              ? "border-primary bg-primary/5"
                              : locked
                              ? "border-border opacity-50 cursor-not-allowed"
                              : "border-border hover:border-primary/30"
                          }`}
                        >
                          <div className={`w-full h-6 rounded-md ${t.preview}`} />
                          <span className="text-[9px] font-medium text-muted-foreground">{t.label}</span>
                          {locked && (
                            <Lock className="absolute top-1 right-1 h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
