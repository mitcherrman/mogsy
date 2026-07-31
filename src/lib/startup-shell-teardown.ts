/**
 * Retire the static startup shell (see index.html) once React has committed
 * real content into #root.
 *
 * The shell already sits at z-index:-1 *behind* the app, so it cannot mask the
 * UI even if this never ran — but it is still dead DOM over every subsequent
 * frame, and a stale `data-startup-shell` attribute would keep pinning the body
 * colour. Removal is driven by three independent triggers, because none of them
 * is reliable on its own:
 *
 *   1. MutationObserver on #root — fires the moment React's first commit lands.
 *      Unlike requestAnimationFrame it is NOT suspended in a background tab,
 *      which is exactly the case the old rAF-only teardown could miss.
 *   2. requestAnimationFrame — the fast path once the tab is painting.
 *   3. A bounded timeout — last resort if neither of the above ever fires.
 *
 * Whichever fires first wins; the rest become no-ops. Nothing is removed before
 * #root has a child, so React always has visible structure in place first.
 */

/** Upper bound on how long the (already-invisible) shell may linger. */
export const STARTUP_SHELL_FALLBACK_MS = 3000;

export function retireStartupShell(container: Element): () => void {
  let retired = false;
  let observer: MutationObserver | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const retireOnce = () => {
    if (retired) return;
    retired = true;
    observer?.disconnect();
    if (fallbackTimer !== null) clearTimeout(fallbackTimer);

    document.getElementById("initial-shell")?.remove();
    document.documentElement.removeAttribute("data-startup-shell");
  };

  const retireIfMounted = () => {
    if (container.firstChild) retireOnce();
  };

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(retireIfMounted);
    observer.observe(container, { childList: true });
  }

  // React may already have committed synchronously before we were called.
  retireIfMounted();

  if (!retired) {
    fallbackTimer = setTimeout(retireOnce, STARTUP_SHELL_FALLBACK_MS);
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(retireIfMounted);
    }
  }

  return retireOnce;
}
