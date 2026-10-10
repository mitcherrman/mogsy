/** PPQ2-INT — the DEV route's query contract (see ProPlayArenaDev.tsx). */
import { resolveFixtureKeys, type FixtureFault } from "./fixtureTransport";

export type ArenaDevSource = "live" | "fixture";

export interface ArenaDevParams {
  source: ArenaDevSource;
  keys: string[];
  latencyMs: number;
  fault: FixtureFault;
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
  };
}
