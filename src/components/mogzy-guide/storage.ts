/**
 * One-time / local persistence for guide messages.
 *
 * Browser-local only: no backend, no account sync. Every access is wrapped —
 * localStorage can throw (private windows, blocked site data) — and a failed
 * store degrades to an in-memory set, so a one-time message then shows once
 * per page load instead of breaking.
 */

export interface GuideStorage {
  has(key: string): boolean;
  set(key: string): void;
  clear(key: string): void;
}

const PREFIX = "mogzy-guide:v1:";

export function guideStorageKey(surface: string, messageId: string): string {
  return `${PREFIX}${surface}:${messageId}`;
}

export function createGuideStorage(
  backing: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocalStorage(),
): GuideStorage {
  const memory = new Set<string>();
  return {
    has(key) {
      if (memory.has(key)) return true;
      try {
        return backing?.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    set(key) {
      memory.add(key);
      try {
        backing?.setItem(key, "1");
      } catch {
        /* memory fallback already recorded it */
      }
    },
    clear(key) {
      memory.delete(key);
      try {
        backing?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

let defaultStorage: GuideStorage | null = null;

export function getDefaultGuideStorage(): GuideStorage {
  defaultStorage ??= createGuideStorage();
  return defaultStorage;
}
