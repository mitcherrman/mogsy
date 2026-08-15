/**
 * Startup shell contract.
 *
 * The very first paint of the app is produced by the static `#initial-shell`
 * in index.html, before any JavaScript module has run. That shell has to agree
 * with what React paints a moment later, otherwise the visitor sees the page
 * change colour under them.
 *
 * These constants are the single source of truth for that agreement. The inline
 * bootstrap in index.html mirrors them literally (it cannot import TypeScript),
 * and `src/startup-shell.contract.test.ts` fails if the two ever drift apart.
 *
 * Nothing here reads user state. Route → base colour is the only decision, and
 * it is safe to make before auth, settings or profile have resolved.
 */

/** Base colour of the League/library surface (matches `.theme-lol` body). */
export const LOL_BASE_BG = "#060c14";

/** Base colour of the Academy entrance at `/` (matches MogzyEntryV2's root). */
export const ENTRY_BASE_BG = "#04070f";

/** Base colour of every other app surface (matches the Layout shell). */
export const DEFAULT_BASE_BG = "#0a0a1a";

/**
 * Routes that own the LoLdle-inspired League theme.
 *
 * This is now the SINGLE definition. `useSitewideTheme` previously carried a
 * hand-copied duplicate of this list, which is exactly the drift the old
 * comment here warned about — it now imports this function instead.
 */
export function isLolSectionPath(pathname: string): boolean {
  return (
    pathname === "/lol" ||
    pathname.startsWith("/lol/") ||
    pathname === "/combat-lab" ||
    pathname.startsWith("/combat-lab/") ||
    pathname === "/quiz" ||
    pathname.startsWith("/quiz/") ||
    // Meta Reflex (internally League Swipe). Its absence here was the root
    // cause of the surface rendering with neither `theme-lol` nor `dark`, so it
    // inherited whatever sitewide Mogsy theme the visitor happened to have —
    // putting the cards' hardcoded near-black text on a near-black ground for
    // light-OS users. It is League content and belongs in the League theme,
    // even though its historical public URL sits outside /lol and /quiz.
    pathname === "/league-swipe" ||
    pathname.startsWith("/league-swipe/")
  );
}

/** The Academy entrance screen, which is its own full-bleed surface. */
export function isEntryPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/dev/mogzy-entry-v2";
}

/** Base background the browser should paint for `pathname` before React runs. */
export function baseBackgroundForPath(pathname: string): string {
  if (isLolSectionPath(pathname)) return LOL_BASE_BG;
  if (isEntryPath(pathname)) return ENTRY_BASE_BG;
  return DEFAULT_BASE_BG;
}
