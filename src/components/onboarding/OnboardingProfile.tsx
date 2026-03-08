import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronRight, User, Camera, Mail, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { containsProfanity, getProfanityMessage } from "@/lib/profanity-filter";
import { searchCities } from "@/lib/cities-data";
import { toast } from "sonner";
import OnboardingDots from "./OnboardingDots";

interface Props {
  onNext: () => void;
}

export default function OnboardingProfile({ onNext }: Props) {
  const { user, linkAnonymousAccount } = useAuth();
  const isAnonymous = user?.is_anonymous ?? false;

  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [location, setLocation] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [linkError, setLinkError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP, or GIF images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo must be under 5MB.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleLocationChange = (val: string) => {
    setLocation(val);
    setCitySuggestions(searchCities(val));
  };

  const handleContinue = async () => {
    if (!user) return;
    setSaving(true);
    setNameError("");
    setLinkError("");

    // Validate display name
    if (displayName.trim() && containsProfanity(displayName)) {
      setNameError(getProfanityMessage());
      setSaving(false);
      return;
    }

    try {
      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setSaving(false);
        onNext();
        return;
      }

      // Upload photo if selected
      let avatarUrl: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const sanitizedName = `${profile.id}/${Date.now()}.${ext}`.replace(/[^a-zA-Z0-9\/\.\-_]/g, "");
        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(sanitizedName, photoFile, { upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("profile-photos")
            .getPublicUrl(sanitizedName);
          avatarUrl = urlData.publicUrl;

          // Insert into profile_photos table
          await supabase.from("profile_photos").insert({
            profile_id: profile.id,
            url: avatarUrl,
            sort_order: 0,
          });
        }
      }

      // Build profile update
      const updates: Record<string, any> = {};
      if (displayName.trim()) updates.display_name = displayName.trim();
      if (age && parseInt(age) >= 13) updates.age = parseInt(age);
      if (location.trim()) updates.location = location.trim();
      if (avatarUrl) updates.avatar_url = avatarUrl;

      if (Object.keys(updates).length > 0) {
        await supabase.from("profiles").update(updates).eq("user_id", user.id);
      }

      // Link anonymous account if email + password provided
      if (isAnonymous && email.trim() && password) {
        const { error } = await linkAnonymousAccount(email.trim(), password);
        if (error) {
          setLinkError(error.message || "Failed to link account.");
          setSaving(false);
          return;
        }
        toast.success("Account linked! Check your email to verify.");
      }
    } catch (err) {
      console.error("Onboarding profile save error:", err);
    }

    setSaving(false);
    onNext();
  };

  return (
    <motion.div
      key="profile"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center text-center max-w-md w-full"
    >
      <User className="h-8 w-8 text-primary mb-4" />
      <h2 className="text-2xl font-extrabold text-foreground mb-2">Set Up Your Profile</h2>
      <p className="text-muted-foreground text-sm mb-6">
        All fields are optional — you can always update later.
      </p>

      <div className="w-full space-y-4 text-left mb-6">
        {/* Photo */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-20 h-20 rounded-full border-2 border-dashed border-border hover:border-primary/50 transition-colors flex items-center justify-center overflow-hidden bg-muted"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <Camera className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
          <span className="text-xs text-muted-foreground">Tap to add a photo</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>

        {/* Username */}
        <div className="space-y-1.5">
          <Label htmlFor="onb-name" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <User className="h-3.5 w-3.5" /> Display Name
          </Label>
          <Input
            id="onb-name"
            placeholder="Choose a username"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
          />
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>

        {/* Age + Location row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="onb-age" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Age
            </Label>
            <Input
              id="onb-age"
              type="number"
              placeholder="18"
              min={13}
              max={120}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div className="space-y-1.5 relative">
            <Label htmlFor="onb-loc" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> City
            </Label>
            <Input
              id="onb-loc"
              placeholder="Start typing..."
              value={location}
              onChange={(e) => handleLocationChange(e.target.value)}
              onBlur={() => setTimeout(() => setCitySuggestions([]), 150)}
            />
            {citySuggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                {citySuggestions.map((city) => (
                  <button
                    key={city}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    onMouseDown={() => {
                      setLocation(city);
                      setCitySuggestions([]);
                    }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Email + Password for anonymous users */}
        {isAnonymous && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <div className="flex items-center gap-2 mb-1">
              <Mail className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Create an Account</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Sign up to save your progress and unlock full features.
            </p>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
            <Input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              maxLength={128}
            />
            {linkError && <p className="text-xs text-destructive">{linkError}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button
          onClick={handleContinue}
          disabled={saving}
          className="gap-2 rounded-full px-8"
          size="lg"
        >
          {saving ? "Saving..." : "Continue"} <ChevronRight className="h-4 w-4" />
        </Button>
        <button
          onClick={onNext}
          disabled={saving}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
      <OnboardingDots current="profile" />
    </motion.div>
  );
}
