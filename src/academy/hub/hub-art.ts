/**
 * PERF1 — the Academy Hub's first-screen art, in ONE place.
 *
 * The Hub renders these and `warmAcademyHub` (src/lib/hub/academy-hub-warm.ts)
 * fetches them ahead of the Hub, so both must name the same bundler URL: a
 * warm of a different file is a second download, not a cache hit.
 *
 * WebP re-encodes (Pillow, q90, method=6) of the approved PNGs, at the source
 * pixel size and with the alpha channel bit-exact. The PNGs stay in the repo
 * as the source art. See docs/PERF1_ACADEMY_FIRST_VISIT.md.
 */
import academyLibraryDesktop from "./academy-library-desktop.webp";
import academyLibraryMobile from "./academy-library-mobile.webp";
import academyBookFrame from "@/assets/academy-book-frame.webp";
import bookSpineFlat from "@/assets/book-spine-flat-v2.webp";

/** 1672x941 desktop library painting (the Hall's full-bleed background). */
export const ACADEMY_LIBRARY_DESKTOP = academyLibraryDesktop;
/** 941x1672 phone library painting. */
export const ACADEMY_LIBRARY_MOBILE = academyLibraryMobile;
/** 1024x1536 RGBA closed-book shell, drawn four times on desktop. */
export const ACADEMY_BOOK_FRAME = academyBookFrame;
/** 2172x724 RGBA book spine, drawn four times in the phone stack. */
export const ACADEMY_BOOK_SPINE = bookSpineFlat;
/**
 * 1536x1024 RGBA open book behind the Academy Broadcast (Patch Brief), served
 * from public/. Above the fold on desktop, where the surface waits for it
 * before showing anything; below the fold on a phone.
 */
export const ACADEMY_BROADCAST_BOOK = "/images/lol-hub/academy-broadcast-book.webp";

/**
 * The breakpoint the Hall's <picture> switches paintings at, and the one the
 * desktop book grid / phone stack switch at (Tailwind `md`). Kept as the exact
 * media string so the warm and the <picture> can never pick different files.
 */
export const HUB_DESKTOP_MEDIA = "(min-width: 768px)";
export const HUB_MOBILE_MEDIA_QUERY = "(max-width: 767px)";
