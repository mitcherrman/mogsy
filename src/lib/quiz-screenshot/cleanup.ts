/**
 * Cleanup registry + signal wiring for the screenshot runner.
 *
 * The runner registers teardown callbacks (kill managed Vite tree, close the
 * Playwright browser); runAll() executes each once, tolerating individual
 * failures. installSignalHandlers wires SIGINT/SIGTERM/uncaughtException to
 * run the registry and force-exit nonzero — process is injectable so tests
 * never touch real signals.
 */

export type CleanupFn = () => void | Promise<void>;

export type CleanupRegistry = {
  register: (name: string, fn: CleanupFn) => void;
  /** Run every registered cleanup once; never throws. */
  runAll: () => Promise<void>;
};

export function createCleanupRegistry(): CleanupRegistry {
  const entries: Array<{ name: string; fn: CleanupFn }> = [];
  let ran = false;
  return {
    register(name, fn) {
      entries.push({ name, fn });
    },
    async runAll() {
      if (ran) return;
      ran = true;
      // LIFO: most recently acquired resource (browser) torn down first.
      for (const { fn } of [...entries].reverse()) {
        try {
          await fn();
        } catch {
          /* best-effort teardown — keep going */
        }
      }
    },
  };
}

type ProcessLike = {
  once: (event: string, handler: (...args: unknown[]) => void) => unknown;
  exit: (code: number) => void;
};

/** Wire fatal signals/exceptions to cleanup + nonzero exit. */
export function installSignalHandlers(
  registry: CleanupRegistry,
  proc: ProcessLike,
  log: (msg: string) => void = () => {},
): void {
  const bail = (label: string, code: number) => async () => {
    log(`\n${label} — cleaning up...`);
    await registry.runAll();
    proc.exit(code);
  };
  proc.once("SIGINT", bail("Interrupted (SIGINT)", 130));
  proc.once("SIGTERM", bail("Terminated (SIGTERM)", 143));
  proc.once("uncaughtException", async (err) => {
    log(`\nUncaught exception: ${err instanceof Error ? err.stack ?? err.message : err}`);
    await registry.runAll();
    proc.exit(1);
  });
}
