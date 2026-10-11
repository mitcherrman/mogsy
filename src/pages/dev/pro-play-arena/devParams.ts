/** PPQ2-INT — the DEV route's query contract (see ProPlayArenaDev.tsx). */
import { resolveFixtureKeys, type FixtureEvidence, type FixtureFault } from "./fixtureTransport";

export type ArenaDevSource = "live" | "fixture";

export interface ArenaDevParams {
  source: ArenaDevSource;
  keys: string[];
  latencyMs: number;
  fault: FixtureFault;
  evidence: FixtureEvidence;
  longNames: boolean;
}

export function readArenaDevParams(search: string): ArenaDevParams {
  const q = new URLSearchParams(search);
  const latency = Number(q.get("latency"));
  const fault = q.get("fault");
  return {
    source: q.get("source") === "fixture" ? "fixture" : "live",
    keys: resolveFixtureKeys(q.get("set")),
    latencyMs: Number.isFinite(latency) && q.get("latency") !== null ? latency : 350,
    fault: fault === "start" || fault === "answer" ? fault : "none",
    evidence: q.get("evidence") === "partial" || q.get("evidence") === "absent"
      ? (q.get("evidence") as FixtureEvidence) : "full",
    longNames: q.get("names") === "long",
  };
}
