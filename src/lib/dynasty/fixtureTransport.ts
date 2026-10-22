/**
 * ROG1-D1 — a RECORDED-PATH stand-in for the Dynasty backend, for tests and the
 * DEV-only preview (`/dev/dynasty`). Not used by `/admin/dynasty`.
 *
 * The fixtures in `./fixtures/*.json` are real responses captured from the
 * ROG1-C1 backend (PR #36, b2f41603) through its own FastAPI router on the
 * labelled synthetic catalog. This transport computes NOTHING: it replays
 * those snapshots in order and accepts an action only when it is exactly the
 * action that produced the next recorded snapshot. Anything else is refused
 * the way the backend would refuse it (stale seq, wrong phase), or with
 * `FIXTURE_OFF_PATH`, so the browser never invents a draft, a roll or a score.
 */
import { readDynastySnapshot, type DynastySnapshot } from "./contracts";
import { DynastyApiError, type DynastyActionRequest, type DynastyTransport } from "./client";
import recordedRun from "./fixtures/recorded-run.json";
import altLoss from "./fixtures/alt-loss.json";
import altStomp from "./fixtures/alt-stomp.json";

export interface RecordedStep {
  request: { start_key: string } | Omit<DynastyActionRequest, "expected_seq" | "action_id"> & { expected_seq: number; action_id: string };
  response: unknown;
}
export interface RecordedRun { source: string; scenario: string; steps: RecordedStep[] }

export const DYNASTY_SCENARIOS = {
  /** Full run: draft → relic → lineup → a 4-3 win decided with a Flash Ready re-roll. */
  full: recordedRun as RecordedRun,
  /** Starts at a ready lineup; the match is a 3-4 loss. */
  loss: altLoss as RecordedRun,
  /** Starts at a ready lineup; the match is a 7-0 win. */
  stomp: altStomp as RecordedRun,
} as const;
export type DynastyScenario = keyof typeof DYNASTY_SCENARIOS;

type Failure = "network" | "disabled" | "integrity";

export interface FixtureTransport extends DynastyTransport {
  /** The recorded action that would advance the run, or null at the end. */
  nextRecorded(): { kind: string; payload: Record<string, unknown> } | null;
  /** Make the next call fail once, as an unreachable or refusing backend would. */
  failNext(failure: Failure): void;
  /** Every request this transport received, in order (tests). */
  readonly calls: { method: "start" | "read" | "act"; body?: unknown }[];
}

const stableJson = (v: unknown): string => JSON.stringify(v, (_k, val) =>
  val && typeof val === "object" && !Array.isArray(val)
    ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : val);

export function createFixtureTransport(
  run: RecordedRun = DYNASTY_SCENARIOS.full,
  { delayMs = 0 }: { delayMs?: number } = {},
): FixtureTransport {
  const steps = run.steps;
  let index = 0; // the step whose response is the current state
  let started = false;
  let pendingFailure: Failure | null = null;
  const used = new Map<string, string>(); // action_id -> kind+payload
  const calls: FixtureTransport["calls"] = [];

  const current = (): DynastySnapshot => readDynastySnapshot(steps[index].response);
  const wait = () => (delayMs > 0 ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  const fail = (status: number, code: string, message: string) => new DynastyApiError("backend", status, code, message);

  async function gate(): Promise<void> {
    await wait();
    const f = pendingFailure;
    pendingFailure = null;
    if (f === "network") throw new DynastyApiError("network", null, null, "Could not reach the Dynasty backend.");
    if (f === "disabled") throw fail(404, "DYNASTY_DISABLED", "DYNASTY_ENABLED is not set on this deployment.");
    if (f === "integrity") throw fail(500, "DYNASTY_RUN_INTEGRITY", "run failed replay");
  }

  return {
    calls,
    nextRecorded() {
      const next = steps[index + 1]?.request as { kind?: string; payload?: Record<string, unknown> } | undefined;
      return next?.kind ? { kind: next.kind, payload: next.payload ?? {} } : null;
    },
    failNext(failure) { pendingFailure = failure; },
    async start(startKey) {
      calls.push({ method: "start", body: { start_key: startKey } });
      await gate();
      const created = !started;
      started = true;
      return { ...current(), created };
    },
    async read(runId) {
      calls.push({ method: "read" });
      await gate();
      const snap = current();
      if (!started || runId !== snap.run_id) throw fail(404, "DYNASTY_RUN_NOT_FOUND", "no such dynasty run");
      return snap;
    },
    async act(runId, action) {
      calls.push({ method: "act", body: action });
      await gate();
      const snap = current();
      if (!started || runId !== snap.run_id) throw fail(404, "DYNASTY_RUN_NOT_FOUND", "no such dynasty run");
      const signature = stableJson({ kind: action.kind, payload: action.payload });
      const prior = used.get(action.action_id);
      if (prior !== undefined) {
        if (prior === signature) return { ...snap, applied: false, duplicate: true };
        throw fail(409, "ACTION_ID_REUSED", "action_id was already used for a different action");
      }
      if (action.expected_seq !== snap.seq) {
        throw fail(409, "STALE_SEQ", `expected_seq ${action.expected_seq} but the run is at ${snap.seq}`);
      }
      if (!snap.allowed_actions.includes(action.kind)) {
        throw fail(422, "WRONG_PHASE", `${action.kind} is not allowed in phase ${snap.phase}`);
      }
      const next = steps[index + 1];
      const want = next?.request as { kind?: string; payload?: unknown } | undefined;
      if (!next || stableJson({ kind: want?.kind, payload: want?.payload }) !== signature) {
        throw fail(422, "FIXTURE_OFF_PATH",
          "This preview replays one recorded backend run; only the recorded choice can be applied here.");
      }
      used.set(action.action_id, signature);
      index += 1;
      return readDynastySnapshot(next.response);
    },
  };
}
