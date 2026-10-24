import { describe, expect, it, vi } from "vitest";

import type { OwnerActionOptions } from "@/lib/admin-auth/ownerAction";

import { createMemoryPulseRepository } from "./memoryRepository";
import { prototypeSeed } from "./prototypeSeed";
import { PulseRepositoryError } from "./repository";
import { PULSE_ACTION_LEVEL, PULSE_ADMIN_RPCS, createSupabasePulseRepository, toRepositoryError, type PulseRpc } from "./supabaseRepository";

const NOW = new Date("2026-10-24T12:00:00Z");
const repo = () => createMemoryPulseRepository(prototypeSeed(NOW), { now: () => NOW });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof PulseRepositoryError ? e.code : "other";
  }
}

describe("memory repository (prototype) enforces the server rules", () => {
  it("stale revisions are conflicts", async () => {
    const r = repo();
    const s = await r.load();
    const item = s.items[0];
    await r.saveItem({ ...item, label: "A" }, item.revision);
    expect(await code(r.saveItem({ ...item, label: "B" }, item.revision))).toBe("conflict");
  });

  it("publishing a sponsor needs an approved campaign; approval needs a pending campaign", async () => {
    const r = repo();
    let s = await r.load();
    const sp = s.items.find((i) => i.id === "pc-sponsor-placeholder")!;
    expect(await code(r.transitionItem(sp.id, { action: "publish" }, sp.revision))).toBe("invalid");
    const c = s.campaigns[0];
    expect(await code(r.decideCampaign(c.id, "end", "x", c.revision))).toBe("invalid");
    await r.decideCampaign(c.id, "approve", "", c.revision);
    const published = await r.transitionItem(sp.id, { action: "publish" }, sp.revision);
    expect(published.state).toBe("published");

    // A material disclosure edit sends the campaign back for approval.
    s = await r.load();
    const approved = s.campaigns[0];
    const edited = await r.saveCampaign({ ...approved, disclosureText: "Paid by someone else" }, approved.revision);
    expect(edited.approval).toBe("pending");
  });

  it("live content can't be archived, and live edits must stay publishable", async () => {
    const r = repo();
    const s = await r.load();
    const live = s.items.find((i) => i.id === "pc-news-hover")!;
    expect(await code(r.transitionItem(live.id, { action: "archive" }, live.revision))).toBe("invalid");
    const broken = { ...live, payload: { ...live.payload, headline: "" } as typeof live.payload };
    expect(await code(r.saveItem(broken, live.revision))).toBe("invalid");
  });

  it("schedule must be in the future", async () => {
    const r = repo();
    const s = await r.load();
    const d = s.items.find((i) => i.id === "pc-news-hover")!;
    expect(await code(r.transitionItem(d.id, { action: "schedule", publishAt: "2026-10-01T00:00:00Z" }, d.revision))).toBe("invalid");
  });

  it("emergency disable needs a reason, needs no revision, and always applies", async () => {
    const r = repo();
    expect(await code(r.setEditorialKill({ active: true, scope: "managed", reason: "" }))).toBe("invalid");
    const s = await r.setEditorialKill({ active: true, scope: "managed", reason: "Incident" });
    expect(s.kill).toMatchObject({ active: true, scope: "managed", reason: "Incident" });
  });
});

describe("supabase repository: owner authorization", () => {
  function setup(result: Awaited<ReturnType<PulseRpc>> = { data: {}, error: null }) {
    const rpc = vi.fn<PulseRpc>(async () => result);
    const levels: OwnerActionOptions[] = [];
    const runAction = vi.fn(async (opts: OwnerActionOptions, fn: () => Promise<unknown>) => {
      levels.push(opts);
      return { status: "done" as const, result: await fn() };
    });
    const r = createSupabasePulseRepository({ rpc, runAction: runAction as never });
    return { r, rpc, levels, runAction };
  }

  it("every write goes through runOwnerAction at its declared level", async () => {
    const { r, levels, rpc } = setup();
    const s = prototypeSeed(NOW);
    await r.saveItem(s.items[0], 1);
    await r.transitionItem("x", { action: "publish" }, 1);
    await r.saveCategory({ category: "news", enabled: false, maxPerCycle: null, expiresAt: null }, 1);
    await r.saveSchedule(s.schedule, 1);
    await r.saveCampaign({ ...s.campaigns[0], id: null }, null);
    await r.decideCampaign("c", "approve", "", 1);
    await r.setEditorialKill({ active: true, scope: "partners", reason: "r" });
    expect(levels.map((l) => l.level)).toEqual(["trusted", "trusted", "trusted", "trusted", "trusted", "fresh", "trusted"]);
    expect(levels.every((l) => l.idempotent === false)).toBe(true);
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      PULSE_ADMIN_RPCS.saveItem, PULSE_ADMIN_RPCS.transitionItem, PULSE_ADMIN_RPCS.saveCategory, PULSE_ADMIN_RPCS.saveSchedule,
      PULSE_ADMIN_RPCS.saveCampaign, PULSE_ADMIN_RPCS.decideCampaign, PULSE_ADMIN_RPCS.setKill,
    ]);
    expect(PULSE_ACTION_LEVEL.decideCampaign).toBe("fresh");
  });

  it("a cancelled or deferred verification changes nothing and says so", async () => {
    const rpc = vi.fn<PulseRpc>();
    const r = createSupabasePulseRepository({ rpc, runAction: (async () => ({ status: "cancelled" })) as never });
    await expect(r.decideCampaign("c", "approve", "", 1)).rejects.toMatchObject({ code: "step_up" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("server refusals map to typed errors", () => {
    expect(toRepositoryError({ message: "not_authorized", code: "42501" }).code).toBe("forbidden");
    expect(toRepositoryError({ message: "permission denied for function pulse_admin_save_item" }).code).toBe("forbidden");
    expect(toRepositoryError({ message: "step_up_required", hint: "fresh_aal2" }).code).toBe("step_up");
    expect(toRepositoryError({ message: "pulse_conflict" }).code).toBe("conflict");
    const inv = toRepositoryError({ message: "pulse_invalid", details: JSON.stringify([{ field: "href", message: "no" }]) });
    expect(inv.code).toBe("invalid");
    expect(inv.issues).toEqual([{ field: "href", message: "no" }]);
    expect(toRepositoryError({ message: "x", code: "PGRST202" }).code).toBe("unavailable");
  });

  it("load does not need step-up but still surfaces a forbidden read", async () => {
    const { r, runAction } = setup({ data: null, error: { message: "not_authorized", code: "42501" } });
    await expect(r.load()).rejects.toMatchObject({ code: "forbidden" });
    expect(runAction).not.toHaveBeenCalled();
  });

  it("refuses a snapshot from another contract version", async () => {
    const { r } = setup({ data: { contractVersion: "pulse-admin/0" }, error: null });
    await expect(r.load()).rejects.toMatchObject({ code: "unavailable" });
  });
});
