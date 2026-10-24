import { describe, expect, it, vi } from "vitest";

import type { OwnerActionOptions } from "@/lib/admin-auth/ownerAction";

import type { PulsePartnerRecord } from "./contract";
import { createMemoryPulseRepository } from "./memoryRepository";
import { toPartnerInput } from "./partnerRules";
import { PROTOTYPE_SPONSOR_ID, prototypeSeed } from "./prototypeSeed";
import { PulseRepositoryError } from "./repository";
import { PULSE_ADMIN_RPCS, createSupabasePulseRepository, toRepositoryError, type PulseRpc } from "./supabaseRepository";

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

const sponsorOf = (s: { partners: PulsePartnerRecord[] }) => s.partners.find((p) => p.record.id === PROTOTYPE_SPONSOR_ID)!;

describe("memory repository (prototype) enforces the server rules", () => {
  it("stale revisions are conflicts", async () => {
    const r = repo();
    const item = (await r.load()).items[0];
    await r.saveItem({ ...item, label: "A" }, item.revision);
    expect(await code(r.saveItem({ ...item, label: "B" }, item.revision))).toBe("conflict");
  });

  it("sponsor: submit needs an allowlisted host; approval is logged FRESH; editing it returns it to review at FRESH", async () => {
    const r = repo();
    let p = sponsorOf(await r.load());
    expect(await code(r.transitionPartner(p, "submit", ""))).toBe("invalid");
    await r.setSponsorHost("example.com", "add");
    p = await r.transitionPartner(p, "submit", "");
    p = await r.transitionPartner(p, "approve", "");
    expect(p.record.status).toBe("approved");
    expect(p.record.approval?.approvedBy).toBe("owner");
    const edited = await r.savePartner(toPartnerInput(p), p);
    expect(edited.record.status).toBe("pending-review");
    expect(edited.record.approval).toBeNull();
    expect(r.assuranceLog).toEqual([
      { action: "host.add", level: "fresh" },
      { action: "partner.submit", level: "trusted" },
      { action: "partner.approve", level: "fresh" },
      { action: "partner.save", level: "fresh" },
    ]);
  });

  it("reject / pause / end need a note; illegal transitions are refused", async () => {
    const r = repo();
    const p = sponsorOf(await r.load());
    expect(await code(r.transitionPartner(p, "approve", ""))).toBe("invalid");
    expect(await code(r.transitionPartner(p, "end", "x"))).toBe("invalid");
  });

  it("live editorial can't be archived, and live edits must stay publishable", async () => {
    const r = repo();
    const live = (await r.load()).items.find((i) => i.id === "pc-news-hover")!;
    expect(await code(r.transitionItem(live.id, { action: "archive" }, live.revision))).toBe("invalid");
    expect(await code(r.saveItem({ ...live, payload: { ...live.payload, headline: "" } as typeof live.payload }, live.revision))).toBe("invalid");
  });

  it("emergency disable trusted; restore logged FRESH", async () => {
    const r = repo();
    const off = { active: false, scope: "partners" as const, reason: "", changedAt: null };
    expect(await code(r.setEditorialKill({ active: true, scope: "managed", reason: "" }, off))).toBe("invalid");
    const s = await r.setEditorialKill({ active: true, scope: "managed", reason: "Incident" }, off);
    await r.setEditorialKill({ active: false, scope: "managed", reason: "" }, s.kill);
    expect(r.assuranceLog).toEqual([{ action: "kill.on", level: "trusted" }, { action: "kill.restore", level: "fresh" }]);
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
    return { r: createSupabasePulseRepository({ rpc, runAction: runAction as never }), rpc, levels, runAction };
  }

  it("every write goes through runOwnerAction at the level policy.ts assigns", async () => {
    const { r, levels, rpc } = setup();
    const s = prototypeSeed(NOW);
    const draft = sponsorOf(s);
    const approved = { ...draft, record: { ...draft.record, status: "approved", approval: { approvedBy: "owner", approvedAt: NOW.toISOString() } } } as PulsePartnerRecord;
    const off = { active: false, scope: "partners" as const, reason: "", changedAt: null };
    const on = { active: true, scope: "managed" as const, reason: "x", changedAt: null };

    await r.saveItem(s.items[0], 1);
    await r.transitionItem("x", { action: "publish" }, 1);
    await r.saveCategory({ category: "news", enabled: false, maxPerCycle: null, expiresAt: null }, 1);
    await r.saveSchedule(s.schedule, 1);
    await r.savePartner(toPartnerInput(draft), null);
    await r.savePartner(toPartnerInput(draft), draft);
    await r.savePartner(toPartnerInput(approved), approved);
    await r.transitionPartner(draft, "submit", "");
    await r.transitionPartner(draft, "approve", "");
    await r.transitionPartner(approved, "pause", "why");
    await r.setSponsorHost("example.com", "add");
    await r.setSponsorHost("example.com", "remove");
    await r.setEditorialKill({ active: true, scope: "managed", reason: "x" }, off);
    await r.setEditorialKill({ active: true, scope: "partners", reason: "x" }, on);
    await r.setEditorialKill({ active: false, scope: "managed", reason: "" }, on);

    expect(levels.map((l) => l.level)).toEqual([
      "trusted", "trusted", "trusted", "trusted", // editorial, category, cadence
      "trusted", "trusted", "fresh", // partner create, draft edit, approved-sponsor edit
      "trusted", "fresh", "trusted", // submit, approve, pause
      "fresh", "trusted", // host add, remove
      "trusted", "fresh", "fresh", // disable, narrow, restore
    ]);
    expect(levels.every((l) => l.idempotent === false)).toBe(true);
    expect(new Set(rpc.mock.calls.map((c) => c[0]))).toEqual(new Set(Object.values(PULSE_ADMIN_RPCS).filter((n) => n !== PULSE_ADMIN_RPCS.snapshot)));
  });

  it("a cancelled or deferred verification sends nothing and says so", async () => {
    const rpc = vi.fn<PulseRpc>();
    const r = createSupabasePulseRepository({ rpc, runAction: (async () => ({ status: "cancelled" })) as never });
    const on = { active: true, scope: "managed" as const, reason: "x", changedAt: null };
    await expect(r.setEditorialKill({ active: false, scope: "managed", reason: "" }, on)).rejects.toMatchObject({ code: "step_up" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("server refusals map to typed errors", () => {
    expect(toRepositoryError({ message: "owner_required", code: "42501" }).code).toBe("forbidden");
    expect(toRepositoryError({ message: "permission denied for function pulse_admin_save_item" }).code).toBe("forbidden");
    expect(toRepositoryError({ message: "step_up_required", code: "42501", hint: "fresh_aal2" }).code).toBe("step_up");
    expect(toRepositoryError({ message: "pulse_conflict" }).code).toBe("conflict");
    const inv = toRepositoryError({ message: "pulse_invalid", details: JSON.stringify([{ field: "destinationUrl", message: "no" }]) });
    expect(inv.code).toBe("invalid");
    expect(inv.issues).toEqual([{ field: "destinationUrl", message: "no" }]);
    expect(toRepositoryError({ message: "x", code: "PGRST202" }).code).toBe("unavailable");
  });

  it("load needs no step-up, surfaces a forbidden read, and refuses a v1 snapshot", async () => {
    const forbidden = setup({ data: null, error: { message: "owner_required", code: "42501" } });
    await expect(forbidden.r.load()).rejects.toMatchObject({ code: "forbidden" });
    expect(forbidden.runAction).not.toHaveBeenCalled();
    const v1 = setup({ data: { contractVersion: "pulse-admin/1", items: [], categories: [], campaigns: [], schedule: {}, serverNow: "x" }, error: null });
    await expect(v1.r.load()).rejects.toMatchObject({ code: "unavailable" });
  });
});
