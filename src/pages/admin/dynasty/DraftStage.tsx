/**
 * ROG1-D1 — draft: seven picks, each one of three server-offered cards.
 * Picks 1-5 fill one starter per role; picks 6-7 are substitutes from any role.
 *
 * Choosing is two steps (select, then confirm) so the comparison stays on
 * screen until the owner commits. Comparisons are plain facts from the
 * snapshot: ratings, proficiencies, shared org/region, the starter a
 * substitute would back up.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { ChampionEntry, DynastyPlayer, DynastySnapshot } from "@/lib/dynasty/contracts";
import { ROLE_LABEL, draftedPlayers, fixed, signed } from "@/lib/dynasty/model";
import { Eyebrow, PlayerCard, SURFACE } from "./parts";

export function DraftStage({ snapshot, champions, busy, onPick }: {
  snapshot: DynastySnapshot;
  champions: readonly ChampionEntry[];
  busy: boolean;
  onPick: (playerId: string) => void;
}) {
  const { draft } = snapshot;
  const [selected, setSelected] = useState<string | null>(null);
  // A new offer clears the selection.
  useEffect(() => { setSelected(null); }, [draft.pick_index]);

  const drafted = draftedPlayers(snapshot);
  const isSub = draft.slot === "sub";
  const pickNo = (draft.pick_index ?? 0) + 1;
  const maxRating = Math.max(...draft.offer.map((p) => p.rating));
  const maxProf = Math.max(...draft.offer.map((p) => Math.max(0, ...p.pool.map((e) => e.proficiency))));
  const chosen = draft.offer.find((p) => p.player_id === selected) ?? null;

  const notesFor = (p: DynastyPlayer) => {
    const lines: string[] = [];
    const sameOrg = drafted.filter((d) => p.org && d.org === p.org).length;
    const sameRegion = drafted.filter((d) => p.region && d.region === p.region).length;
    if (isSub) {
      const starter = snapshot.roster.starters[p.role];
      if (starter) {
        lines.push(`Backs up ${starter.name} at ${ROLE_LABEL[p.role]}: ${signed(p.rating - starter.rating)} rating`);
      }
    }
    if (sameOrg) lines.push(`Shares ${p.org} with ${sameOrg} drafted player${sameOrg > 1 ? "s" : ""}`);
    if (sameRegion) lines.push(`Shares ${p.region} with ${sameRegion} drafted player${sameRegion > 1 ? "s" : ""}`);
    if (!lines.length) lines.push(drafted.length ? "No shared org or region with your roster yet" : "First pick of the run");
    return lines.map((l) => <span key={l} className="block">{l}</span>);
  };

  return (
    <section aria-labelledby="draft-heading" className="space-y-4" data-testid="dynasty-draft">
      <header className={cn(SURFACE, "flex flex-wrap items-end justify-between gap-3 p-4")}>
        <div>
          <Eyebrow>Pick {pickNo} of {draft.total_picks}</Eyebrow>
          <h2 id="draft-heading" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {isSub ? "Draft a substitute" : `Draft your ${ROLE_LABEL[draft.slot as keyof typeof ROLE_LABEL]} starter`}
          </h2>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/60">
            {isSub
              ? "Substitutes can come from any role. Before the match a substitute can only swap with the starter of their own role."
              : "Rating and champion proficiency feed the lane battle. Shared orgs and regions add team-battle synergy. Rarity is cosmetic."}
          </p>
        </div>
        <DraftTrack snapshot={snapshot} />
      </header>

      <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Draft offer">
        {draft.offer.map((p) => (
          <PlayerCard
            key={p.player_id}
            player={p}
            champions={champions}
            selected={selected === p.player_id}
            disabled={busy}
            onSelect={() => setSelected(p.player_id)}
            testId={`offer-${p.player_id}`}
            badge={
              <>
                {p.rating === maxRating ? <Flag>Top rating</Flag> : null}
                {p.pool.some((e) => e.proficiency === maxProf) ? <Flag tone="teal">Best mastery</Flag> : null}
              </>
            }
            notes={notesFor(p)}
          />
        ))}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1424]/95 p-3 shadow-xl backdrop-blur">
        <p className="min-w-0 text-[12.5px] text-white/70" aria-live="polite">
          {chosen ? <>Selected <strong className="text-white">{chosen.name}</strong> · {fixed(chosen.rating)} rating</> : "Select a card to compare, then confirm."}
        </p>
        <button
          type="button"
          className="w-full rounded-xl bg-[#e3c66f] px-4 py-2 text-sm font-bold sm:w-auto text-[#1a1406] shadow transition hover:bg-[#f1dc95] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!chosen || busy}
          onClick={() => chosen && onPick(chosen.player_id)}
          data-testid="draft-confirm"
        >
          {busy ? "Drafting…" : chosen ? `Draft ${chosen.name}` : "Draft"}
        </button>
      </div>
    </section>
  );
}

function Flag({ children, tone = "gold" }: { children: string; tone?: "gold" | "teal" }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em]",
      tone === "gold" ? "bg-[#e3c66f]/15 text-[#f1dc95]" : "bg-teal-400/15 text-teal-200",
    )}>
      {children}
    </span>
  );
}

function DraftTrack({ snapshot }: { snapshot: DynastySnapshot }) {
  const slots = ["top", "jng", "mid", "bot", "sup", "sub", "sub"] as const;
  const at = snapshot.draft.pick_index ?? snapshot.draft.picks.length;
  return (
    <ol className="flex gap-1" aria-label="Draft slots">
      {slots.map((s, i) => (
        <li
          key={i}
          aria-current={i === at ? "step" : undefined}
          className={cn(
            "flex h-8 w-9 items-center justify-center rounded-md text-[10px] font-bold uppercase tracking-wide",
            i < at && "bg-[#e3c66f]/20 text-[#f1dc95]",
            i === at && "bg-[#e3c66f] text-[#1a1406]",
            i > at && "bg-white/[0.05] text-white/35",
          )}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}
