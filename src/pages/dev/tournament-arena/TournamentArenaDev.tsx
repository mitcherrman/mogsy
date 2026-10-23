/**
 * TOURNAMENT ARENA — the DEV harness, at /lol/dev/tournament-arena.
 *
 * DEVELOPMENT ONLY. App.tsx registers this route behind `import.meta.env.DEV`
 * (the literal `false` in a production build, so this import and every
 * fixture behind it are dead code there and the path 404s). Under /lol/ so
 * it renders in the LoL theme, as the production `/quiz/arena/*` routes will.
 *
 *   /                 Arena home
 *   /event/:id        an event (scenario id, or one the portal created)
 *   /host             Match Host Portal
 *   /duel             the duel experience (standalone, or `?event=&node=`)
 *
 * `?motion=reduce` forces the app's own Reduce Motion for the visit.
 */
import { useCallback, useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { FlaskConical } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

import "@/features/tournament-arena/tournament-arena.css";
import { DuelExperience, type DuelOutcome } from "@/features/tournament-arena/duel/DuelExperience";
import { EventPage } from "@/features/tournament-arena/event/EventPage";
import { fixtureArenaGateway, fixtureViewerId } from "@/features/tournament-arena/gateway/fixtureArenaGateway";
import { useArenaEvent } from "@/features/tournament-arena/gateway/useArenaEvent";
import { SCENARIOS } from "@/features/tournament-arena/fixtures/scenarios";
import { fixtureEntrants } from "@/features/tournament-arena/fixtures/roster";
import { entrantById } from "@/features/tournament-arena/identity";
import { HostPortal } from "@/features/tournament-arena/portal/HostPortal";
import { nodeLabel } from "@/features/tournament-arena/contracts";

import { ArenaHome } from "./ArenaHome";

export const TOURNAMENT_ARENA_DEV_ROUTE = "/lol/dev/tournament-arena";

function useMotionOverride() {
  const { search } = useLocation();
  useEffect(() => {
    const reduce = new URLSearchParams(search).get("motion") === "reduce";
    if (!reduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [search]);
}

function ScenarioPicker({ current }: { current: string }) {
  const navigate = useNavigate();
  return (
    <label className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] py-0.5 pl-2.5 pr-1 text-[11px] text-muted-foreground" data-testid="ta-scenario-picker">
      <FlaskConical className="h-3.5 w-3.5 text-[#c9a84c]" aria-hidden="true" />
      <select
        value={current}
        onChange={(e) => navigate(`${TOURNAMENT_ARENA_DEV_ROUTE}/event/${e.target.value}`)}
        className="h-7 max-w-[11rem] rounded-full border border-white/10 bg-[hsl(214_45%_11%)] px-2 text-[11px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]"
        aria-label="Scenario"
      >
        {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        {!SCENARIOS.some((s) => s.id === current) && <option value={current}>Created in this tab</option>}
      </select>
    </label>
  );
}

function EventRoute() {
  const { eventId = "" } = useParams();
  const { search } = useLocation();
  const event = useArenaEvent(fixtureArenaGateway, eventId);
  const returned = new URLSearchParams(search).get("from");
  const duelHref = useCallback((id: string, nodeId: string) => `${TOURNAMENT_ARENA_DEV_ROUTE}/duel?event=${id}&node=${nodeId}`, []);
  if (!event) return <Navigate to={TOURNAMENT_ARENA_DEV_ROUTE} replace />;
  return (
    <EventPage
      event={event}
      gateway={fixtureArenaGateway}
      viewerId={fixtureViewerId}
      duelHref={duelHref}
      backHref={TOURNAMENT_ARENA_DEV_ROUTE}
      returnedFromNode={returned}
      tools={<ScenarioPicker current={eventId} />}
    />
  );
}

function HostRoute() {
  const navigate = useNavigate();
  return <HostPortal gateway={fixtureArenaGateway} backHref={TOURNAMENT_ARENA_DEV_ROUTE} onLaunched={(id) => navigate(`${TOURNAMENT_ARENA_DEV_ROUTE}/event/${id}`)} />;
}

function DuelRoute() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const eventId = params.get("event");
  const nodeId = params.get("node");
  const event = useArenaEvent(fixtureArenaGateway, eventId);
  const node = event?.bracket?.nodes.find((n) => n.node_id === nodeId) ?? null;
  const roster = useMemo(() => fixtureEntrants(4), []);
  const you = (node && entrantById(event!.entrants, node.slots.find((s) => s.profile_id === fixtureViewerId)?.profile_id ?? node.slots[0].profile_id)) ?? roster[0];
  const opponent = (node && entrantById(event!.entrants, node.slots.find((s) => s.profile_id !== you.profile_id)?.profile_id ?? null)) ?? roster[1];
  const sideOfYou = node ? (node.slots[0].profile_id === you.profile_id ? 0 : 1) : 0;
  const seed = node ? `${eventId}:${nodeId}:${node.games.length + 1}` : "standalone:1";
  const onFinished = useCallback((o: DuelOutcome) => {
    if (!event || !node) return;
    // Commit the duel's result to the node it came from (the fixture stand-in
    // for the backend's terminal hook). Scores map back to slot order.
    const winner: 0 | 1 | null = o.winner === null ? null : o.winner === 0 ? sideOfYou : ((1 - sideOfYou) as 0 | 1);
    const a = sideOfYou === 0 ? o.scoreA : o.scoreB;
    const b = sideOfYou === 0 ? o.scoreB : o.scoreA;
    fixtureArenaGateway.commitGame(event.event_id, node.node_id, { winner, score_a: a, score_b: b });
  }, [event, node, sideOfYou]);
  const backHref = event && node ? `${TOURNAMENT_ARENA_DEV_ROUTE}/event/${event.event_id}?from=${node.node_id}` : TOURNAMENT_ARENA_DEV_ROUTE;
  const total = event?.bracket?.rounds ?? 1;
  return (
    <DuelExperience
      key={seed}
      you={you}
      opponent={opponent}
      title={event ? event.title : "Grudge Match"}
      kicker={node ? `${nodeLabel(node, total)} · ${event!.kind === "duel" ? "Custom duel" : "Tournament match"}` : "Custom duel"}
      bestOf={node?.best_of ?? 1}
      seed={seed}
      onFinished={event && node ? onFinished : undefined}
      backHref={backHref}
      allowRematch={!(event && node)}
    />
  );
}

export default function TournamentArenaDev() {
  useMotionOverride();
  return (
    <>
      <SEOHead title="Tournament Arena · Mogzy (dev)" description="Development harness for the Tournament Arena and Match Host Portal." noindex />
      <Routes>
        <Route index element={<ArenaHome gateway={fixtureArenaGateway} base={TOURNAMENT_ARENA_DEV_ROUTE} />} />
        <Route path="event/:eventId" element={<EventRoute />} />
        <Route path="host" element={<HostRoute />} />
        <Route path="duel" element={<DuelRoute />} />
        <Route path="*" element={<Navigate to={TOURNAMENT_ARENA_DEV_ROUTE} replace />} />
      </Routes>
    </>
  );
}
