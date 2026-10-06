// ---------------------------------------------------------------------------
// OWN1 — trusted owner device credential (browser side).
//
// The credential is a 256-bit random token minted by the server
// (owner_device_enroll, requires owner + fresh aal2); the server stores only
// its SHA-256. The browser keeps the opaque token in IndexedDB — never a
// boolean "trusted" flag, and never in localStorage. On each admin visit the
// token is presented to owner_device_attest, which binds a 15-minute
// attestation to the CURRENT Supabase session id. The token by itself grants
// nothing: it must accompany the owner's own authenticated session, and
// sensitive actions still require fresh aal2.
// ---------------------------------------------------------------------------

import { ownerRpc } from "./ownerAuth";

const DB = "mogzy-owner";
const STORE = "device";
const KEY = "credential";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => resolve(null);
  });
}

export async function readDeviceToken(): Promise<string | null> {
  const v = await tx<unknown>("readonly", (s) => s.get(KEY));
  return typeof v === "string" && v.length >= 32 ? v : null;
}
export async function writeDeviceToken(token: string): Promise<void> {
  await tx("readwrite", (s) => s.put(token, KEY));
}
export async function forgetDeviceToken(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY));
}

/** Present the stored token for this session. Returns true if attested. */
export async function attestStoredDevice(): Promise<boolean> {
  const token = await readDeviceToken();
  if (!token) return false;
  const { data, error } = await ownerRpc("owner_device_attest", { _token: token });
  const ok = !error && !!data && (data as { ok?: unknown }).ok === true;
  if (!ok && !error && (data as { code?: unknown } | null)?.code === "invalid_device") {
    await forgetDeviceToken(); // revoked/expired: drop it
  }
  return ok;
}

/** Enroll this browser (server enforces owner + fresh aal2). */
export async function enrollThisDevice(label: string): Promise<boolean> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : null;
  const { data, error } = await ownerRpc("owner_device_enroll", { _label: label, _user_agent: ua });
  const token = (data as { token?: unknown } | null)?.token;
  if (error || typeof token !== "string") return false;
  await writeDeviceToken(token);
  return true;
}
