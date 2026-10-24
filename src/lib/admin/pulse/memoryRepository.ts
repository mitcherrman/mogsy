// ---------------------------------------------------------------------------
// PULSE-2B — prototype repository (in memory). Enforces the same rules as the
// server RPCs: validation on save, publish checks on publish/schedule, the
// lifecycle tables, partner approval, the host allowlist, revision
// conflicts. Nothing persists past a reload, and the UI says so.
//
// There is no MFA in the prototype: `assuranceLog` records the level each
// action WOULD require on the server (policy.ts), for tests and review.
// ---------------------------------------------------------------------------

import type { OwnerActionLevel } from "@/lib/admin-auth/ownerAction";

import {
  PARTNER_TRANSITIONS,
  PULSE_ADMIN_CONTRACT_VERSION,
  type PulseContentRecord,
  type PulsePartnerRecord,
  type PulseWorkspaceSnapshot,
} from "./contract";
import { applyTransition, canTransition } from "./lifecycle";
import { isHostname, toPartnerInput, validatePartnerForApproval, validatePartnerSave } from "./partnerRules";
import { hostAllowlistLevel, killLevel, partnerSaveLevel, partnerTransitionLevel } from "./policy";
import { PulseRepositoryError, type PulseAdminRepository } from "./repository";
import { validateItemForPublish, validateItemForSave, validateSchedule } from "./validation";

type Seed = Omit<PulseWorkspaceSnapshot, "serverNow" | "contractVersion">;

export interface MemoryRepositoryOptions {
  now?: () => Date;
  /** Simulated latency (ms), for reviewing loading states. */
  latencyMs?: number;
}

export type MemoryPulseRepository = PulseAdminRepository & { readonly assuranceLog: { action: string; level: OwnerActionLevel }[] };

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** What the prototype records as the author of owner entries (the server uses "owner", see the migration). */
export const PROTOTYPE_ACTOR = "owner";

export function createMemoryPulseRepository(seed: Seed, opts: MemoryRepositoryOptions = {}): MemoryPulseRepository {
  const now = opts.now ?? (() => new Date());
  const state: Seed = clone(seed);
  const assuranceLog: { action: string; level: OwnerActionLevel }[] = [];
  let seq = 0;
  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
  const wait = () => (opts.latencyMs ? new Promise((r) => setTimeout(r, opts.latencyMs)) : Promise.resolve());
  const iso = () => now().toISOString();

  function stale(current: number, expected: number | null) {
    if (expected !== current) throw new PulseRepositoryError("conflict", "This changed since you opened it. Reload to see the latest.");
  }
  function findItem(id: string): PulseContentRecord {
    const r = state.items.find((i) => i.id === id);
    if (!r) throw new PulseRepositoryError("not_found", "That content no longer exists.");
    return r;
  }
  function findPartner(id: string): PulsePartnerRecord {
    const p = state.partners.find((x) => x.record.id === id);
    if (!p) throw new PulseRepositoryError("not_found", "That partner record no longer exists.");
    return p;
  }

  return {
    mode: "prototype",
    assuranceLog,

    async load() {
      await wait();
      return { contractVersion: PULSE_ADMIN_CONTRACT_VERSION, ...clone(state), serverNow: iso() };
    },

    async saveItem(input, expectedRevision) {
      await wait();
      const issues = validateItemForSave(input);
      if (issues.length) throw new PulseRepositoryError("invalid", "Fix the highlighted fields.", issues);
      const ts = iso();
      if (input.id === null) {
        if (expectedRevision !== null) stale(-1, expectedRevision);
        const id = newId("pc");
        const record: PulseContentRecord = {
          ...input, id, payload: { ...input.payload, id, provenance: "live" },
          state: "draft", revision: 1, createdAt: ts, updatedAt: ts, publishedAt: null,
        };
        state.items.push(record);
        return clone(record);
      }
      const current = findItem(input.id);
      stale(current.revision, expectedRevision);
      // Editing live content re-checks it: a save must not break what is playing.
      if (current.state === "published") {
        const pub = validateItemForPublish(input, now());
        if (pub.length) throw new PulseRepositoryError("invalid", "This is published; the change would break it. Unpublish first or fix:", pub);
      }
      Object.assign(current, { ...input, payload: { ...input.payload, id: current.id, provenance: "live" }, revision: current.revision + 1, updatedAt: ts });
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
        const issues = validateItemForPublish({ ...current, publishAt: at }, now());
        if (issues.length) throw new PulseRepositoryError("invalid", "Not ready to publish:", issues);
      }
      assuranceLog.push({ action: `item.${transition.action}`, level: "trusted" });
      Object.assign(current, applyTransition(current, transition, iso()), { revision: current.revision + 1, updatedAt: iso() });
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

    async savePartner(input, existing) {
      await wait();
      const issues = validatePartnerSave(input);
      if (issues.length) throw new PulseRepositoryError("invalid", "Fix the highlighted fields.", issues);
      const ts = iso();
      if (existing === null) {
        if (state.partners.some((p) => p.record.id === input.record.id)) {
          throw new PulseRepositoryError("invalid", "That id is taken.", [{ field: "id", message: "Already used by another partner record." }]);
        }
        const provenance = { source: "owner-entry" as const, recordedBy: PROTOTYPE_ACTOR, recordedAt: ts };
        const base = { revision: 1, createdAt: ts, updatedAt: ts, note: input.note, decisionNote: "" };
        const p: PulsePartnerRecord = input.type === "sponsor"
          ? { ...base, type: "sponsor", compensation: null, record: { ...input.record, status: "draft", approval: null, provenance } }
          : { ...base, type: "creator", compensation: input.compensation, record: { ...input.record, status: "draft", approval: null, provenance } };
        state.partners.push(p);
        assuranceLog.push({ action: "partner.create", level: "trusted" });
        return clone(p);
      }
      const current = findPartner(existing.record.id);
      stale(current.revision, existing.revision);
      if (current.type !== input.type) throw new PulseRepositoryError("invalid", "A partner record's type can't change.");
      if (input.record.id !== current.record.id) throw new PulseRepositoryError("invalid", "A partner record's id can't change.");
      assuranceLog.push({ action: "partner.save", level: partnerSaveLevel(current, input) });
      // Any edit to an approved or paused record sends it back for review: it leaves the Home Hub until re-approved.
      const exposed = current.record.status === "approved" || current.record.status === "paused";
      const status = exposed ? "pending-review" : current.record.status;
      const approval = exposed ? null : current.record.approval;
      Object.assign(current, {
        record: { ...current.record, ...input.record, status, approval },
        compensation: input.compensation,
        note: input.note,
        revision: current.revision + 1,
        updatedAt: ts,
      });
      return clone(current);
    },

    async transitionPartner(partner, action, note) {
      await wait();
      const current = findPartner(partner.record.id);
      stale(current.revision, partner.revision);
      const t = PARTNER_TRANSITIONS[action];
      if (!t.from.includes(current.record.status)) {
        throw new PulseRepositoryError("invalid", `Can't ${action} a record that is ${current.record.status}.`);
      }
      if ((action === "reject" || action === "pause" || action === "end") && !note.trim()) {
        throw new PulseRepositoryError("invalid", "Record why.", [{ field: "note", message: "Required" }]);
      }
      if (action === "submit" || action === "approve" || action === "resume") {
        const issues = validatePartnerForApproval(toPartnerInput(current), state.sponsorHostAllowlist, now());
        if (issues.length) throw new PulseRepositoryError("invalid", "Not ready:", issues);
      }
      assuranceLog.push({ action: `partner.${action}`, level: partnerTransitionLevel(current, action) });
      current.record = {
        ...current.record,
        status: t.to,
        approval: t.to === "approved" ? { approvedBy: PROTOTYPE_ACTOR, approvedAt: iso() } : t.to === "paused" ? current.record.approval : null,
      } as typeof current.record;
      if (note.trim()) current.decisionNote = note.trim();
      current.revision += 1;
      current.updatedAt = iso();
      return clone(current);
    },

    async setSponsorHost(host, op) {
      await wait();
      const h = host.trim().toLowerCase();
      if (!isHostname(h)) throw new PulseRepositoryError("invalid", "Not a hostname.", [{ field: "host", message: "e.g. example.com" }]);
      assuranceLog.push({ action: `host.${op}`, level: hostAllowlistLevel(op) });
      state.sponsorHostAllowlist = op === "add"
        ? [...new Set([...state.sponsorHostAllowlist, h])].sort()
        : state.sponsorHostAllowlist.filter((x) => x !== h);
      return [...state.sponsorHostAllowlist];
    },

    async setEditorialKill(input, current) {
      await wait();
      if (input.active && !input.reason.trim()) {
        throw new PulseRepositoryError("invalid", "Record why content is being disabled.", [{ field: "reason", message: "Required" }]);
      }
      assuranceLog.push({ action: input.active ? "kill.on" : "kill.restore", level: killLevel(current, input) });
      state.schedule.kill = { ...input, reason: input.reason.trim(), changedAt: iso() };
      state.schedule.revision += 1;
      return clone(state.schedule);
    },
  };
}
