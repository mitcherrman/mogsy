// Shared E2E helpers: load minted personas and inject a chosen identity into
// the page's localStorage BEFORE the app boots (so useAuth hydrates it).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const ARTIFACTS = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ".artifacts");

export type PersonaKey = "acct1" | "acct2" | "anon" | "admin";

export function personas(): Record<PersonaKey, any> {
  return JSON.parse(readFileSync(path.join(ARTIFACTS, "personas.json"), "utf8"));
}

/** Inject a persona before any app script runs. Omit `key` for a pure guest. */
export async function useIdentity(page: Page, key?: PersonaKey) {
  const p = key ? personas()[key] : null;
  await page.addInitScript((identity) => {
    if (identity) localStorage.setItem("mogsy_e2e_identity", JSON.stringify(identity));
    else localStorage.removeItem("mogsy_e2e_identity");
  }, p);
}
