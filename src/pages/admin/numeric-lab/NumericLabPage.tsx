/**
 * NUM-REC2 — `/admin/numeric-lab`: the owner-only playtest of the two ORIGINAL
 * numeric mechanics, Stat Drop (MIG1.2) and Combat Estimate (CE1).
 *
 * WHAT PROTECTS IT. The route sits behind `AdminRoute` (UX only), and every
 * round comes from `/api/admin/numeric-lab/*`, which the backend gates with
 * `require_admin` and a deployment flag. This chunk carries no round, no
 * answer and no capture: before Lock it holds public rounds, and a round's
 * private block arrives only as the answer to that round's Lock.
 *
 * WHAT IT CLAIMS. Every value is a HISTORICAL capture of an earlier authority
 * run (CE1: the certified combat seam at backend 8829fc3c; MIG1.2: Pro Play
 * and Journey captures), not a current-patch certification and not a
 * server-authoritative grade. No tolerance is adopted: the reveal is
 * descriptive, and the owner's gut call is logged blind for CEG1's offline
 * grader. Nothing is stored server-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FlaskConical } from "lucide-react";
import {
  NumericLabApiError, numericLabApi, type CombatEstimateRounds, type NumericLabApi, type StatDropRounds,
} from "@/lib/numeric-lab/api";
import {
  combatEstimateCsv, detectDevice, statDropCsv, type Device, type GutCall, type PlaytestEntry,
} from "@/lib/numeric-lab/playtestLog";
import { CombatEstimateOwnerLab } from "./CombatEstimateOwnerLab";
import { StatDropOwnerLab } from "./StatDropOwnerLab";

export type Mode = "stat-drop" | "combat-estimate";

/** What a host reports once a round has been locked AND revealed. */
export interface LockedRound {
  mode: Mode;
  round: string;
  value: number;
  seconds: number | null;
}

type Load<T> = { state: "loading" } | { state: "ready"; data: T } | { state: "error"; message: string; status: number | null };

const GUTS: { id: GutCall; label: string }[] = [
  { id: "fair-correct", label: "Fair · I knew it" },
  { id: "fair-incorrect", label: "Fair · I didn't" },
  { id: "unsure", label: "Unsure" },
];

function useRounds<T>(load: () => Promise<T>, key: string): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setS({ state: "loading" });
    load().then((data) => { if (!cancelled) setS({ state: "ready", data }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = err instanceof NumericLabApiError ? err : null;
        setS({ state: "error", message: e?.message ?? "Could not load rounds.", status: e?.status ?? null });
      });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return s;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function LoadState({ s }: { s: Load<unknown> }) {
  if (s.state === "loading") return <p data-testid="numeric-lab-loading" className="p-6 text-center text-sm text-[#a9b3c1]" aria-busy>Loading rounds…</p>;
  if (s.state !== "error") return null;
  const why = s.status === 404 ? "The numeric lab is not enabled on this backend (NUMERIC_LAB_ENABLED)."
    : s.status === 401 || s.status === 403 ? "This backend did not accept an owner session for the numeric lab."
    : s.message;
  return <p role="alert" data-testid="numeric-lab-error" className="mx-auto max-w-2xl p-6 text-center text-sm text-red-300">{why}</p>;
}

export default function NumericLabPage({ api: injected }: { api?: NumericLabApi } = {}) {
  const api = useMemo(() => injected ?? numericLabApi(), [injected]);
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get("mode") === "combat-estimate" ? "combat-estimate" : "stat-drop";
  const sd = useRounds<StatDropRounds>(api.statDropRounds, `sd:${String(!!injected)}`);
  const ce = useRounds<CombatEstimateRounds>(api.combatEstimateRounds, `ce:${String(!!injected)}`);

  const [device, setDevice] = useState<Device>(() => detectDevice());
  const [log, setLog] = useState<PlaytestEntry[]>([]);
  const [pending, setPending] = useState<LockedRound | null>(null);
  const [gut, setGut] = useState<GutCall | null>(null);
  const [note, setNote] = useState("");

  const onSettled = useCallback((r: LockedRound) => { setPending(r); setGut(null); setNote(""); }, []);
  const record = () => {
    if (!pending || !gut) return;
    setLog((l) => [...l, { ...pending, device, gut, note }]);
    setPending(null);
  };
  const setMode = (m: Mode) => { const p = new URLSearchParams(); p.set("mode", m); setParams(p, { replace: true }); setPending(null); };

  const authority = mode === "combat-estimate"
    ? (ce.state === "ready" ? `CE1 capture of ${ce.data.capture.implementation} at backend ${ce.data.capture.backend_commit.slice(0, 8)}, captured ${ce.data.capture.captured_at.slice(0, 10)}. Beam scale: ${ce.data.capture.scale_policy.id} (development-only).` : "")
    : (sd.state === "ready" ? `MIG1.2 rounds from ${sd.data.capture_source.branch} @ ${sd.data.capture_source.commit.slice(0, 8)}: Pro Play and Journey authority captures; scales are lab-authored per metric family.` : "");

  const modeSwitch = (
    <nav aria-label="Mechanic" className="flex shrink-0 gap-1">
      {(["stat-drop", "combat-estimate"] as Mode[]).map((m) => (
        <button key={m} type="button" data-testid={`numeric-lab-tab-${m}`} aria-pressed={mode === m} onClick={() => setMode(m)}
          className="whitespace-nowrap rounded border border-[#d5b66f]/40 px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] aria-pressed:border-[#d5b66f] aria-pressed:bg-[#2a2110] aria-pressed:text-[#f6e6bb]">
          {m === "stat-drop" ? "Stat Drop" : "Combat Estimate"}
        </button>
      ))}
    </nav>
  );

  return (
    <div data-testid="numeric-lab-page" className="min-h-screen w-full bg-[#050b15] pb-10 text-[#efe8d6]">
      {/* The arena is viewport-locked and sits under the app header at lg
          (ArenaShell), so it comes FIRST; the switch rides its chrome row and
          the prototype label its header. Everything else follows it. */}
      {mode === "stat-drop"
        ? (sd.state === "ready" ? <StatDropOwnerLab api={api} data={sd.data} onSettled={onSettled} modeSwitch={modeSwitch} /> : <><div className="p-3">{modeSwitch}</div><LoadState s={sd} /></>)
        : (ce.state === "ready" ? <CombatEstimateOwnerLab api={api} data={ce.data} onSettled={onSettled} modeSwitch={modeSwitch} /> : <><div className="p-3">{modeSwitch}</div><LoadState s={ce} /></>)}
      {/* Above the arena's decorative floor layer (pointer-events-none, drawn
          past the shell's bottom edge), which would otherwise paint over it. */}
      <div className="relative z-30 mx-auto mt-3 w-full max-w-3xl px-3">
          <div role="note" data-testid="numeric-lab-banner"
          className="mb-2 flex items-start gap-2 rounded border border-amber-400/60 bg-amber-950/60 px-3 py-2 text-[12px] leading-snug text-amber-100">
          <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="uppercase tracking-[0.14em]">Prototype — not server-authoritatively graded.</strong>{" "}
            Owner-only playtest. Values are <em>historical captures</em>, not current-patch facts. No pass mark, no points,
            no tolerance adopted; nothing is stored. Not part of Quiz, Daily or Ranked.
            {authority ? <span data-testid="numeric-lab-authority" className="mt-1 block text-amber-200/80">{authority}</span> : null}
          </span>
        </div>
      </div>

      <section aria-label="Owner feedback" data-testid="numeric-lab-feedback" className="relative z-30 mx-auto mt-3 w-full max-w-3xl px-3">
        {pending ? (
          <div className="rounded border border-[#d5b66f]/40 bg-[#0b1727] p-3 text-sm">
            <p className="mb-2 text-[13px]">
              Would you accept <strong className="font-mono">{pending.value}</strong> as knowing the answer?
              <span className="block text-[11px] text-[#a9b3c1]">Your call, logged blind: the lab grades nothing.</span>
            </p>
            <div role="radiogroup" aria-label="Gut call" className="mb-2 flex flex-wrap gap-1">
              {GUTS.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={gut === g.id} data-testid={`gut-${g.id}`} onClick={() => setGut(g.id)}
                  className="min-h-[44px] rounded border border-[#d5b66f]/40 px-3 text-xs aria-checked:border-[#d5b66f] aria-checked:bg-[#2a2110]">{g.label}</button>
              ))}
            </div>
            <label className="mb-2 block text-[11px] text-[#a9b3c1]">
              Note — input feel, premise clarity, did the reveal explain the miss?
              <textarea data-testid="gut-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="mt-1 block w-full rounded border border-[#d5b66f]/30 bg-black/50 p-2 text-sm text-[#efe8d6]" />
            </label>
            <button type="button" data-testid="gut-record" disabled={!gut} onClick={record}
              className="min-h-[44px] rounded border border-[#d5b66f] bg-[#2a2110] px-4 text-xs uppercase tracking-[0.14em] text-[#f6e6bb] disabled:opacity-40">
              Add to log
            </button>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#a9b3c1]">
          <span data-testid="numeric-lab-log-count">{log.length} logged this session</span>
          <label className="flex items-center gap-1">Device
            <select data-testid="numeric-lab-device" value={device} onChange={(e) => setDevice(e.target.value as Device)}
              className="rounded border border-[#d5b66f]/30 bg-black/60 px-1 text-[#efe8d6]">
              <option value="desktop">desktop</option><option value="phone">phone</option>
            </select>
          </label>
          <button type="button" data-testid="download-ce-log" disabled={!log.some((e) => e.mode === "combat-estimate")}
            onClick={() => download("combat-estimate-playtest.csv", combatEstimateCsv(log))}
            className="inline-flex min-h-[36px] items-center gap-1 rounded border border-[#d5b66f]/40 px-2 disabled:opacity-40">
            <Download aria-hidden className="size-3" /> Combat Estimate log (CEG1 CSV)
          </button>
          <button type="button" data-testid="download-sd-log" disabled={!log.some((e) => e.mode === "stat-drop")}
            onClick={() => download("stat-drop-playtest.csv", statDropCsv(log))}
            className="inline-flex min-h-[36px] items-center gap-1 rounded border border-[#d5b66f]/40 px-2 disabled:opacity-40">
            <Download aria-hidden className="size-3" /> Stat Drop log (CSV)
          </button>
        </div>
      </section>
    </div>
  );
}
