// ─── DOMAIN CONFIG ───
// Canonical public origin. When changing domains, also update: index.html
// (title/OG/JSON-LD), public/robots.txt, and the Supabase checkout /
// customer-portal origin allowlists. scripts/generate-sitemap.ts reads this
// file. Historical domains (mogsy.app, mogsy.net) remain only as redirects
// and checkout-allowlist entries — they are no longer canonical.
export const SITE_DOMAIN = "mogzy.lol";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const SITE_NAME = "Mogzy";

// Working support inbox. Still hosted on the legacy mogsy.app domain until a
// support@mogzy.lol alias is configured — see docs/advertising.md owner tasks.
export const SUPPORT_EMAIL = "support@mogsy.app";

// ─── LEAGUE-ONLY PUBLIC MODE ───
// Temporary: public users only see the League of Legends experience
// (LoL hub, quiz, combat lab, broadcast). Non-League sections stay in the
// codebase but are hidden from navigation and their routes redirect to
// LEAGUE_HOME_ROUTE. Flip to false to restore the full Mogsy app.
export const LEAGUE_ONLY_MODE = true;
export const LEAGUE_HOME_ROUTE = "/lol";
