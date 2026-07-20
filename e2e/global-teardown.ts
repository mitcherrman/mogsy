// Stop the backend if global-setup started it.
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const PID_FILE = path.join(HERE, ".artifacts", "backend.pid");

export default async function globalTeardown() {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  rmSync(PID_FILE, { force: true });
}
