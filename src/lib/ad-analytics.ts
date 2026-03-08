import { supabase } from "@/integrations/supabase/client";

type AdEventType = "impression" | "click" | "skip" | "cta_click";

export async function logAdEvent(params: {
  eventType: AdEventType;
  creativeId?: string;
  placement: string;
  adMode: string;
  adSource: string;
  profileId?: string;
}) {
  try {
    await supabase.from("ad_events").insert({
      event_type: params.eventType,
      creative_id: params.creativeId || null,
      placement: params.placement,
      ad_mode: params.adMode,
      ad_source: params.adSource,
      profile_id: params.profileId || null,
    } as any);
  } catch {
    // silently fail — analytics should not block UX
  }
}
