// ---------------------------------------------------------------------------
// Admin · Audio Studio (LEGACY1).
//
// The operator home for Mogzy's sound: which cues are enabled, and which
// uploaded asset a cue plays. It writes the canonical SFX1 stores —
// `audio_assets` and `audio_event_bindings` — plus the `app_settings`
// `sound_settings` policy snapshot the runtime controller observes.
//
// WHY THIS PAGE EXISTS. Until LEGACY1 this surface had no home of its own: it
// was the ninth tab of `/admin/gaming`, the retired voting product's "Gaming
// Config" shell, alongside swipe-game and card-animation configuration that no
// live route can reach. Deleting that shell without rehoming this would have
// deleted a current capability, so it moved here first.
//
// A child of the /admin layout route, so it inherits that route's AdminRoute
// gate. THAT IS NOT THE SECURITY BOUNDARY: every write goes to Postgres, where
// RLS on `audio_assets`, `audio_event_bindings` and `app_settings` allows it
// only for an admin. Authorization is byte-for-byte what it was under
// /admin/gaming — no gate was added, removed or widened by the move.
// ---------------------------------------------------------------------------

import { Volume2 } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import AdminSounds from "@/components/admin/AdminSounds";

export default function AdminAudioStudio() {
  return (
    <div className="space-y-4" data-testid="admin-audio-studio">
      <SEOHead
        title="Audio Studio · Admin"
        description="Sound-effect cue policy and uploaded replacements."
        noindex
      />
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Volume2 className="h-4 w-4" aria-hidden /> Audio Studio
        </h1>
        <p className="text-xs text-muted-foreground">
          Cue policy and uploaded replacements for Mogzy's sound effects. Saving publishes to
          mounted players without a reload.
        </p>
      </header>
      <AdminSounds />
    </div>
  );
}
