/**
 * GM-M1 — the Match Grid playtest harness. DEVELOPMENT ONLY: registered in
 * App.tsx behind `import.meta.env.DEV`, so a production build drops it and the
 * path 404s.
 *
 * It is the HOST for the prototype: it builds a rune round from the authority
 * adapter, keeps the canonical mapping in a ref the primitive never receives,
 * and after Lock stands in for the server by grading in that closure and
 * passing only the resulting `MatchReveal` down. The primitive itself cannot
 * grade (board.ts has no grader), and nothing about correctness is in the DOM
 * before the reveal.
 *
 *   /dev/match-grid?round=academy
 *     &state=open|complete|revealed-right|revealed-wrong   (pre-arranged boards for capture)
 *     &roster=backend|frontend                              (ask /api/meta/runes, or not)
 *     &motion=reduce                                        (force the reduced-motion path)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MatchGrid } from "@/components/match-grid/MatchGrid";
import { RuneTreeGlyph } from "@/components/match-grid/RuneTreeGlyph";
import type { InteractionPhase, MatchPublic, MatchResponse, MatchReveal, MatchSeat, MatchValue } from "@/lib/match-grid/contract";
import { seatEntity } from "@/lib/match-grid/board";
import {
  buildRuneRound, fetchBackendRunes, frontendOnlyRoster, gradeRuneRound, intersectRoster, RUNE_ROUNDS,
  type RuneRoster, type RuneRoundSpec, type RuneSecret,
} from "./labRuneRounds";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

const API_BASE = (import.meta.env?.VITE_COMBAT_API_URL as string | undefined) || "http://127.0.0.1:8000";
const SERVER_LATENCY_MS = 420;

type Prearranged = "open" | "complete" | "revealed-right" | "revealed-wrong";

/** A deterministic board for capture: the canonical map, or that map with a few sigils misplaced. */
function prearrange(content: MatchPublic, secret: RuneSecret, kind: Prearranged): MatchValue {
  if (kind === "open") return {};
  let v: Record<string, MatchSeat> = {};
  const groups = content.groups.map((g) => g.token);
  content.entities.forEach((e, i) => {
    let target = secret.canonical[e.token];
    if (kind === "revealed-wrong" && i % 3 === 1) {
      target = groups[(groups.indexOf(target) + 1 + (i % 2)) % groups.length];
    }
    v = seatEntity(content, v, e.token, target).next;
  });
  return v;
}

export default function MatchGridLab() {
  const [params, setParams] = useSearchParams();
  const roundId = params.get("round") ?? "academy";
  const spec: RuneRoundSpec = RUNE_ROUNDS.find((r) => r.id === roundId) ?? RUNE_ROUNDS[2];
  const wantBackend = (params.get("roster") ?? "backend") !== "frontend";
  const forceReduce = params.get("motion") === "reduce";
  const prearranged = (params.get("state") as Prearranged | null) ?? "open";

  // Honour ?motion=reduce through the app's own switch, so the primitive's single reader sees it.
  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  // ---- roster: ask the backend's rune table once, fall back to the frontend table.
  const [roster, setRoster] = useState<RuneRoster | null>(wantBackend ? null : frontendOnlyRoster("roster=frontend"));
  useEffect(() => {
    if (!wantBackend) { setRoster(frontendOnlyRoster("roster=frontend")); return; }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    fetchBackendRunes(API_BASE, (input, init) => fetch(input, { ...init, signal: ctrl.signal }))
      .then((rows) => { if (!cancelled) setRoster(intersectRoster(rows)); })
      .catch((err: unknown) => { if (!cancelled) setRoster(frontendOnlyRoster(err instanceof Error ? err.message : "unreachable")); })
      .finally(() => window.clearTimeout(timer));
    return () => { cancelled = true; ctrl.abort(); };
  }, [wantBackend]);

  // ---- the round. The secret lives in a ref; the primitive gets only `content`.
  const [generation, setGeneration] = useState(0);
  const round = useMemo(() => (roster ? buildRuneRound(spec, roster) : null), [spec, roster, generation]); // eslint-disable-line react-hooks/exhaustive-deps
  const secretRef = useRef<RuneSecret | null>(null);
  secretRef.current = round?.secret ?? null;

  const [value, setValue] = useState<MatchValue>({});
  const [phase, setPhase] = useState<InteractionPhase>("open");
  const [reveal, setReveal] = useState<MatchReveal | null>(null);
  const [lastResponse, setLastResponse] = useState<MatchResponse | null>(null);
  const [revealDone, setRevealDone] = useState(false);

  // Reset on a new round, and apply a pre-arranged board when asked.
  useEffect(() => {
    if (!round) return;
    const v = prearrange(round.content, round.secret, prearranged);
    setValue(v);
    setReveal(null);
    setLastResponse(null);
    setRevealDone(false);
    if (prearranged.startsWith("revealed")) {
      const response: MatchResponse = { assignments: round.content.entities.map((e) => ({ entity: e.token, group: v[e.token].group })) };
      setLastResponse(response);
      setPhase("locked");
      const t = window.setTimeout(() => { setReveal(gradeRuneRound(round.secret, response)); setPhase("revealed"); }, 300);
      return () => window.clearTimeout(t);
    }
    setPhase("open");
  }, [round, prearranged]);

  const onLock = useCallback((response: MatchResponse) => {
    setLastResponse(response);
    setPhase("locked");
    const secret = secretRef.current;
    // Stand-in for the server round trip: grade in the host's closure, hand down only the reveal.
    window.setTimeout(() => {
      if (!secret) return;
      setReveal(gradeRuneRound(secret, response));
      setPhase("revealed");
    }, SERVER_LATENCY_MS);
  }, []);

  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v === null) p.delete(k); else p.set(k, v); }
    setParams(p, { replace: true });
  };

  const nextRound = () => {
    const i = RUNE_ROUNDS.findIndex((r) => r.id === spec.id);
    go({ round: RUNE_ROUNDS[(i + 1) % RUNE_ROUNDS.length].id, state: null });
  };

  const rosterLine = !roster
    ? "Consulting the Academy's rune table…"
    : roster.status.kind === "agreed"
      ? `Roster: backend runes table ✓ ${roster.status.backendRows} rows · ${roster.status.agreed} agree with the Data Dragon table${roster.status.backendOnly.length ? ` · backend-only: ${roster.status.backendOnly.join(", ")}` : ""}${roster.status.disagreed.length ? ` · DISAGREE: ${roster.status.disagreed.join(", ")}` : ""}`
      : `Roster: Data Dragon table only (${roster.status.reason}) — not production-reproducible`;

  return (
    <div data-testid="match-grid-lab" className="min-h-screen w-full bg-[#050b15] text-[#efe8d6]" style={{ backgroundImage: "radial-gradient(90% 60% at 50% 0%, rgba(47,143,202,0.08), transparent 60%)" }}>
      <div className="mx-auto w-full max-w-[1200px] px-2 py-2 sm:px-4 sm:py-3">
        <div className="mb-2 flex flex-nowrap items-center gap-x-3 gap-y-1 overflow-x-auto text-[11px] text-[#a9b3c1] [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible">
          <span className="ranked-eyebrow shrink-0">Match Grid · M1 lab</span>
          <span className="opacity-60">·</span>
          <nav aria-label="Round" className="flex shrink-0 gap-1">
            {RUNE_ROUNDS.map((r) => (
              <button key={r.id} type="button" onClick={() => go({ round: r.id, state: null })}
                data-active={r.id === spec.id ? "" : undefined}
                className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 text-[11px] text-[#c6b48f] hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110] data-[active]:text-[#f6e6bb]">
                {r.title}
              </button>
            ))}
          </nav>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => go({ state: null })} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Open</button>
            <button type="button" onClick={() => go({ state: "complete" })} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Pre-filled</button>
            <button type="button" onClick={() => go({ state: "revealed-right" })} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reveal · right</button>
            <button type="button" onClick={() => go({ state: "revealed-wrong" })} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reveal · wrong</button>
            <button type="button" onClick={() => go({ motion: forceReduce ? null : "reduce" })} data-active={forceReduce ? "" : undefined}
              className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70 data-[active]:border-[#d5b66f] data-[active]:bg-[#2a2110]">Reduced motion</button>
            <button type="button" onClick={() => { setGeneration((g) => g + 1); go({ state: null }); }} className="whitespace-nowrap rounded border border-[#d5b66f]/30 px-2 py-0.5 hover:border-[#d5b66f]/70">Reset</button>
          </span>
        </div>

        {round ? (
          <MatchGrid
            key={`${spec.id}:${generation}`}
            content={round.content}
            phase={phase}
            value={value}
            onChange={setValue}
            onLock={onLock}
            reveal={reveal}
            renderGroupGlyph={(g) => <RuneTreeGlyph glyph={g.glyph} />}
            onRevealComplete={() => setRevealDone(true)}
          />
        ) : (
          <div className="ranked-panel flex h-[520px] items-center justify-center text-sm text-[#a9b3c1]" aria-busy>
            Consulting the Academy's rune table…
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#a9b3c1]">
          <span data-testid="lab-roster">{rosterLine}</span>
          <span className="ml-auto flex items-center gap-2">
            {lastResponse ? <span data-testid="lab-response" className="font-mono opacity-70">{lastResponse.assignments.map((a) => `${a.entity}→${a.group}`).join(" ")}</span> : null}
            {revealDone ? (
              <button type="button" onClick={nextRound} data-testid="lab-next"
                className="rounded border border-[#d5b66f] bg-[#2a2110] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[#f6e6bb] hover:bg-[#3a2d14]">
                Next round
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
