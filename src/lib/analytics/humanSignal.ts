/**
 * USERS1 — the one thing that makes a session `human`.
 *
 * A page load proves nothing. A crawler loads pages, a preview loads pages, an
 * agent loads pages, and until USERS1 every one of them was counted as
 * audience. What a page load cannot fake cheaply is a person deliberately
 * touching the thing: a pointer press, a key press, a real touch.
 *
 * So this watcher listens for exactly that, once, and promotes the session.
 * Everything else about a visit — how long it lasted, how many routes it
 * crossed, whether it scrolled — is left alone, because all of it is
 * automatable without intent and none of it would mean what it appeared to.
 *
 * WHAT IS DELIBERATELY NOT TRUSTED
 *
 *  · `event.isTrusted` alone. Chrome DevTools Protocol input — which is what
 *    Playwright and Puppeteer use — arrives with isTrusted true. It is still
 *    checked (it excludes `dispatchEvent` from page scripts), but the flag
 *    that actually separates a driver from a person is `navigator.webdriver`,
 *    and that is checked at promotion time in track.ts as well as here.
 *  · `scroll`. Trivially produced by `window.scrollTo`, by a restored scroll
 *    position, and by smooth-scroll animations the app itself runs.
 *  · `mousemove`. Fired by pointer-warping, by hover-driven layout, and by a
 *    headless run that moves the cursor once on its way to a click.
 *
 * The listeners are passive and capture-phase, so nothing here can delay,
 * swallow or reorder an input the product needs.
 */

import { getSession } from "./identity";
import { promoteSessionToHuman } from "./track";
import { canPromoteToHuman } from "./traffic";

const HUMAN_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

let installed = false;

/**
 * Start watching for the first genuine human input.
 *
 * Idempotent, and a no-op outside a browser and in a driver-controlled one.
 * Called once from main.tsx: it is wired at the application entry point rather
 * than inside a hook so that it covers every route, including the ones that
 * render before React mounts anything of ours.
 */
export function installHumanSignalWatcher(): void {
  if (installed) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Nothing to watch for in a driver-controlled browser: it is already
  // classified `automation` and promotion would refuse it anyway.
  if (!canPromoteToHuman()) return;

  installed = true;

  const stop = () => {
    for (const name of HUMAN_EVENTS) window.removeEventListener(name, onInput, true);
  };

  /**
   * Not `{ once: true }`, and that is not an oversight.
   *
   * Promotion can legitimately decline the FIRST input: the session row has to
   * exist in the database before it can be promoted, and on a fast click that
   * insert may still be in flight. Unsubscribing on the first attempt would
   * silently cost that visit its classification forever. So the watcher stays
   * until it has an answer — either a successful promotion, or a session that
   * is no longer `unknown` and therefore not ours to promote.
   */
  function onInput(event: Event) {
    if (!event.isTrusted) return;
    if (getSession().traffic.trafficClass !== "unknown") {
      stop();
      return;
    }
    void promoteSessionToHuman(`trusted ${event.type}`).then((promoted) => {
      if (promoted) stop();
    });
  }

  for (const name of HUMAN_EVENTS) {
    window.addEventListener(name, onInput, { capture: true, passive: true });
  }
}

/** Test-only: allow a second install in a fresh fixture. */
export function resetHumanSignalWatcherForTests(): void {
  installed = false;
}
