const CHUNK_ERROR_PATTERN =
  /dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module|Loading chunk \S+ failed/i;

const RELOAD_WINDOW_MS = 60_000;

export function isChunkLoadError(error: unknown) {
  const message = String(
    error instanceof Error
      ? error.message
      : (error as { message?: unknown; reason?: unknown })?.message ??
          (error as { reason?: { message?: unknown } })?.reason?.message ??
          error,
  );

  return CHUNK_ERROR_PATTERN.test(message);
}

export function recoverFromChunkLoadError(error: unknown, scope = "route") {
  if (!isChunkLoadError(error) || typeof window === "undefined") return false;

  const now = Date.now();
  const pathScope = `${window.location.pathname}:${scope}`;
  const storageKey = `__mogsy_chunk_reload_at__:${pathScope}`;
  const last = Number(sessionStorage.getItem(storageKey) || "0");

  if (now - last <= RELOAD_WINDOW_MS) return false;

  sessionStorage.setItem(storageKey, String(now));

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("__mogsy_reload", String(now));
  window.location.replace(nextUrl.toString());

  return true;
}

export function installChunkLoadRecovery() {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    if (recoverFromChunkLoadError(event.reason, "unhandled-rejection")) {
      event.preventDefault();
    }
  });

  window.addEventListener("error", (event) => {
    recoverFromChunkLoadError(event.error || event.message, "window-error");
  });
}