// OWN1.1 — a pending "verify it's you" request for one sensitive action.
//
// Sensitive actions ask for MFA through this queue instead of unmounting the
// admin app: OwnerStepUpHost (mounted once in App) renders the prompt and
// resolves the request. Concurrent requests share one prompt. With no host
// mounted the request resolves false (nothing runs) rather than hanging.

export interface OwnerStepUpRequest {
  reason: string;
}

let pending: { request: OwnerStepUpRequest; promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null;
let hosts = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function requestOwnerStepUp(reason: string): Promise<boolean> {
  if (hosts === 0) return Promise.resolve(false);
  if (pending) return pending.promise;
  let resolve!: (ok: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  pending = { request: { reason }, promise, resolve };
  emit();
  return promise;
}

export function settleOwnerStepUp(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export function getPendingOwnerStepUp(): OwnerStepUpRequest | null {
  return pending?.request ?? null;
}

export function subscribeOwnerStepUp(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by OwnerStepUpHost on mount; returns its unmount. */
export function registerOwnerStepUpHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0 && pending) settleOwnerStepUp(false);
  };
}
