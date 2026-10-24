// PULSE-2B — workspace state: one snapshot from the repository, refreshed
// after every write so the UI never shows a change the store didn't accept.
import { useCallback, useEffect, useRef, useState } from "react";

import type { PulseWorkspaceSnapshot } from "./contract";
import { PulseRepositoryError, repositoryErrorMessage, type PulseAdminRepository } from "./repository";
import type { PulseIssue } from "./validation";

// Flat, not a discriminated union: tsconfig.app.json is strict:false, where `!r.ok` doesn't narrow.
export interface PulseWriteResult {
  ok: boolean;
  /** Empty when ok. */
  message: string;
  issues: PulseIssue[];
}

export interface PulseWorkspaceState {
  snapshot: PulseWorkspaceSnapshot | null;
  loadError: string | null;
  busy: boolean;
  reload(): Promise<void>;
  /** Run one repository write, then reload. Never throws. */
  write(op: (repo: PulseAdminRepository) => Promise<unknown>): Promise<PulseWriteResult>;
}

export function usePulseWorkspace(repo: PulseAdminRepository): PulseWorkspaceState {
  const [snapshot, setSnapshot] = useState<PulseWorkspaceSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const reload = useCallback(async () => {
    try {
      const next = await repo.load();
      if (alive.current) { setSnapshot(next); setLoadError(null); }
    } catch (err) {
      if (alive.current) setLoadError(repositoryErrorMessage(err));
    }
  }, [repo]);

  useEffect(() => { void reload(); }, [reload]);

  const write = useCallback(async (op: (r: PulseAdminRepository) => Promise<unknown>): Promise<PulseWriteResult> => {
    setBusy(true);
    try {
      await op(repo);
      await reload();
      return { ok: true, message: "", issues: [] };
    } catch (err) {
      // A conflict means our snapshot is stale: refresh it so the next attempt is informed.
      if (err instanceof PulseRepositoryError && err.code === "conflict") await reload();
      return { ok: false, message: repositoryErrorMessage(err), issues: err instanceof PulseRepositoryError ? err.issues : [] };
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [repo, reload]);

  return { snapshot, loadError, busy, reload, write };
}

/** ISO ↔ <input type="datetime-local"> (the owner's local clock). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
