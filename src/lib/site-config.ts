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

// ─── THE PRODUCT'S HOME ───
// Mogzy is the League of Legends product: the League hub, Leaguecraft, Ranked,
// Daily Challenge, Study Hall, Champion Mastery, Meta Reflex, Pro Play and
// Combat Lab. There is no second product behind a flag.
//
// LEGACY1 deleted LEAGUE_ONLY_MODE along with the pre-Mogzy Mogsy voting
// product it hid. That flag was permanently true, every route it gated
// redirected here, and its presence implied a restorable product that no longer
// exists. Do not reintroduce it.
export const LEAGUE_HOME_ROUTE = "/lol";
