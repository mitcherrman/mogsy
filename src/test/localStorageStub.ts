/**
 * Opt-in localStorage stub for tests that genuinely exercise persistence.
 *
 * WHY THIS EXISTS: this repo pins jsdom ^20.0.3 against vitest ^3.2.4, and that
 * combination does not expose a working Storage on the jsdom global — the test
 * environment provides a bare `localStorage` object with no getItem/setItem/
 * clear at all. Any suite that touches storage therefore fails on setup, which
 * is a pre-existing condition (src/lib/e2e/identity.test.ts fails identically
 * on an untouched checkout), not something introduced here.
 *
 * Deliberately NOT wired into src/test/setup.ts. Installing a working Storage
 * globally would change the behaviour of every suite in the repo at once,
 * including the ones currently failing for this reason — a repo-wide test-infra
 * change that deserves its own task with its own verification, not a silent
 * side effect of a feature branch. Suites that need storage opt in explicitly.
 *
 * Remove this once jsdom is upgraded and the global environment provides
 * Storage again.
 */

/**
 * Install a spec-shaped in-memory Storage at `globalThis.localStorage`.
 *
 * Returns a reset function; call it between tests. The stub is a real class
 * instance with the methods on its prototype, so `vi.spyOn(Storage.prototype,
 * …)`-style failure injection behaves the way production code would see it.
 */
export function installLocalStorageStub(): () => void {
  class MemoryStorage {
    #entries = new Map<string, string>();

    get length(): number {
      return this.#entries.size;
    }

    key(index: number): string | null {
      return Array.from(this.#entries.keys())[index] ?? null;
    }

    getItem(key: string): string | null {
      return this.#entries.has(key) ? (this.#entries.get(key) as string) : null;
    }

    setItem(key: string, value: string): void {
      this.#entries.set(String(key), String(value));
    }

    removeItem(key: string): void {
      this.#entries.delete(key);
    }

    clear(): void {
      this.#entries.clear();
    }
  }

  const storage = new MemoryStorage();

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  // Production code and tests reach for the global `Storage` (e.g. to spy on
  // Storage.prototype); point it at the stub so both agree on one prototype.
  Object.defineProperty(globalThis, "Storage", {
    value: MemoryStorage,
    configurable: true,
    writable: true,
  });

  return () => storage.clear();
}
