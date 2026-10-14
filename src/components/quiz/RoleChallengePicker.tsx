import { useEffect, useMemo, useState } from "react";
import { getRoleChallengeCatalog, getRoleChallengeStatus, startRoleChallenge } from "@/lib/role-challenge/client";
import type { RoleChallengeCatalog, RoleChallengeRole, RoleChallengeStatus } from "@/lib/role-challenge/contracts";

const ROLES: readonly RoleChallengeRole[] = ["top", "jungle", "mid", "adc", "support"];
type Props = {
  enabled: boolean;
  onRequireAccount: () => void;
  hasAccount: boolean;
  onEnterMatch: (matchId: string) => void;
};
export default function RoleChallengePicker({ enabled, hasAccount, onRequireAccount, onEnterMatch }: Props) {
  const [catalog, setCatalog] = useState<RoleChallengeCatalog | null>(null);
  const [status, setStatus] = useState<RoleChallengeStatus | null>(null);
  const [role, setRole] = useState<RoleChallengeRole>("mid");
  const [champion, setChampion] = useState<string>("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry of one user action must reuse exactly the same start key.
  const [pendingStartKey, setPendingStartKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      getRoleChallengeCatalog(ctrl.signal),
      hasAccount ? getRoleChallengeStatus(ctrl.signal) : Promise.resolve(null),
    ]).then(([nextCatalog, nextStatus]) => {
      if (ctrl.signal.aborted) return;
      setCatalog(nextCatalog);
      setStatus(nextStatus);
    }).catch((e: unknown) => {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : "Role Challenge unavailable");
    }).finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [enabled, hasAccount]);
  const selection = catalog?.roles.find(x => x.role === role);
  const filtered = useMemo(() => (selection?.champions ?? []).filter(c =>
    c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ||
    c.id.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  ), [selection, query]);
  const selected = selection?.champions.find(c => c.id === champion) ?? null;
  const next = status?.nextStart;
  const canStart = !!selected && hasAccount && !!next?.allowed && !busy && !loading;
  const start = async () => {
    if (!hasAccount) { onRequireAccount(); return; }
    if (!canStart || !selected) return;
    const key = pendingStartKey ?? crypto.randomUUID();
    if (!pendingStartKey) setPendingStartKey(key);
    setBusy(true); setError(null);
    try {
      const result = await startRoleChallenge(role, selected.id, key);
      setPendingStartKey(null);
      onEnterMatch(result.matchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Role Challenge");
      // Preserve key on network errors so retry is idempotent.
    } finally { setBusy(false); }
  };
  return (
    <div data-testid="role-challenge-picker" className="w-full space-y-3 text-left">
      <div className="grid grid-cols-5 gap-1" role="group" aria-label="Role Challenge role">
        {ROLES.map(id => (
          <button key={id} type="button" aria-pressed={role === id}
            onClick={() => { setRole(id); setChampion(""); setPendingStartKey(null); }}
            className={`rounded border px-1 py-2 text-[10px] font-bold uppercase ${role === id ? "border-amber-700 bg-amber-100 text-amber-950" : "border-amber-900/30 text-amber-950"}`}>
            {id}
          </button>
        ))}
      </div>
      {loading ? <p role="status">Loading champion selection…</p> : null}
      <label className="block text-xs font-bold text-amber-950" htmlFor="rc-champion-search">Find a champion</label>
      <input id="rc-champion-search" value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Search all champions" className="w-full rounded border border-amber-900/40 bg-white/75 p-2 text-sm text-slate-950" />
      <div className="max-h-40 overflow-y-auto rounded border border-amber-900/25" role="group" aria-label="Champions">
        {filtered.map(c => (
          <button key={c.id} type="button" onClick={() => { setChampion(c.id); setPendingStartKey(null); }}
            aria-pressed={champion === c.id}
            className={`block w-full px-2 py-1 text-left text-sm text-amber-950 ${champion === c.id ? "bg-amber-200 font-bold" : "hover:bg-amber-100/70"}`}>
            {c.name}{c.conventional ? "" : " · Off-meta"}
          </button>
        ))}
        {!loading && filtered.length === 0 ? <p className="p-2 text-xs text-amber-950">No champions found</p> : null}
      </div>
      {selected ? <p className="text-xs text-amber-950">{selected.name} · {role.toUpperCase()} · {selected.conventional ? "Conventional" : "Off-meta permitted"}</p> : null}
      {hasAccount && next && !next.allowed ? <p role="status" className="text-xs text-amber-950">{next.allowed === null ? "Eligibility unavailable. Retry later." : next.reason === "daily_limit_reached" ? "Free daily attempt used. Premium permits another start." : "Finish your active match first."}</p> : null}
      {error ? <p role="alert" className="text-xs text-red-900">{error}</p> : null}
      <button type="button" disabled={hasAccount && !canStart} onClick={start}
        className="w-full rounded-lg bg-amber-900 px-3 py-3 font-black uppercase text-amber-50 disabled:opacity-50">
        {!hasAccount ? "Sign in to play" : busy ? "Starting…" : "Play Role Challenge"}
      </button>
      <p className="text-center text-[11px] text-amber-950/75">12 questions · Unrated · Any champion in any role</p>
    </div>
  );
}
