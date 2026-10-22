/**
 * The event lobby before the bracket is locked: who is here and whether they
 * are ready, the join code, and the organizer's "Lock bracket" step. Entrant
 * cards stagger in; ready state ticks green.
 */
import { useState, type CSSProperties } from "react";
import { Check, Copy, Lock, Shield, UserPlus } from "lucide-react";

import { useSfx } from "@/lib/audio/useSfx";
import { cn } from "@/lib/utils";

import { ARENA_SFX, arenaEventId } from "../audio";
import type { ArenaEntrant, ArenaEvent } from "../contracts";
import { gameTypeById } from "../fixtures/catalog";
import { accentStyle } from "../identity";
import { Btn, EntrantAvatar, Eyebrow, Pill } from "../ui/parts";

export function EventLobby({ event, viewerId, onLock, onToggleReady, readyIds }: {
  event: ArenaEvent;
  viewerId: string | null;
  onLock: () => void;
  onToggleReady: (profileId: string) => void;
  /** Fixture ready-state (the backend would carry `checked_in`). */
  readyIds: ReadonlySet<string>;
}) {
  const sfx = useSfx();
  const [copied, setCopied] = useState(false);
  const organizer = event.viewer_role === "organizer";
  const joined = event.entrants.filter((e) => e.status !== "invited" && e.status !== "withdrawn");
  const invited = event.entrants.filter((e) => e.status === "invited");
  const readyCount = joined.filter((e) => readyIds.has(e.profile_id)).length;
  const game = gameTypeById(event.game_type);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(event.join_code ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable */ }
  };
  const toggle = (id: string) => {
    onToggleReady(id);
    if (!readyIds.has(id)) sfx.play(ARENA_SFX.ready, { eventId: arenaEventId(event.event_id, "ready", `${id}:${Date.now()}`) });
  };
  return (
    <div className="ta-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-6 lg:overflow-visible" data-testid="ta-lobby">
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow>Lobby</Eyebrow>
            <p className="mt-1 text-[13px] text-[rgba(215,205,180,0.8)]">
              <b className="ta-num text-white">{joined.length}</b> of {event.max_entrants} seats taken · <b className="ta-num text-[#8ff0b8]">{readyCount}</b> ready
            </p>
          </div>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <span className="block h-full rounded-full bg-[linear-gradient(90deg,#6ee7b7,#f6dd8f)] transition-transform duration-700 [transform-origin:0_50%]" style={{ transform: `scaleX(${joined.length ? readyCount / joined.length : 0})` }} />
          </div>
        </div>
        <ul className="ta-stagger grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" aria-label="Entrants">
          {joined.map((e, i) => (
            <li key={e.profile_id} style={{ "--i": i } as CSSProperties}>
              <EntrantCard entrant={e} ready={readyIds.has(e.profile_id)} isViewer={e.profile_id === viewerId} onToggle={e.profile_id === viewerId || organizer ? () => toggle(e.profile_id) : undefined} />
            </li>
          ))}
          {invited.map((e, i) => (
            <li key={e.profile_id} style={{ "--i": joined.length + i } as CSSProperties}>
              <EntrantCard entrant={e} ready={false} invited isViewer={false} />
            </li>
          ))}
          {Array.from({ length: Math.max(0, event.max_entrants - joined.length - invited.length) }, (_, i) => (
            <li key={`empty-${i}`} style={{ "--i": joined.length + invited.length + i } as CSSProperties}>
              <div className="flex h-full min-h-[4.5rem] items-center justify-center rounded-xl border border-dashed border-white/10 text-[11px] uppercase tracking-[0.16em] text-[rgba(215,205,180,0.4)]">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Open seat
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="flex flex-col gap-3">
        <div className="ta-plate ta-plate--gold p-4">
          <Eyebrow>Join code</Eyebrow>
          <div className="mt-2 flex items-center gap-2">
            <code className="ta-title flex-1 text-[22px] font-bold tracking-[0.16em] text-[#f1dc9c]" data-testid="ta-join-code">{event.join_code ?? "——"}</code>
            <Btn size="sm" onClick={copy} aria-label="Copy join code">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}</Btn>
          </div>
          <p className="mt-2 text-[11.5px] leading-snug text-[rgba(215,205,180,0.6)]">Friends join with the code. {event.visibility === "public" ? "Anyone can find this event." : event.visibility === "link" ? "Anyone with the link can join." : "Invite-only."}</p>
        </div>
        <div className="ta-plate p-4">
          <Eyebrow tone="muted">Format</Eyebrow>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-[rgba(215,205,180,0.55)]">Game</dt><dd className="font-semibold text-white">{game.title}</dd>
            <dt className="text-[rgba(215,205,180,0.55)]">Series</dt><dd className="font-semibold text-white">Best of {event.best_of}</dd>
            <dt className="text-[rgba(215,205,180,0.55)]">Length</dt><dd className="font-semibold text-white">{event.rules.modules} {game.unit}</dd>
            <dt className="text-[rgba(215,205,180,0.55)]">Timer</dt><dd className="font-semibold text-white">{event.rules.question_seconds ? `${event.rules.question_seconds}s` : "Default"}</dd>
            <dt className="text-[rgba(215,205,180,0.55)]">Ruleset</dt><dd className="font-semibold capitalize text-white">{event.rules.ruleset.replace("_", " ")}</dd>
            <dt className="text-[rgba(215,205,180,0.55)]">Rated</dt><dd className="font-semibold text-white">{event.rated ? "Yes" : "No · for fun"}</dd>
          </dl>
        </div>
        {organizer ? (
          <div className="flex flex-col gap-2">
            <Btn tone="primary" size="lg" onClick={onLock} disabled={joined.length < 2} data-testid="ta-lock"><Lock className="h-4 w-4" aria-hidden="true" />Lock bracket</Btn>
            <p className="text-center text-[11px] text-[rgba(215,205,180,0.5)]">Seeds by join order · byes go to the top seeds · {joined.length < 2 ? "needs two players" : `${joined.length} players`}</p>
          </div>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[rgba(215,205,180,0.7)]"><Shield className="h-3.5 w-3.5 text-[#c9a84c]" aria-hidden="true" />Waiting for the organizer to lock the bracket.</p>
        )}
      </aside>
    </div>
  );
}

function EntrantCard({ entrant, ready, invited = false, isViewer, onToggle }: { entrant: ArenaEntrant; ready: boolean; invited?: boolean; isViewer: boolean; onToggle?: () => void }) {
  const inner = (
    <>
      <EntrantAvatar entrant={entrant} size="md" hex />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-white">{entrant.display_name}{isViewer ? <span className="text-[rgba(215,205,180,0.55)]"> · You</span> : null}</span>
        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ta-accent)]">{entrant.role === "organizer" ? "Organizer" : entrant.tier ? `${entrant.tier}` : "Player"}</span>
      </span>
      {invited ? <Pill tone="muted">Invited</Pill> : ready ? <Pill tone="live">Ready</Pill> : <Pill tone="muted">Joined</Pill>}
    </>
  );
  const cls = cn("ta-plate flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-300", ready && "border-[rgba(110,231,183,0.45)] shadow-[0_0_24px_-12px_rgba(110,231,183,0.6)]", invited && "opacity-60");
  return onToggle ? (
    <button type="button" className={cn(cls, "outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-[#c9a84c]")} style={accentStyle(entrant.profile_id)} onClick={onToggle} aria-pressed={ready} data-testid="ta-entrant">
      {inner}
    </button>
  ) : (
    <div className={cls} style={accentStyle(entrant.profile_id)} data-testid="ta-entrant">{inner}</div>
  );
}
