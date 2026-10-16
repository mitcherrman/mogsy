/**
 * ROG1-D1 — lineup: a champion per role, optional substitute swaps, then the
 * match. Each change is one server action (`pick_champion`,
 * `swap_substitute`); the board always shows the server's answer.
 *
 * A champion pick belongs to the ROLE and survives a swap, so a substitute's
 * card shows their proficiency on the champion already picked for that role:
 * the tradeoff is visible before the swap.
 */
import { Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChampionEntry, DynastyPlayer, DynastyRole, DynastySnapshot } from "@/lib/dynasty/contracts";
import { DYNASTY_ROLES } from "@/lib/dynasty/contracts";
import { ROLE_LABEL, championName, fixed, proficiencyFor, signed, sortedPool } from "@/lib/dynasty/model";
import { Eyebrow, GOLD_TEXT, PlayerCard, RoleTag, SURFACE } from "./parts";

export function LineupStage({ snapshot, champions, busy, onPick, onSwap, onPlay }: {
  snapshot: DynastySnapshot;
  champions: readonly ChampionEntry[];
  busy: string | null;
  onPick: (role: DynastyRole, championKey: string) => void;
  onSwap: (playerId: string) => void;
  onPlay: () => void;
}) {
  const missing = DYNASTY_ROLES.filter((r) => !snapshot.champions[r]);
  const takenBy = new Map<string, DynastyRole>();
  for (const r of DYNASTY_ROLES) {
    const k = snapshot.champions[r];
    if (k) takenBy.set(k, r);
  }
  const disabled = busy !== null;

  return (
    <section aria-labelledby="lineup-heading" className="space-y-4" data-testid="dynasty-lineup">
      <header className={cn(SURFACE, "p-4")}>
        <Eyebrow>Lineup</Eyebrow>
        <h2 id="lineup-heading" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Lock champions and set the starting five</h2>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-white/60">
          Proficiency is the player&apos;s record on that champion; anything outside their pool is an off-pool pick at the ruleset&apos;s off-pool floor.
          Each champion can be used once. You can change picks and swaps until the match starts.
        </p>
      </header>

      <ol className="space-y-2.5">
        {DYNASTY_ROLES.map((role) => (
          <RoleRow
            key={role}
            role={role}
            starter={snapshot.roster.starters[role]}
            picked={snapshot.champions[role]}
            catalog={snapshot.champion_catalog.length ? snapshot.champion_catalog : champions}
            takenBy={takenBy}
            disabled={disabled}
            onPick={(k) => onPick(role, k)}
          />
        ))}
      </ol>

      <section className={cn(SURFACE, "p-4")} aria-labelledby="bench-heading">
        <Eyebrow>Bench</Eyebrow>
        <h3 id="bench-heading" className="mt-2 text-base font-bold text-white">Substitutes</h3>
        <p className="mt-1 text-[12px] text-white/55">A substitute swaps only with the starter of the same role. The champion picked for that role stays.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {snapshot.roster.substitutes.map((sub) => {
            const starter = snapshot.roster.starters[sub.role];
            const champ = snapshot.champions[sub.role];
            const subProf = proficiencyFor(sub, champ);
            const starterProf = proficiencyFor(starter, champ);
            return (
              <PlayerCard
                key={sub.player_id}
                player={sub}
                champions={champions}
                compact
                testId={`sub-${sub.player_id}`}
                notes={
                  <>
                    {starter ? <span className="block">vs starter {starter.name}: {signed(sub.rating - starter.rating)} rating</span> : null}
                    {champ ? (
                      <span className="block">
                        On {championName(champ, champions)}: {subProf !== null ? subProf.toFixed(2) : "off-pool"} (starter {starterProf !== null ? starterProf.toFixed(2) : "off-pool"})
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="mt-2 w-full rounded-lg border border-[#e3c66f]/40 px-3 py-1.5 text-[12.5px] font-semibold text-[#f1dc95] transition hover:bg-[#e3c66f]/10 disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => onSwap(sub.player_id)}
                      data-testid={`swap-${sub.player_id}`}
                    >
                      Swap in for {starter?.name ?? ROLE_LABEL[sub.role]} ({ROLE_LABEL[sub.role]})
                    </button>
                  </>
                }
              />
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1424]/95 p-3 shadow-xl backdrop-blur">
        <p className="min-w-0 text-[12.5px] text-white/70" aria-live="polite" data-testid="lineup-status">
          {missing.length ? `Pick a champion for ${missing.map((r) => ROLE_LABEL[r]).join(", ")}.` : "Lineup complete. The opponent is drawn when the match starts."}
        </p>
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#e3c66f] px-4 py-2 sm:w-auto text-sm font-bold text-[#1a1406] shadow transition hover:bg-[#f1dc95] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={missing.length > 0 || disabled}
          onClick={onPlay}
          data-testid="play-match"
        >
          <Swords className="h-4 w-4" aria-hidden />
          {busy === "play_match" ? "Simulating…" : "Start match"}
        </button>
      </div>
    </section>
  );
}

function RoleRow({ role, starter, picked, catalog, takenBy, disabled, onPick }: {
  role: DynastyRole;
  starter: DynastyPlayer | undefined;
  picked: string | undefined;
  catalog: readonly ChampionEntry[];
  takenBy: Map<string, DynastyRole>;
  disabled: boolean;
  onPick: (key: string) => void;
}) {
  if (!starter) return null;
  const pool = sortedPool(starter);
  const poolKeys = new Set(pool.map((e) => e.champion_key));
  const offPool = catalog.filter((c) => !poolKeys.has(c.key));
  const pickedOffPool = picked !== undefined && !poolKeys.has(picked);
  return (
    <li className={cn(SURFACE, "p-3")} data-testid={`lineup-${role}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RoleTag role={role} />
        <span className="text-[14px] font-bold text-white">{starter.name}</span>
        <span className={cn("text-[13px] font-bold tabular-nums", GOLD_TEXT)}>{fixed(starter.rating)}</span>
        <span className="ml-auto text-[12px] text-white/60" data-testid={`lineup-${role}-picked`}>
          {picked ? <>Locked: <strong className="text-teal-200">{championName(picked, catalog)}</strong>{pickedOffPool ? " (off-pool)" : ""}</> : "No champion yet"}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={`${ROLE_LABEL[role]} champion pool`}>
        {pool.map((e) => {
          const holder = takenBy.get(e.champion_key);
          const takenElsewhere = holder !== undefined && holder !== role;
          const isPicked = picked === e.champion_key;
          return (
            <button
              key={e.champion_key}
              type="button"
              aria-pressed={isPicked}
              disabled={disabled || takenElsewhere}
              onClick={() => onPick(e.champion_key)}
              data-testid={`pick-${role}-${e.champion_key}`}
              className={cn(
                "flex min-w-[9.5rem] flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition sm:flex-none",
                isPicked ? "border-teal-300 bg-teal-400/15" : "border-white/10 hover:border-teal-300/50",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold leading-tight text-white [overflow-wrap:anywhere]">{championName(e.champion_key, catalog)}</span>
                <span className="block text-[10.5px] text-white/50">{takenElsewhere ? `Locked for ${ROLE_LABEL[holder!]}` : "Proficiency"}</span>
              </span>
              <span className="text-[13px] font-bold tabular-nums text-teal-200">{e.proficiency.toFixed(2)}</span>
            </button>
          );
        })}
        <label className="flex min-w-[9.5rem] flex-1 items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 sm:flex-none">
          <span className="text-[11px] text-white/50">Off-pool</span>
          <select
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white focus:outline-none [&>option]:bg-[#0a1424]"
            value={pickedOffPool ? picked : ""}
            disabled={disabled}
            onChange={(ev) => ev.target.value && onPick(ev.target.value)}
            aria-label={`${ROLE_LABEL[role]} off-pool champion`}
            data-testid={`offpool-${role}`}
          >
            <option value="">Choose…</option>
            {offPool.map((c) => {
              const holder = takenBy.get(c.key);
              return (
                <option key={c.key} value={c.key} disabled={holder !== undefined && holder !== role}>
                  {c.name}{holder && holder !== role ? ` (${ROLE_LABEL[holder]})` : ""}
                </option>
              );
            })}
          </select>
        </label>
      </div>
    </li>
  );
}
