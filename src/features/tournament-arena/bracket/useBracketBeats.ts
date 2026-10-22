/**
 * Turns REVISIONS of an event into motion beats: a decided node's winner
 * glides to the next slot; new pips stamp; a round closing fires a stinger;
 * the final going ready opens the finals intro; the event completing crowns
 * the champion.
 *
 * IDEMPOTENT ON RESUME (the `MatchStage` rule): the first event seen is the
 * baseline and plays nothing. Only a change between two revisions seen in
 * this session is a beat, so opening a finished bracket shows the final
 * state, not a replay.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useSfx } from "@/lib/audio/useSfx";

import { ARENA_SFX, arenaEventId } from "../audio";
import { roundName, type ArenaEvent, type ArenaNode } from "../contracts";
import { nextSlotOf } from "./layout";
import type { GlideBeat } from "./TournamentArenaConnectors";
import { TA } from "../motion";

export interface BracketBeats {
  glides: GlideBeat[];
  /** Slot that just received an entrant, per node. */
  arrived: Record<string, 0 | 1>;
  /** Wins at the previous revision, per node, while a stamp is in flight. */
  prevWins: Record<string, [number, number]>;
  /** A stinger to fire (consumed by the host). */
  stinger: { id: string; kicker?: string; title: string; sub?: string; tone?: "gold" | "violet" | "ice" } | null;
  /** The final just became ready. */
  finalsReady: ArenaNode | null;
  /** The event just completed. */
  crowned: boolean;
  /** Consume a one-shot beat. */
  consume: (beat: "stinger" | "finalsReady" | "crowned") => void;
}

const byId = (ev: ArenaEvent | null) => new Map((ev?.bracket?.nodes ?? []).map((n) => [n.node_id, n]));
const settled = (n: ArenaNode | undefined) => Boolean(n && (n.status === "complete" || n.status === "walkover" || n.status === "bye"));

export function useBracketBeats(ev: ArenaEvent | null, motion: boolean): BracketBeats {
  const prev = useRef<ArenaEvent | null>(null);
  const sfx = useSfx();
  const [state, setState] = useState<Omit<BracketBeats, "consume">>({ glides: [], arrived: {}, prevWins: {}, stinger: null, finalsReady: null, crowned: false });
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  useEffect(() => {
    const before = prev.current;
    prev.current = ev;
    if (!ev || !before || before.event_id !== ev.event_id || before.revision === ev.revision) return;
    if (!ev.bracket) return;
    const was = byId(before);
    const now = byId(ev);
    const glides: GlideBeat[] = [];
    const arrived: Record<string, 0 | 1> = {};
    const prevWins: Record<string, [number, number]> = {};
    let decidedRound: number | null = null;
    for (const n of ev.bracket.nodes) {
      const b = was.get(n.node_id);
      if (!b) continue;
      if (b.slots[0].wins !== n.slots[0].wins || b.slots[1].wins !== n.slots[1].wins) {
        prevWins[n.node_id] = [b.slots[0].wins, b.slots[1].wins];
      }
      if (!b.winner_profile_id && n.winner_profile_id && n.status !== "bye") {
        decidedRound = n.round;
        const next = nextSlotOf(n.node_id, ev.bracket.nodes);
        if (next) {
          glides.push({ from: n.node_id, to: next.node.node_id, key: `${n.node_id}>${next.node.node_id}:${ev.revision}` });
          arrived[next.node.node_id] = next.slot;
        }
      }
    }
    const total = ev.bracket.rounds;
    const finalNode = ev.bracket.nodes.find((n) => n.round === total) ?? null;
    const finalsReady = finalNode && finalNode.status === "ready" && was.get(finalNode.node_id)?.status !== "ready" ? finalNode : null;
    const crowned = ev.status === "complete" && before.status !== "complete";
    let stinger: BracketBeats["stinger"] = null;
    if (decidedRound !== null && !crowned) {
      const roundDone = ev.bracket.nodes.filter((n) => n.round === decidedRound).every((n) => settled(now.get(n.node_id)));
      const wasDone = ev.bracket.nodes.filter((n) => n.round === decidedRound).every((n) => settled(was.get(n.node_id)));
      if (roundDone && !wasDone) {
        const next = decidedRound < total ? roundName(decidedRound + 1, total) : null;
        stinger = { id: `round:${decidedRound}:${ev.revision}`, kicker: `${roundName(decidedRound, total)} complete`, title: next ? `${next} are set` : "Bracket complete", tone: decidedRound + 1 === total ? "violet" : "gold" };
      }
    }
    if (glides.length) sfx.play(ARENA_SFX.advance, { eventId: arenaEventId(ev.event_id, "advance", ev.revision) });
    if (stinger) sfx.play(ARENA_SFX.roundComplete, { eventId: arenaEventId(ev.event_id, "round", stinger.id) });
    setState((s) => ({
      glides: [...s.glides, ...glides],
      arrived: { ...s.arrived, ...arrived },
      prevWins: { ...s.prevWins, ...prevWins },
      stinger: stinger ?? s.stinger,
      finalsReady: finalsReady ?? s.finalsReady,
      crowned: s.crowned || crowned,
    }));
    // Glides and stamps clear themselves once their motion has run.
    const ttl = motion ? TA.glide * 1000 + 200 : 60;
    timers.current.push(window.setTimeout(() => {
      setState((s) => ({
        ...s,
        glides: s.glides.filter((g) => !glides.includes(g)),
        arrived: Object.fromEntries(Object.entries(s.arrived).filter(([k]) => !(k in arrived))) as Record<string, 0 | 1>,
        prevWins: Object.fromEntries(Object.entries(s.prevWins).filter(([k]) => !(k in prevWins))) as Record<string, [number, number]>,
      }));
    }, ttl));
  }, [ev, motion, sfx]);

  const consume = useCallback((beat: "stinger" | "finalsReady" | "crowned") => {
    setState((s) => (beat === "crowned" ? { ...s, crowned: false } : { ...s, [beat]: null }));
  }, []);

  return { ...state, consume };
}
