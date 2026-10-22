/**
 * The Arena home: a cinematic hero, the three doors (watch a bracket, run an
 * event, fight a duel) and the event cards. Fixture data throughout.
 */
import { useMemo, type CSSProperties } from "react";
import { ArrowRight, Crown, Swords, Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";

import { roundName, type ArenaEvent } from "@/features/tournament-arena/contracts";
import { gameTypeById } from "@/features/tournament-arena/fixtures/catalog";
import type { ArenaGateway } from "@/features/tournament-arena/gateway/types";
import { entrantById } from "@/features/tournament-arena/identity";
import { Trophy as Cup } from "@/features/tournament-arena/ceremony/Trophy";
import { EntrantAvatar, Eyebrow, Pill, SimulatedBadge } from "@/features/tournament-arena/ui/parts";

export function ArenaHome({ gateway, base }: { gateway: ArenaGateway; base: string }) {
  const motion = useMotionAllowed();
  const events = useMemo(() => gateway.listEvents(), [gateway]);
  const rise = (i: number) => ({ className: "ta-rise", style: { "--ta-delay": `${80 + i * 70}ms` } as CSSProperties });
  return (
    <div className={cn("ta ta-stage min-h-[var(--app-viewport-h)] pb-10", motion && "ta--motion")} data-testid="ta-home">
      {/* hero */}
      <section className="relative overflow-hidden px-4 pt-8 pb-6 sm:pt-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-full opacity-70" aria-hidden="true" style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(227,198,111,0.22), transparent 70%)" }} />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-3 text-center">
          <div {...rise(0)} className="ta-rise flex items-center gap-2"><Eyebrow>Tournament Arena</Eyebrow><SimulatedBadge label="Prototype · fixture data" /></div>
          <h1 {...rise(1)} className="ta-rise ta-title ta-title--gold text-[38px] font-black uppercase leading-[0.95] tracking-[0.08em] sm:text-[64px]">Prove it<br className="sm:hidden" /> in the Arena</h1>
          <p {...rise(2)} className="ta-rise max-w-xl text-[14px] leading-relaxed text-[rgba(215,205,180,0.75)] sm:text-[15px]">
            Brackets for your friends. Custom duels with your rules. Every match plays on the Ranked engine: server-graded, fair inside a node, nothing projected.
          </p>
          <div {...rise(3)} className="ta-rise mt-2 flex flex-wrap items-center justify-center gap-2">
            <Link to={`${base}/host`} className="ta-btn ta-btn--primary ta-btn--lg" data-testid="ta-home-host"><Crown className="h-4 w-4" aria-hidden="true" />Run an event</Link>
            <Link to={`${base}/duel`} className="ta-btn ta-btn--lg" data-testid="ta-home-duel"><Swords className="h-4 w-4" aria-hidden="true" />Fight a duel</Link>
          </div>
        </div>
      </section>

      {/* doors */}
      <section className="mx-auto grid max-w-6xl gap-3 px-4 sm:grid-cols-3">
        <Door i={0} to={`${base}/event/mid-8`} icon={<Trophy className="h-5 w-5" />} title="Watch a bracket" blurb="Eight players, best of three, a quarterfinal live right now." />
        <Door i={1} to={`${base}/host`} icon={<Users className="h-5 w-5" />} title="Match Host Portal" blurb="Pick a game, set the rules, challenge friends, launch." />
        <Door i={2} to={`${base}/duel`} icon={<Swords className="h-5 w-5" />} title="Duel experience" blurb="The VS card, the ready check, the countdown, the reveal." />
      </section>

      {/* events */}
      <section className="mx-auto mt-8 max-w-6xl px-4">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <Eyebrow>Events</Eyebrow>
            <h2 className="ta-title mt-1 text-[20px] font-bold text-white">Every scenario, one state machine</h2>
          </div>
          <p className="hidden text-[11.5px] text-[rgba(215,205,180,0.5)] sm:block">Each card is a real state of the fixture engine, not a picture.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Events">
          {events.map((ev, i) => <li key={ev.event_id}><EventCard event={ev} i={i} to={`${base}/event/${ev.event_id}`} /></li>)}
        </ul>
      </section>
    </div>
  );
}

function Door({ to, icon, title, blurb, i }: { to: string; icon: React.ReactNode; title: string; blurb: string; i: number }) {
  return (
    <div className="ta-rise" style={{ "--ta-delay": `${300 + i * 80}ms` } as CSSProperties}>
      <Link to={to} aria-label={`${title}: ${blurb}`} className="ta-option group flex items-center gap-3 p-4 outline-none" data-testid="ta-door">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgba(201,168,76,0.14)] text-[#f1dc9c] transition-transform duration-300 group-hover:scale-105">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="ta-title block text-[15px] font-bold text-white">{title}</span>
          <span className="block text-[12px] leading-snug text-[rgba(215,205,180,0.65)]">{blurb}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[rgba(215,205,180,0.5)] transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EventCard({ event, to, i }: { event: ArenaEvent; to: string; i: number }) {
  const game = gameTypeById(event.game_type);
  const total = event.bracket?.rounds ?? 0;
  const live = event.bracket?.nodes.filter((n) => n.status === "live") ?? [];
  const champion = entrantById(event.entrants, event.champion_profile_id);
  const players = event.entrants.filter((e) => e.status !== "invited" && e.status !== "withdrawn");
  const liveRound = live[0] ? roundName(live[0].round, total) : null;
  return (
    <div className="ta-rise h-full" style={{ "--ta-delay": `${500 + i * 50}ms` } as CSSProperties}>
      <Link to={to} aria-label={`${event.title}, ${players.length} players, ${event.status}`} className="ta-plate group flex h-full flex-col gap-3 p-4 outline-none transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(201,168,76,0.45)] focus-visible:ring-2 focus-visible:ring-[#c9a84c]" data-testid="ta-event-card" data-event={event.event_id}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow tone="muted">{event.kind === "duel" ? "Custom duel" : event.kind === "match" ? "Custom match" : "Tournament"} · {game.title}</Eyebrow>
            <p className="ta-title mt-1 truncate text-[17px] font-bold text-white">{event.title}</p>
          </div>
          {event.status === "complete" ? <Pill tone="gold">Complete</Pill> : live.length ? <Pill tone="live">{live.length} live</Pill> : event.status === "open" ? <Pill tone="muted">Lobby</Pill> : <Pill tone="ready">{event.status === "locked" ? "Locked" : "Running"}</Pill>}
        </div>
        <div className="flex items-center gap-1">
          {players.slice(0, 8).map((e, j) => <EntrantAvatar key={e.profile_id} entrant={e} size="sm" crown={false} style={{ marginLeft: j ? -6 : 0, zIndex: 10 - j } as CSSProperties} />)}
          {players.length > 8 && <span className="ml-1 text-[11px] font-bold text-[rgba(215,205,180,0.6)]">+{players.length - 8}</span>}
        </div>
        <div className="mt-auto flex items-center justify-between text-[11.5px] text-[rgba(215,205,180,0.65)]">
          <span><b className="ta-num text-white">{players.length}</b> players · Bo{event.best_of}{total ? ` · ${total} rounds` : ""}</span>
          {champion ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[#f1dc9c]"><Cup size={14} />{champion.display_name}</span>
          ) : liveRound ? (
            <span className="font-semibold text-[#8ff0b8]">{liveRound} live</span>
          ) : (
            <span className="transition-transform duration-300 group-hover:translate-x-1">Open <ArrowRight className="inline h-3.5 w-3.5" aria-hidden="true" /></span>
          )}
        </div>
      </Link>
    </div>
  );
}
