import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Plus, X } from "lucide-react";

export default function Profile() {
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

  const [photos, setPhotos] = useState<string[]>([]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhotoAdd = () => {
    // Placeholder: in real app, this opens file picker
    const seed = Math.random().toString(36).slice(2, 8);
    setPhotos((prev) => [...prev, `https://api.dicebear.com/9.x/avataaars/svg?seed=${seed}`]);
  };

  const handlePhotoRemove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Save profile", { ...form, photos });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-3xl font-extrabold text-foreground mb-6">Edit Profile</h1>

          <form onSubmit={handleSave} className="space-y-8">
            {/* Photos */}
            <div>
              <Label className="text-base font-bold mb-3 block">Photos</Label>
              <div className="flex gap-3 flex-wrap">
                {photos.map((url, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handlePhotoRemove(i)}
                      className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5"
                    >
                      <X className="h-3 w-3 text-foreground" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handlePhotoAdd}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 transition-colors"
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </button>
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

            <Button type="submit" variant="hero" size="lg" className="w-full">
              Save Profile
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
