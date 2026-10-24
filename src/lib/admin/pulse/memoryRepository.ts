// ---------------------------------------------------------------------------
// PULSE-2B — prototype repository (in memory). Enforces the same rules the
// server RPCs do: validation on save, publish checks on publish/schedule, the
// lifecycle table, campaign approval, revision conflicts. Nothing persists
// past a reload, and the UI says so.
// ---------------------------------------------------------------------------

import { PULSE_ADMIN_CONTRACT_VERSION, type PulseCampaign, type PulseContentRecord, type PulseWorkspaceSnapshot } from "./contract";
import { applyTransition, canTransition } from "./lifecycle";
import { PulseRepositoryError, type PulseAdminRepository } from "./repository";
import { validateCampaign, validateItemForPublish, validateItemForSave, validateSchedule } from "./validation";

type Seed = Omit<PulseWorkspaceSnapshot, "serverNow" | "contractVersion">;

export interface MemoryRepositoryOptions {
  now?: () => Date;
  /** Simulated latency (ms), for reviewing loading states. */
  latencyMs?: number;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

export function createMemoryPulseRepository(seed: Seed, opts: MemoryRepositoryOptions = {}): PulseAdminRepository {
  const now = opts.now ?? (() => new Date());
  const state: Seed = clone(seed);
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  const wait = () => (opts.latencyMs ? new Promise((r) => setTimeout(r, opts.latencyMs)) : Promise.resolve());

  function stale(current: number, expected: number | null) {
    if (expected !== current) throw new PulseRepositoryError("conflict", "This changed since you opened it. Reload to see the latest.");
  }
  function findItem(id: string): PulseContentRecord {
    const r = state.items.find((i) => i.id === id);
    if (!r) throw new PulseRepositoryError("not_found", "That content no longer exists.");
    return r;
  }
  function findCampaign(id: string | null): PulseCampaign | null {
    return id ? state.campaigns.find((c) => c.id === id) ?? null : null;
  }

  return {
    mode: "prototype",

    async load() {
      await wait();
      return { contractVersion: PULSE_ADMIN_CONTRACT_VERSION, ...clone(state), serverNow: now().toISOString() };
    },

    async saveItem(input, expectedRevision) {
      await wait();
      const issues = validateItemForSave(input);
      if (issues.length) throw new PulseRepositoryError("invalid", "Fix the highlighted fields.", issues);
      const ts = now().toISOString();
      const payload = { ...input.payload, provenance: "live" as const };
      if (input.id === null) {
        if (expectedRevision !== null) stale(-1, expectedRevision);
        const record: PulseContentRecord = {
          ...input,
          id: newId("pc"),
          payload: { ...payload, id: "" } as PulseContentRecord["payload"],
          state: "draft",
          revision: 1,
          createdAt: ts,
          updatedAt: ts,
          publishedAt: null,
        };
        record.payload = { ...record.payload, id: record.id };
        state.items.push(record);
        return clone(record);
      }
      const current = findItem(input.id);
      stale(current.revision, expectedRevision);
      // Editing live content re-checks it: a save must not break what is playing.
      if (current.state === "published") {
        const pub = validateItemForPublish(input, findCampaign(input.campaignId), now());
        if (pub.length) throw new PulseRepositoryError("invalid", "This is published; the change would break it. Unpublish first or fix:", pub);
      }
      Object.assign(current, { ...input, payload: { ...payload, id: current.id }, revision: current.revision + 1, updatedAt: ts });
      return clone(current);
    },

    async transitionItem(id, transition, expectedRevision) {
      await wait();
      const current = findItem(id);
      stale(current.revision, expectedRevision);
      if (!canTransition(current.state, transition.action)) {
        throw new PulseRepositoryError("invalid", `Can't ${transition.action} content that is ${current.state}.`);
      }
      if (transition.action === "publish" || transition.action === "schedule") {
        const at = transition.action === "schedule" ? transition.publishAt : null;
        if (at !== null && (Number.isNaN(Date.parse(at)) || Date.parse(at) <= now().getTime())) {
          throw new PulseRepositoryError("invalid", "Schedule for a time in the future.");
        }
        const issues = validateItemForPublish({ ...current, publishAt: at }, findCampaign(current.campaignId), now());
        if (issues.length) throw new PulseRepositoryError("invalid", "Not ready to publish:", issues);
      }
      Object.assign(current, applyTransition(current, transition, now().toISOString()), {
        revision: current.revision + 1,
        updatedAt: now().toISOString(),
      });
      return clone(current);
    },

    async saveCategory(setting, expectedRevision) {
      await wait();
      const current = state.categories.find((c) => c.category === setting.category);
      if (!current) throw new PulseRepositoryError("not_found", "Unknown category.");
      stale(current.revision, expectedRevision);
      if (setting.maxPerCycle !== null && (!Number.isInteger(setting.maxPerCycle) || setting.maxPerCycle < 0 || setting.maxPerCycle > 24)) {
        throw new PulseRepositoryError("invalid", "Frequency is 0–24 slots per cycle.", [{ field: "maxPerCycle", message: "0–24" }]);
      }
      Object.assign(current, setting, { revision: current.revision + 1 });
      return clone(current);
    },

    async saveSchedule(schedule, expectedRevision) {
      await wait();
      stale(state.schedule.revision, expectedRevision);
      const issues = validateSchedule(schedule);
      if (issues.length) throw new PulseRepositoryError("invalid", "Fix the cadence:", issues);
      Object.assign(state.schedule, { ...schedule, slots: [...schedule.slots], revision: state.schedule.revision + 1 });
      return clone(state.schedule);
    },

    async saveCampaign(input, expectedRevision) {
      await wait();
      const issues = validateCampaign(input);
      if (issues.length) throw new PulseRepositoryError("invalid", "Fix the campaign:", issues);
      if (input.id === null) {
        const c: PulseCampaign = { ...input, id: newId("cmp"), approval: "pending", decidedAt: null, decisionNote: "", revision: 1 };
        state.campaigns.push(c);
        return clone(c);
      }
      const current = state.campaigns.find((c) => c.id === input.id);
      if (!current) throw new PulseRepositoryError("not_found", "That campaign no longer exists.");
      stale(current.revision, expectedRevision);
      if (current.type !== input.type) throw new PulseRepositoryError("invalid", "A campaign's type can't change.");
      // A material edit to an approved campaign sends it back for approval.
      const material = current.partnerName !== input.partnerName || current.disclosure !== input.disclosure
        || current.disclosureText !== input.disclosureText;
      Object.assign(current, input, {
        approval: material && current.approval === "approved" ? "pending" : current.approval,
        revision: current.revision + 1,
      });
      return clone(current);
    },

    async decideCampaign(id, decision, note, expectedRevision) {
      await wait();
      const current = state.campaigns.find((c) => c.id === id);
      if (!current) throw new PulseRepositoryError("not_found", "That campaign no longer exists.");
      stale(current.revision, expectedRevision);
      const from = current.approval;
      const ok = (decision === "approve" && (from === "pending" || from === "rejected"))
        || (decision === "reject" && from === "pending")
        || (decision === "end" && from === "approved");
      if (!ok) throw new PulseRepositoryError("invalid", `Can't ${decision} a campaign that is ${from}.`);
      if (decision !== "approve" && !note.trim()) throw new PulseRepositoryError("invalid", "Record why.", [{ field: "note", message: "Required" }]);
      current.approval = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "ended";
      current.decidedAt = now().toISOString();
      current.decisionNote = note.trim();
      current.revision += 1;
      return clone(current);
    },

    async setEditorialKill(input) {
      await wait();
      if (input.active && !input.reason.trim()) {
        throw new PulseRepositoryError("invalid", "Record why content is being disabled.", [{ field: "reason", message: "Required" }]);
      }
      state.schedule.kill = { ...input, reason: input.reason.trim(), changedAt: now().toISOString() };
      state.schedule.revision += 1;
      return clone(state.schedule);
    },
  };
}
