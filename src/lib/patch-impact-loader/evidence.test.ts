import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalRow, report } from "@/lib/patch-impact/fixtures/builders";
import { PatchImpactLoadError, loadImpactEvidence, toLoadFailure } from "./evidence";
import {
  LIST_PATH,
  STATS_PATH,
  callsTo,
  createBackend,
  deferred,
  installFetch,
  reportPath,
} from "./test-support";
import { vi } from "vitest";

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });

afterEach(() => vi.unstubAllGlobals());

describe("loadImpactEvidence", () => {
  it("orders later reports numerically whatever order the API lists them in", async () => {
    const versions = ["26.2", "26.10", "26.9", "26.19", "26.11"];
    const backend = createBackend(
      versions.map((v) => report(v, [])),
      [canonicalRow("Smolder")],
      versions,
    );
    installFetch(backend);

    const evidence = await loadImpactEvidence(newClient(), "26.9");
    expect(evidence.laterReports.map((r) => r.patch_version)).toEqual(["26.10", "26.11", "26.19"]);
    expect(evidence.laterVersionsExpected).toEqual(versions); // as listed; the analyzer filters
    expect(callsTo(backend, reportPath("26.2"))).toBe(0);
  });

  it("issues independent requests in parallel: list/canonical/own first, then every later report together", async () => {
    const backend = createBackend(
      ["26.9", "26.10", "26.11", "26.12"].map((v) => report(v, [])),
      [canonicalRow("Smolder")],
    );
    installFetch(backend);
    const first = ["list", "champion-stats", "26.9"];
    const gates = Object.fromEntries(first.map((id) => [id, deferred()]));
    for (const id of first) backend.gates.set(id, gates[id]);
    const later = ["26.10", "26.11", "26.12"];
    const laterGates = Object.fromEntries(later.map((id) => [id, deferred()]));
    for (const id of later) backend.gates.set(id, laterGates[id]);

    const pending = loadImpactEvidence(newClient(), "26.9");

    // All three first-phase requests are in flight before any has answered.
    await vi.waitFor(() => {
      expect(callsTo(backend, LIST_PATH)).toBe(1);
      expect(callsTo(backend, STATS_PATH)).toBe(1);
      expect(callsTo(backend, reportPath("26.9"))).toBe(1);
    });
    expect(later.some((v) => callsTo(backend, reportPath(v)) > 0)).toBe(false); // need the list first

    for (const id of first) gates[id].release();
    // ...and all later reports are in flight together before any has answered.
    await vi.waitFor(() => {
      for (const v of later) expect(callsTo(backend, reportPath(v))).toBe(1);
    });
    for (const id of later) laterGates[id].release();
    await expect(pending).resolves.toMatchObject({ laterVersionsExpected: expect.any(Array) });
  });

  it("rejects with a typed error; never resolves with partial evidence", async () => {
    const backend = createBackend([report("26.9", []), report("26.10", [])], [canonicalRow("Smolder")]);
    backend.failing.add("26.10");
    installFetch(backend);

    const error = await loadImpactEvidence(newClient(), "26.9").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PatchImpactLoadError);
    expect(toLoadFailure(error)).toMatchObject({ code: "request_failed", resource: "patch-report", version: "26.10" });
  });

  it("rejects an unparseable analysed version without any request", async () => {
    const backend = createBackend([], []);
    installFetch(backend);
    await expect(loadImpactEvidence(newClient(), "latest")).rejects.toMatchObject({ code: "patch_chain_malformed" });
    expect(backend.calls.size).toBe(0);
  });

  it("toLoadFailure maps foreign errors to request_failed", () => {
    expect(toLoadFailure(new Error("offline"))).toEqual({
      code: "request_failed",
      resource: null,
      version: null,
      message: "offline",
    });
    expect(toLoadFailure("weird").code).toBe("request_failed");
  });
});
