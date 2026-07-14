/**
 * Local dev-server management for the screenshot runner.
 * Starts `npx vite` directly (NOT `npm run dev`, whose predev hook runs the
 * network-touching sitemap generator), or reuses an explicit --base-url.
 */
import { spawn, type ChildProcess } from "node:child_process";

const RUNNER_PORT = 5199;
const STARTUP_TIMEOUT_MS = 90_000;

export type ManagedServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

async function waitForServer(url: string, timeoutMs: number, proc?: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${proc.exitCode}`);
    }
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dev server did not become ready at ${url} within ${timeoutMs / 1000}s`);
}

export async function ensureServer(baseUrl?: string): Promise<ManagedServer> {
  if (baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, "");
    await waitForServer(trimmed, 10_000);
    console.log(`Reusing server at ${trimmed}`);
    return { baseUrl: trimmed, stop: async () => {} };
  }

  const url = `http://127.0.0.1:${RUNNER_PORT}`;
  console.log(`Starting vite dev server on port ${RUNNER_PORT}...`);
  const proc = spawn("npx", ["vite", "--port", String(RUNNER_PORT), "--strictPort"], {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  proc.stdout?.on("data", (d) => (output += String(d)));
  proc.stderr?.on("data", (d) => (output += String(d)));

  try {
    await waitForServer(url, STARTUP_TIMEOUT_MS, proc);
  } catch (err) {
    proc.kill();
    throw new Error(
      `${err instanceof Error ? err.message : err}\n--- server output ---\n${output.slice(-2000)}`,
    );
  }
  console.log(`Dev server ready at ${url}`);

  return {
    baseUrl: url,
    stop: () =>
      new Promise<void>((resolveStop) => {
        // Guaranteed resolution: 'exit' event, taskkill completion, or the
        // hard timeout — whichever comes first. The timeout is deliberately
        // NOT unref'd: an unref'd fallback can leave this promise pending
        // forever when the kill races fail (the large-run hang).
        let done = false;
        const hardTimeout = setTimeout(() => finish(), 5000);
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(hardTimeout);
          resolveStop();
        };
        proc.once("exit", finish);
        // Windows: `npx vite` runs through a shell whose children survive
        // proc.kill(); kill the TRACKED pid's whole tree first (never a
        // name-based kill), then the shell itself, then release our pipes.
        if (process.platform === "win32" && proc.pid) {
          const tk = spawn(
            "taskkill",
            ["/pid", String(proc.pid), "/T", "/F"],
            { shell: true, stdio: "ignore" },
          );
          const fallback = () => {
            try {
              proc.kill();
            } catch {
              /* already gone */
            }
            finish();
          };
          tk.once("exit", fallback);
          tk.once("error", fallback);
        } else {
          try {
            proc.kill();
          } catch {
            /* already gone */
          }
        }
        proc.stdout?.destroy();
        proc.stderr?.destroy();
      }),
  };
}
