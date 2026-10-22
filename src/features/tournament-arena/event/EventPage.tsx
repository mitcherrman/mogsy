/**
 * One Arena event: lobby → locked bracket → running → champion.
 *
 * A fixed-viewport frame (`--app-viewport-h`, `overflow-clip`): the bracket
 * is composed to fit, never scrolled (UX4's rule). Desktop keeps a detail
 * column beside the bracket; phones open a bottom sheet. Ceremonies render as
 * full-screen frames above everything and are all skippable.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { ArrowLeft, Play, RotateCcw, Sparkles, StepForward, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { DESKTOP_QUERY, LANDSCAPE_QUERY, useMediaQuery } from "@/components/pro-play/worlds-experience/ExperienceContext";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { useViewportLock } from "@/lib/pro-play/worldsExperience/viewportLock";
import { cn } from "@/lib/utils";

import { arenaEventId } from "../audio";
import { TournamentArenaBracket } from "../bracket/TournamentArenaBracket";
import { useBracketBeats } from "../bracket/useBracketBeats";
import { ChampionCelebration } from "../ceremony/ChampionCelebration";
import { FinalsIntro } from "../ceremony/FinalsIntro";
import { StingerHost, useStinger } from "../ceremony/RoundStinger";
import { roundName, type ArenaEvent } from "../contracts";
import { gameTypeById } from "../fixtures/catalog";
import type { ArenaGateway } from "../gateway/types";
import { accentStyle, entrantById } from "../identity";
import { ease } from "../motion";
import { Btn, EntrantAvatar, Eyebrow, Pill, SimulatedBadge } from "../ui/parts";
import { BottomSheet } from "./BottomSheet";
import { EventLobby } from "./EventLobby";
import { NodeDetail } from "./NodeDetail";

export interface EventPageProps {
  event: ArenaEvent;
  gateway: ArenaGateway;
  viewerId: string | null;
  /** Where the duel experience lives; receives `?event=&node=`. */
  duelHref: (eventId: string, nodeId: string) => string;
  backHref: string;
  /** The user came back from a duel for this node: play its advancement. */
  returnedFromNode?: string | null;
  tools?: React.ReactNode;
}

export function EventPage(props: EventPageProps) {
  useViewportLock();
  return (
    <StingerHost>
      <EventFrame {...props} />
    </StingerHost>
  );
}

function EventFrame({ event, gateway, viewerId, duelHref, backHref, returnedFromNode, tools }: EventPageProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const landscape = useMediaQuery(LANDSCAPE_QUERY);
  const reduced = useReducedMotionPreference();
  const motion = useMotionAllowed();
  const fire = useStinger();
  const beats = useBracketBeats(event, motion);
  const [selectedId, setSelectedId] = useState<string | null>(returnedFromNode ?? null);
  const [readyIds, setReadyIds] = useState<Set<string>>(() => new Set(viewerId ? [viewerId] : []));
  const [finals, setFinals] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const fixture = gateway.availability().source === "fixture";
  const bracket = event.bracket;
  const total = bracket?.rounds ?? 0;
  const finalNode = useMemo(() => bracket?.nodes.find((n) => n.round === total) ?? null, [bracket, total]);
  const champion = entrantById(event.entrants, event.champion_profile_id);
  const runnerUp = finalNode ? entrantById(event.entrants, finalNode.slots.find((s) => s.profile_id !== event.champion_profile_id)?.profile_id ?? null) : null;
  const selected = selectedId && bracket ? bracket.nodes.find((n) => n.node_id === selectedId) ?? null : null;

  // Beats the bracket raised that this frame hosts.
  useEffect(() => {
    if (beats.stinger) { fire(beats.stinger); beats.consume("stinger"); }
  }, [beats, fire]);
  useEffect(() => {
    if (beats.finalsReady) { setFinals(`${event.event_id}:finals:${event.revision}`); beats.consume("finalsReady"); }
  }, [beats, event.event_id, event.revision]);
  useEffect(() => {
    if (beats.crowned) { setCelebrate(`${event.event_id}:champion:${event.revision}`); beats.consume("crowned"); }
  }, [beats, event.event_id, event.revision]);
  // Lock → the organizer's own "Bracket locked" plate.
  const [lastStatus, setLastStatus] = useState(event.status);
  useEffect(() => {
    if (lastStatus === "open" && event.status === "locked") fire({ id: `locked:${event.revision}`, kicker: "Bracket locked", title: `${event.entrants.filter((e) => e.seed).length} players · ${roundName(1, total)} first`, tone: "ice" });
    if (lastStatus !== event.status) setLastStatus(event.status);
  }, [event.status, event.revision, event.entrants, total, fire, lastStatus]);

  const actions = useMemo(() => ({
    onPlay: (nodeId: string) => { gateway.play(event.event_id, nodeId); },
    onEnterMatch: (nodeId: string) => { window.location.assign(duelHref(event.event_id, nodeId)); },
    onStepResult: (nodeId: string) => { gateway.stepResult(event.event_id, nodeId); },
    onWalkover: (nodeId: string, side: 0 | 1) => { gateway.walkover(event.event_id, nodeId, side); },
    onReplayFinals: () => setFinals(`${event.event_id}:finals:replay:${Date.now()}`),
  }), [gateway, event.event_id, duelHref]);

  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);
  const game = gameTypeById(event.game_type);
  const live = bracket?.nodes.filter((n) => n.status === "live").length ?? 0;
  const statusPill = event.status === "running" ? <Pill tone="live">{live ? `${live} live` : "Running"}</Pill> : event.status === "complete" ? <Pill tone="gold">Complete</Pill> : event.status === "locked" ? <Pill tone="ready">Locked</Pill> : <Pill tone="muted">Lobby</Pill>;

  return (
    <div className={cn("ta ta-stage flex h-[var(--app-viewport-h)] flex-col overflow-clip", motion && "ta--motion")} data-testid="ta-event" data-status={event.status}>
      {/* header */}
      <header className={cn("flex shrink-0 flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:gap-3", landscape ? "pb-1" : "pb-2")}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link to={backHref} className="ta-btn ta-btn--sm !px-2" aria-label="Back to the Arena"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <Eyebrow className="truncate">{event.kind === "duel" ? "Custom duel" : event.kind === "match" ? "Custom match" : "Tournament"} · {game.title} · Bo{event.best_of}</Eyebrow>
              {fixture && <SimulatedBadge className="hidden shrink-0 sm:inline-flex" />}
            </div>
            <h1 className={cn("ta-title ta-title--gold truncate font-bold leading-tight", landscape ? "text-[18px]" : "text-[20px] sm:text-[26px]")}>{event.title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          {statusPill}
          {champion && (
            <Btn size="sm" onClick={() => setCelebrate(`${event.event_id}:champion:replay:${Date.now()}`)} data-testid="ta-replay-champion"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Replay</span></Btn>
          )}
          <span className="min-w-0 flex-1 sm:flex-none">{tools}</span>
        </div>
      </header>

      {/* body */}
      <div className={cn("flex min-h-0 flex-1 gap-4 px-4", desktop ? "flex-row" : "flex-col")}>
        {event.status === "open" ? (
          <EventLobby event={event} viewerId={viewerId} readyIds={readyIds} onToggleReady={(id) => setReadyIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} onLock={() => gateway.lock(event.event_id, [...readyIds, ...event.entrants.map((e) => e.profile_id)])} />
        ) : bracket ? (
          <>
            <TournamentArenaBracket event={event} viewerId={viewerId} selectedId={selectedId} onSelect={onSelect} beats={beats} />
            {desktop ? (
              <aside className="flex w-[21rem] shrink-0 flex-col" data-testid="ta-side">
                <AnimatePresence mode="popLayout" initial={false}>
                  {selected ? (
                    <fm.div key={selected.node_id} initial={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: 16 }} transition={ease(reduced ? 0.12 : 0.22)} className="ta-plate ta-scroll min-h-0 flex-1 overflow-y-auto p-4">
                      <NodeDetail event={event} node={selected} viewerId={viewerId} actions={actions} onClose={() => setSelectedId(null)} fixture={fixture} />
                    </fm.div>
                  ) : (
                    <fm.div key="summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease(0.18)} className="ta-plate flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                      <EventSummary event={event} viewerId={viewerId} />
                    </fm.div>
                  )}
                </AnimatePresence>
              </aside>
            ) : (
              <BottomSheet open={Boolean(selected)} onClose={() => setSelectedId(null)} title="Match detail" testId="ta-sheet" landscape={landscape}>
                {selected && <NodeDetail event={event} node={selected} viewerId={viewerId} actions={actions} fixture={fixture} />}
              </BottomSheet>
            )}
          </>
        ) : null}
      </div>

      {/* organizer / fixture bar */}
      {(event.viewer_role === "organizer" || fixture) && event.status !== "open" && (
        <div className={cn("flex shrink-0 flex-wrap items-center gap-2 px-4", landscape ? "py-1.5" : "py-3")} data-testid="ta-organizer-bar">
          {event.status === "locked" && <Btn tone="primary" onClick={() => gateway.start(event.event_id)} data-testid="ta-start"><Play className="h-4 w-4" aria-hidden="true" />Start {roundName(1, total)}</Btn>}
          {fixture && event.status === "running" && <Btn onClick={() => gateway.stepResult(event.event_id)} data-testid="ta-step"><StepForward className="h-4 w-4" aria-hidden="true" />Step next result</Btn>}
          {fixture && <Btn size="sm" onClick={() => { setSelectedId(null); gateway.reset(event.event_id); }} data-testid="ta-reset"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset scenario</Btn>}
          <span className="ml-auto hidden text-[10.5px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.45)] sm:inline">Revision {event.revision}{fixture ? " · fixture gateway" : ""}</span>
        </div>
      )}

      {/* ceremonies */}
      {finals && finalNode && (
        <FinalsIntro
          key={finals}
          a={entrantById(event.entrants, finalNode.slots[0].profile_id)}
          b={entrantById(event.entrants, finalNode.slots[1].profile_id)}
          title={`${event.title}`}
          kicker="The final"
          bestOf={finalNode.best_of}
          onDone={() => setFinals(null)}
          sfxId={arenaEventId(event.event_id, "versus", finals)}
        />
      )}
      {celebrate && champion && (
        <ChampionCelebration
          key={celebrate}
          champion={champion}
          runnerUp={runnerUp}
          eventTitle={event.title}
          score={finalNode && finalNode.best_of > 1 ? `${Math.max(finalNode.slots[0].wins, finalNode.slots[1].wins)}–${Math.min(finalNode.slots[0].wins, finalNode.slots[1].wins)}` : null}
          onDone={() => setCelebrate(null)}
          sfxId={arenaEventId(event.event_id, "champion", celebrate)}
        />
      )}
    </div>
  );
}

function EventSummary({ event, viewerId }: { event: ArenaEvent; viewerId: string | null }) {
  const bracket = event.bracket!;
  const total = bracket.rounds;
  const champion = entrantById(event.entrants, event.champion_profile_id);
  const mine = viewerId ? bracket.nodes.find((n) => (n.status === "live" || n.status === "ready") && n.slots.some((s) => s.profile_id === viewerId)) : null;
  const remaining = event.entrants.filter((e) => e.status !== "eliminated" && e.status !== "withdrawn" && e.status !== "invited");
  const decided = bracket.nodes.filter((n) => n.status === "complete" || n.status === "walkover").length;
  const playable = bracket.nodes.filter((n) => n.status !== "bye").length;
  return (
    <>
      {champion ? (
        <div className="ta-plate ta-plate--gold flex items-center gap-3 p-3" data-testid="ta-champion-banner">
          <EntrantAvatar entrant={champion} size="lg" hex />
          <div className="min-w-0">
            <p className="ta-eyebrow inline-flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" aria-hidden="true" />Champion</p>
            <p className="ta-title truncate text-[18px] font-bold text-white">{champion.display_name}</p>
          </div>
        </div>
      ) : (
        <div>
          <Eyebrow>Bracket</Eyebrow>
          <p className="mt-1 text-[13px] text-[rgba(215,205,180,0.8)]"><b className="ta-num text-white">{remaining.length}</b> still in · <b className="ta-num text-white">{decided}</b>/{playable} matches decided</p>
        </div>
      )}
      {mine && (
        <div className="ta-plate border-[rgba(143,211,255,0.35)] p-3">
          <Eyebrow><span className="text-[#9fd8ff]">Your match</span></Eyebrow>
          <p className="mt-1 text-[13px] text-white">{roundName(mine.round, total)} · {mine.status === "live" ? "live now" : "ready when you are"}</p>
          <p className="mt-1 text-[11.5px] text-[rgba(215,205,180,0.6)]">Select it on the bracket to play.</p>
        </div>
      )}
      <ol className="flex flex-col gap-1.5" aria-label="Rounds">
        {Array.from({ length: total }, (_, i) => {
          const r = i + 1;
          const nodes = bracket.nodes.filter((n) => n.round === r && n.status !== "bye");
          const done = nodes.filter((n) => n.status === "complete" || n.status === "walkover").length;
          const liveN = nodes.filter((n) => n.status === "live").length;
          return (
            <li key={r} className="flex items-center gap-2 text-[12.5px]">
              <span className={cn("w-24 shrink-0 font-semibold", done === nodes.length && nodes.length ? "text-[#f1dc9c]" : "text-white/85")}>{roundName(r, total)}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#c9a84c] transition-transform duration-700 [transform-origin:0_50%]" style={{ transform: `scaleX(${nodes.length ? done / nodes.length : 0})` }} /></span>
              <span className="ta-num w-12 text-right text-[rgba(215,205,180,0.65)]">{done}/{nodes.length}</span>
              {liveN > 0 && <Pill tone="live">{liveN}</Pill>}
            </li>
          );
        })}
      </ol>
      <div>
        <Eyebrow tone="muted" className="mb-1.5">Still in · {remaining.length}</Eyebrow>
        <ul className="flex flex-wrap gap-1" aria-label="Players still in">
          {remaining.map((e) => (
            <li key={e.profile_id} className="ta-chip !min-h-7 !pl-1 !pr-2 text-[11px]" style={accentStyle(e.profile_id)} title={`Seed ${e.seed ?? "–"}`}>
              <EntrantAvatar entrant={e} size="xs" crown={false} />{e.display_name}
            </li>
          ))}
        </ul>
        {event.entrants.some((e) => e.status === "eliminated") && (
          <>
            <Eyebrow tone="muted" className="mb-1.5 mt-3">Eliminated</Eyebrow>
            <ul className="flex flex-wrap gap-1 opacity-55 saturate-50" aria-label="Eliminated players">
              {event.entrants.filter((e) => e.status === "eliminated").map((e) => (
                <li key={e.profile_id} className="ta-chip !min-h-7 !pl-1 !pr-2 text-[11px]" style={accentStyle(e.profile_id)}>
                  <EntrantAvatar entrant={e} size="xs" crown={false} />{e.display_name}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="mt-auto text-[11px] leading-snug text-[rgba(215,205,180,0.5)]">Select any match for its detail. Future slots say where their player comes from; nothing is projected.</p>
    </>
  );
}
