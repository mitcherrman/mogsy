// ---------------------------------------------------------------------------
// /:slug — the invite-code entrance.
//
// WHAT THIS RESOLVES. One thing: an active row in `invite_links`. A visitor
// following mogzy.lol/<CODE> is sent to signup carrying that code, which is
// what makes an admin / moderator / Premium invite work.
//
// WHAT LEGACY1 REMOVED. Everything else this page used to resolve belonged to
// the retired Mogsy voting product and pointed at routes that no longer exist:
//
//   · `swipe_tab_config.button_slugs` → /swipe/preset/:id and /swipe-game
//   · `resolve_custom_link` (the `custom_links` table) → a swipe league, or a
//     "curated" config written to localStorage for the deleted /home hub
//   · the curated theme / swipe-animation / grant_diamonds payload
//
// `custom_links` and `resolve_custom_link` still exist in the database and are
// recorded as historical residue in LEGACY1_HANDOFF.md. Nothing reads them.
//
// A slug that is not an active invite code renders NotFound, exactly as an
// unknown slug always did.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { authHref } from "@/lib/auth/auth-destination";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LEAGUE_HOME_ROUTE } from "@/lib/site-config";
import NotFound from "./NotFound";

/** Where a redeemed invite lands once auth clears. */
const INVITE_RETURN_ROUTE = LEAGUE_HOME_ROUTE;

export default function CustomLink() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); return; }
    resolveSlug(slug);
  }, [slug]);

  const resolveSlug = async (s: string) => {
    const { data: inviteData } = await supabase
      .from("invite_links")
      .select("code")
      .eq("code", s.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (inviteData) {
      // The invite code is the whole point of this visit, so signup — not
      // sign-in — is the mode, and the League hub is where it lands.
      navigate(
        `${authHref(INVITE_RETURN_ROUTE, { mode: "signup" })}&invite=${encodeURIComponent(inviteData.code)}`,
        { replace: true },
      );
      return;
    }

    setNotFound(true);
  };

  if (notFound) return <NotFound />;

  return <div className="min-h-dvh bg-background flex items-center justify-center">
    <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
  </div>;
}
