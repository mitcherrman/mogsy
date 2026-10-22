/**
 * THE REAL MATCH ROOM for one bracket node:
 *
 *   VS + ready check  →  countdown  →  [QuizRankedMatch, hosted]  →  result
 *
 * Everything that decides anything is the server's:
 *   - the ready check is `POST …/nodes/{node}/play` (backend B3): the first
 *     press readies you, the press that makes both players ready creates the
 *     one Ranked game, and the bracket poll reports both;
 *   - the match is the canonical `QuizRankedMatch` (server-graded,
 *     server-timed), mounted as a HOSTED match so the room owns its entry and
 *     its close;
 *   - the result screen reads the node's recorded game from the event
 *     projection (winner, points, outcome). Until that revision arrives it
 *     says "Recording the result", and it never shows a guessed or simulated
 *     score.
 *
 * Fable's duel seats, VS mark, countdown and score plate are reused as-is
 * (`DuelSeat`, `DuelScorePlate`); reduced motion keeps every frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { ArrowLeft, Loader2, Swords, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useSfx } from "@/lib/audio/useSfx";
import type { MatchHost } from "@/lib/ranked-core/flow/matchHost";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { useViewportLock } from "@/lib/pro-play/worldsExperience/viewportLock";
import { cn } from "@/lib/utils";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";

import { arenaErrorCopy, playArenaNode } from "../api/arenaApi";
import type { LiveArenaEvent } from "../api/useLiveArenaEvent";
import { ARENA_SFX } from "../audio";
import { nodeLabel, roundName, type ArenaEntrant, type ArenaGame, type ArenaNode } from "../contracts";
import { DuelScorePlate, DuelSeat } from "../duel/DuelExperience";
import { entrantById } from "../identity";
import { ease } from "../motion";
import { Btn, Eyebrow, Pill, VersusMark } from "../ui/parts";

export const ARENA_MATCH_EYEBROW = "Tournament Arena";

type RoomPhase = "lobby" | "countdown" | "match" | "settling" | "result";

export interface ArenaMatchRoomProps {
  live: LiveArenaEvent;
  nodeId: string;
  /** The signed-in account's auth id (the Ranked match's membership key). */
  viewerUserId: string;
  viewerDisplayName?: string | null;
  /** The event page (the bracket). */
  backHref: string;
  /** Where the room hands off after the result (bracket, focused on this node). */
  onBackToBracket: () => void;
}

/** The node's game this room just finished, as the server recorded it. */
export function recordedGame(node: ArenaNode | null, afterGames: number): ArenaGame | null {
  if (!node || node.games.length <= afterGames) return null;
  return node.games[node.games.length - 1] ?? null;
}

export function ArenaMatchRoom({ live, nodeId, viewerUserId, viewerDisplayName, backHref, onBackToBracket }: ArenaMatchRoomProps) {
  useViewportLock();
  const motion = useMotionAllowed();
  const reduced = useReducedMotionPreference();
  const sfx = useSfx();
  const ev = live.event;
  const node = ev?.bracket?.nodes.find((n) => n.node_id === nodeId) ?? null;
  const me = ev?.viewer_profile_id ?? null;
  const side = node && me ? node.slots.findIndex((s) => s.profile_id === me) : -1;
  const you = ev && node && side >= 0 ? entrantById(ev.entrants, node.slots[side].profile_id) : null;
  const opponent = ev && node && side >= 0 ? entrantById(ev.entrants, node.slots[1 - side].profile_id) : null;
  const ready = node?.status === "ready" ? node.ready_profile_ids ?? [] : [];
  const readyYou = Boolean(me) && ready.includes(me as string);
  const readyOpp = Boolean(opponent) && ready.includes(opponent?.profile_id as string);
  const matchId = node?.status === "live" ? node.current_match_id : null;

  const [phase, setPhase] = useState<RoomPhase>("lobby");
  const [count, setCount] = useState(3);
  const [pressing, setPressing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [playedMatch, setPlayedMatch] = useState<string | null>(null);
  const gamesBefore = useRef<number>(0);
  const pressId = useRef<string | null>(null);
  // Did this visit see the ready check? A room opened onto a game already in
  // progress (a reload, a reconnect) goes straight back into it.
  const sawReadyCheck = useRef(false);
  if (node?.status === "ready") sawReadyCheck.current = true;

  // A live game appears (our press made it, or the opponent's did): count in.
  useEffect(() => {
    if (!matchId || phase !== "lobby") return;
    gamesBefore.current = node?.games.length ?? 0;
    setPlayedMatch(matchId);
    if (!motion || !sawReadyCheck.current) { setPhase("match"); return; }
    setCount(3);
    setPhase("countdown");
  }, [matchId, phase, motion, node?.games.length]);

  useEffect(() => {
    if (phase !== "countdown") return;
    if (count === 0) {
      sfx.play("ranked.duel.begin", { eventId: `arena:room:${playedMatch}:begin` });
      const t = window.setTimeout(() => setPhase("match"), reduced ? 150 : 450);
      return () => window.clearTimeout(t);
    }
    sfx.play(count === 1 ? "quiz.countdown.final" : "quiz.countdown.urgent", { eventId: `arena:room:${playedMatch}:count:${count}` });
    const t = window.setTimeout(() => setCount((c) => c - 1), reduced ? 300 : 800);
    return () => window.clearTimeout(t);
  }, [phase, count, sfx, playedMatch, reduced]);

  // After the match: wait for the revision that records the game.
  const game = phase === "settling" || phase === "result" ? recordedGame(node, gamesBefore.current) : null;
  useEffect(() => {
    if (phase === "settling" && game) {
      setPhase("result");
      const won = game.winner_profile_id && game.winner_profile_id === me;
      const lost = game.winner_profile_id && game.winner_profile_id !== me;
      sfx.play(won ? "ranked.match.victory" : lost ? "ranked.match.defeat" : "ranked.match.draw", { eventId: `arena:room:${playedMatch}:result` });
    }
  }, [phase, game, me, sfx, playedMatch]);
  const { refresh } = live;
  useEffect(() => {
    if (phase !== "settling") return;
    const t = window.setInterval(refresh, 1500);
    return () => window.clearInterval(t);
  }, [phase, refresh]);

  const host = useMemo<MatchHost>(() => ({
    eyebrow: ARENA_MATCH_EYEBROW,
    settlingMessage: "Recording the result…",
    onMatchSettled: () => { setPhase("settling"); refresh(); },
  }), [refresh]);

  const pressReady = useCallback(async () => {
    if (!ev || pressing) return;
    setPressing(true);
    setNotice(null);
    pressId.current = pressId.current ?? `play_${ev.event_id.slice(-8)}_${nodeId}_${Date.now().toString(36)}`;
    try {
      const out = await playArenaNode(ev.event_id, nodeId, pressId.current);
      live.apply(out.event);
      sfx.play(ARENA_SFX.ready, { eventId: `arena:room:${ev.event_id}:${nodeId}:ready:${ev.revision}` });
      pressId.current = null;
    } catch (e) {
      setNotice(arenaErrorCopy(e));
      pressId.current = null;
      live.refresh();
    } finally {
      setPressing(false);
    }
  }, [ev, nodeId, pressing, live, sfx]);

  const nextGame = useCallback(() => {
    setPlayedMatch(null);
    setPhase("lobby");
    live.refresh();
  }, [live]);

  if (!ev) {
    return (
      <RoomFrame title="Tournament match" backHref={backHref} motion={motion}>
        {live.error ? <RoomMessage text={arenaErrorCopy(live.error)} backHref={backHref} /> : <RoomMessage text="Loading the match…" spinner />}
      </RoomFrame>
    );
  }
  const total = ev.bracket?.rounds ?? 1;
  const where = node
    ? `${node.round === total ? "Final" : `${roundName(node.round, total)} · ${nodeLabel(node, total)}`} · Bo${node.best_of}`
    : "Match";

  if (phase === "match" && playedMatch) {
    return (
      <QuizRankedMatch
        key={playedMatch}
        matchId={playedMatch}
        viewerUserId={viewerUserId}
        viewerDisplayName={viewerDisplayName ?? null}
        entry="recovered"
        host={host}
        chrome={(
          <div className={arenaHeaderRowClass("wide")} data-testid="ta-room-chrome">
            <Link to={backHref} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[rgba(215,205,180,0.8)] hover:text-white"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Bracket</Link>
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-[#f1dc9c]">{ev.title} · {where}</span>
          </div>
        )}
      />
    );
  }

  if (!node || side < 0 || !you) {
    return (
      <RoomFrame title={ev.title} kicker={where} backHref={backHref} motion={motion}>
        <RoomMessage text="This is not your match. Open the bracket to follow it." backHref={backHref} />
      </RoomFrame>
    );
  }

  const decided = node.status === "complete" || node.status === "walkover" || node.status === "bye";
  return (
    <RoomFrame title={ev.title} kicker={where} backHref={backHref} motion={motion} phase={phase}>
      <AnimatePresence mode="wait">
        {(phase === "lobby" || phase === "countdown") && !decided && (
          <fm.div key="vs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={ease(0.3)} className="relative flex w-full max-w-4xl flex-col items-center gap-5">
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
              <DuelSeat entrant={you} side="left" label="You" ready={node.status === "live" ? true : readyYou} onReady={node.status === "ready" && !readyYou && !node.attention && !pressing ? pressReady : undefined} />
              <div className="relative flex flex-col items-center gap-3">
                <VersusMark size={84} className="sm:!h-[104px] sm:!w-[104px] sm:!text-[36px]" />
                <AnimatePresence mode="wait">
                  {phase === "countdown" ? (
                    <fm.p key={count} className={cn("ta-count ta-title--gold text-[72px] sm:text-[110px]", motion && "ta-count--tick")} data-testid="ta-count" aria-live="assertive">{count === 0 ? "GO" : count}</fm.p>
                  ) : (
                    <fm.p key="ready-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[rgba(215,205,180,0.7)]" aria-live="polite" data-testid="ta-room-state">
                      {node.attention ? "The organizer resolves this match"
                        : node.status === "pending" ? "Waiting on an earlier result"
                        : node.status === "live" ? "Joining the match…"
                        : readyYou && readyOpp ? "Both ready"
                        : readyYou ? "Waiting for opponent…"
                        : readyOpp ? "Your opponent is ready"
                        : "Ready check"}
                    </fm.p>
                  )}
                </AnimatePresence>
              </div>
              {opponent ? <DuelSeat entrant={opponent} side="right" label="Opponent" ready={node.status === "live" ? true : readyOpp} /> : <PendingSeat />}
            </div>
            {node.status === "ready" && !readyYou && !node.attention && (
              <Btn tone="primary" size="lg" onClick={pressReady} disabled={pressing} data-testid="ta-room-ready"><Swords className="h-5 w-5" aria-hidden="true" />{pressing ? "Readying…" : "I am ready"}</Btn>
            )}
            {node.status === "ready" && node.ready_deadline && <ReadyDeadline deadline={node.ready_deadline} serverNow={ev.server_now} />}
            {notice && <p role="alert" className="max-w-md text-center text-[12px] text-[#f6c3cc]" data-testid="ta-room-notice">{notice}</p>}
            <p className="max-w-md text-center text-[11px] leading-snug text-[rgba(215,205,180,0.5)]">The match starts the moment both of you are ready. Stay on this screen: leaving a live match counts as absence, and the Ranked engine forfeits an absent player.</p>
          </fm.div>
        )}

        {phase === "settling" && (
          <fm.div key="settling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease(0.2)}>
            <RoomMessage text="Recording the result…" spinner />
          </fm.div>
        )}

        {phase === "result" && game && (
          <RoomResult key="result" game={game} node={node} you={you} opponent={opponent} side={side as 0 | 1} me={me} onNext={node.status === "ready" ? nextGame : null} onBack={onBackToBracket} />
        )}

        {phase === "lobby" && decided && (
          <fm.div key="decided" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ease(0.2)} className="flex flex-col items-center gap-3 text-center" data-testid="ta-room-decided">
            <Pill tone="gold"><Trophy className="h-3 w-3" aria-hidden="true" />{entrantById(ev.entrants, node.winner_profile_id)?.display_name ?? "A player"} advanced</Pill>
            <p className="text-[13px] text-[rgba(215,205,180,0.75)]">{node.status === "walkover" ? "This match was decided without a game." : "This match is decided."}</p>
            <Btn tone="primary" onClick={onBackToBracket}><Trophy className="h-4 w-4" aria-hidden="true" />Back to the bracket</Btn>
          </fm.div>
        )}
      </AnimatePresence>
    </RoomFrame>
  );
}

function RoomResult({ game, node, you, opponent, side, me, onNext, onBack }: {
  game: ArenaGame; node: ArenaNode; you: ArenaEntrant; opponent: ArenaEntrant | null; side: 0 | 1; me: string | null;
  onNext: (() => void) | null; onBack: () => void;
}) {
  const winner: 0 | 1 | null = game.winner_profile_id ? (game.winner_profile_id === me ? 0 : 1) : null;
  const mine = side === 0 ? game.score_a : game.score_b;
  const theirs = side === 0 ? game.score_b : game.score_a;
  const label = winner === 0 ? "Victory" : winner === 1 ? "Defeat" : game.outcome === "no_contest" ? "No contest" : "Draw";
  const decided = node.status === "complete" || node.status === "walkover";
  return (
    <fm.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={ease(0.3)} className="relative flex w-full max-w-4xl flex-col items-center gap-4" data-testid="ta-result" data-outcome={winner === 0 ? "victory" : winner === 1 ? "defeat" : "draw"} data-real="true">
      <p className={cn("ta-result text-[48px] sm:text-[86px]", winner === 0 ? "ta-result--victory" : winner === 1 ? "ta-result--defeat" : "ta-result--draw")}>{label}</p>
      <span className="ta-rule w-[min(28rem,70%)]" aria-hidden="true" />
      <div className="flex w-full flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-8">
        <div className="order-first sm:order-none sm:col-start-2 sm:row-start-1">
          {mine != null && theirs != null ? <DuelScorePlate a={mine} b={theirs} winner={winner} /> : <p className="text-[12px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.6)]">{game.outcome === "forfeit" ? "Decided by forfeit" : "No points recorded"}</p>}
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:contents">
          <div className="sm:col-start-1 sm:row-start-1"><DuelSeat entrant={you} side="left" label="You" won={winner === 0} lost={winner === 1} action={winner === 0 ? "celebrate" : winner === 1 ? "hit" : "focus"} /></div>
          {opponent && <div className="sm:col-start-3 sm:row-start-1"><DuelSeat entrant={opponent} side="right" label="Opponent" won={winner === 1} lost={winner === 0} action={winner === 1 ? "celebrate" : winner === 0 ? "hit" : "focus"} /></div>}
        </div>
      </div>
      <p className="text-[12px] text-[rgba(215,205,180,0.7)]" data-testid="ta-result-series">
        {decided ? `${node.winner_profile_id === me ? "You advance" : "Your run ends here"} · series ${node.slots[side].wins}–${node.slots[1 - side].wins}`
          : game.outcome === "draw" || game.outcome === "no_contest" ? "Undecided games replay: one more game decides it."
          : `Series ${node.slots[side].wins}–${node.slots[1 - side].wins} · first to ${Math.floor(node.best_of / 2) + 1}`}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {onNext && !decided && <Btn tone="primary" onClick={onNext} data-testid="ta-next-game"><Swords className="h-4 w-4" aria-hidden="true" />Next game</Btn>}
        <Btn onClick={onBack} data-testid="ta-back-bracket"><Trophy className="h-4 w-4" aria-hidden="true" />Back to the bracket</Btn>
      </div>
    </fm.div>
  );
}

function PendingSeat() {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="ta-seat__figure flex items-center justify-center text-[rgba(215,205,180,0.45)]">?</span>
      <span className="ta-title text-[15px] font-semibold text-white/70 sm:text-[19px]">To be decided</span>
    </div>
  );
}

function ReadyDeadline({ deadline, serverNow }: { deadline: string; serverNow: string }) {
  const skew = useMemo(() => Date.parse(serverNow) - Date.now(), [serverNow]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.round((Date.parse(deadline) - (now + skew)) / 1000));
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  return <p className="ta-num text-[11px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.6)]" data-testid="ta-ready-deadline">Ready check closes in {mm}:{ss}</p>;
}

function RoomFrame({ title, kicker, backHref, motion, phase, children }: { title: string; kicker?: string; backHref: string; motion: boolean; phase?: RoomPhase; children: React.ReactNode }) {
  return (
    <div className={cn("ta ta-stage flex h-[var(--app-viewport-h)] flex-col overflow-clip", motion && "ta--motion")} data-testid="ta-room" data-phase={phase ?? "loading"}>
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-1">
        <Link to={backHref} className="ta-btn ta-btn--sm !px-2" aria-label="Back to the bracket"><ArrowLeft className="h-4 w-4" /></Link>
        <div className="min-w-0 flex-1">
          <Eyebrow className="truncate">{kicker ?? ARENA_MATCH_EYEBROW}</Eyebrow>
          <h1 className="ta-title ta-title--gold truncate text-[18px] font-bold leading-tight sm:text-[22px]">{title}</h1>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4">{children}</div>
    </div>
  );
}

function RoomMessage({ text, spinner = false, backHref }: { text: string; spinner?: boolean; backHref?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center" data-testid="ta-room-message">
      {spinner && <Loader2 className="h-6 w-6 animate-spin text-[#c9a84c]" aria-hidden="true" />}
      <p className="max-w-sm text-[13px] text-[rgba(215,205,180,0.8)]">{text}</p>
      {backHref && <Link to={backHref} className="ta-btn ta-btn--sm">Back to the bracket</Link>}
    </div>
  );
}

