import { useCallback, useMemo, useState } from "react";

import {
  arenaErrorCopy, checkInArenaEvent, lockArenaEvent, newArenaActionId, resolveArenaNode, startArenaEvent,
  adminOverrideArenaNode,
} from "../api/arenaApi";
import { ownerArenaCall } from "../api/ownerArena";
import type { LiveArenaEvent } from "../api/useLiveArenaEvent";
import { entrantById } from "../identity";
import type { ArenaEventControls } from "../event/controls";

/**
 * The event page's controls over the REAL backend.
 *
 * Players: Play / Enter open the match room (the ready check lives there),
 * and the lobby card checks you in. The owner (`manage`): lock, start,
 * walkover and override, each through `ownerArenaCall` and each confirmed
 * first, because they change the bracket for everyone. Every answer is the
 * server's new projection, applied at once; a refusal is copy in `notice`.
 */
export function useHttpEventControls(live: LiveArenaEvent, opts: {
  manage: boolean;
  openRoom: (nodeId: string) => void;
  confirm?: (message: string) => boolean;
  prompt?: (message: string) => string | null;
}): ArenaEventControls {
  const { manage, openRoom } = opts;
  const confirmFn = opts.confirm ?? ((m: string) => window.confirm(m));
  const promptFn = opts.prompt ?? ((m: string) => window.prompt(m));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ev = live.event;

  const run = useCallback(async (id: string, reason: string, call: () => Promise<import("../contracts").ArenaEvent>) => {
    if (busy) return;
    setBusy(id);
    setNotice(null);
    try {
      const r = await ownerArenaCall(reason, call);
      if (r.status === "done") live.apply(r.value);
      else {
        setNotice(r.notice);
        live.refresh();
      }
    } finally {
      setBusy(null);
    }
  }, [busy, live]);

  const checkIn = useCallback(async () => {
    if (!ev || busy) return;
    setBusy("check-in");
    setNotice(null);
    try {
      live.apply(await checkInArenaEvent(ev.event_id));
    } catch (e) {
      setNotice(arenaErrorCopy(e));
    } finally {
      setBusy(null);
    }
  }, [ev, busy, live]);

  return useMemo<ArenaEventControls>(() => {
    const eventId = ev?.event_id ?? "";
    const nodeOf = (nodeId: string) => ev?.bracket?.nodes.find((n) => n.node_id === nodeId) ?? null;
    return {
      source: "http",
      play: (nodeId) => openRoom(nodeId),
      enterMatch: (nodeId) => openRoom(nodeId),
      checkIn: () => { void checkIn(); },
      lock: () => {
        if (!manage || !ev) return;
        const n = ev.entrants.filter((e) => e.status === "joined" || e.status === "checked_in").length;
        if (!confirmFn(`Lock the bracket with ${n} players? Seeds follow join order and nobody else can join.`)) return;
        const actionId = newArenaActionId("lock");
        void run("lock", "Locking an Arena bracket", () => lockArenaEvent(eventId, {}, actionId));
      },
      start: () => {
        if (!manage || !ev) return;
        if (!confirmFn("Start the event? Round-one matches open their ready check now.")) return;
        const actionId = newArenaActionId("start");
        void run("start", "Starting an Arena event", () => startArenaEvent(eventId, actionId));
      },
      walkover: (nodeId, side) => {
        const node = nodeOf(nodeId);
        if (!manage || !ev || !node) return;
        const winner = node.slots[side].profile_id;
        if (!winner) return;
        const name = entrantById(ev.entrants, winner)?.display_name ?? "this player";
        const reason = node.attention === "no_show" ? "no_show" : "walkover";
        if (!confirmFn(`Advance ${name} without a game (${reason === "no_show" ? "no-show" : "walkover"})? This is recorded in the audit trail.`)) return;
        const actionId = newArenaActionId("resolve");
        void run(`resolve:${nodeId}`, "Resolving an Arena match", () => resolveArenaNode(eventId, nodeId, winner, reason, actionId));
      },
      override: manage ? (nodeId) => {
        const node = nodeOf(nodeId);
        if (!ev || !node || !node.winner_profile_id) return;
        const other = node.slots.find((s) => s.profile_id && s.profile_id !== node.winner_profile_id)?.profile_id;
        if (!other) return;
        const name = entrantById(ev.entrants, other)?.display_name ?? "the other player";
        const note = promptFn(`Override this result so ${name} advances? Only possible while their next match has not been played. Add a note for the audit trail (or cancel):`);
        if (note === null) return;
        const actionId = newArenaActionId("override");
        void run(`override:${nodeId}`, "Overriding an Arena result", () => adminOverrideArenaNode(eventId, nodeId, other, note.trim() || null, actionId));
      } : undefined,
      busy,
      notice,
    };
  }, [ev, manage, openRoom, checkIn, run, busy, notice, confirmFn, promptFn]);
}
