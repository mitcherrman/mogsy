// ─── DOMAIN CONFIG ───
// When you purchase a custom domain, update SITE_DOMAIN here.
// Then find-and-replace "mogsy.com" in: index.html, public/sitemap.xml, public/robots.txt
export const SITE_DOMAIN = "mogsy.app";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const SITE_NAME = "Mogsy";

// ─── LEAGUE-ONLY PUBLIC MODE ───
// Temporary: public users only see the League of Legends experience
// (LoL hub, quiz, combat lab, broadcast). Non-League sections stay in the
// codebase but are hidden from navigation and their routes redirect to
// LEAGUE_HOME_ROUTE. Flip to false to restore the full Mogsy app.
export const LEAGUE_ONLY_MODE = true;
export const LEAGUE_HOME_ROUTE = "/lol";
