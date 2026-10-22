/**
 * ROG1-D1 — choose one of three server-offered relics. The name, rarity and
 * effect text are the backend's (`dynasty.relics.v1`). The "when it matters"
 * line is page copy that only restates when that effect can apply; it never
 * states a number the backend did not send.
 */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DynastyPlayer, DynastyRole, DynastySnapshot, RelicCard } from "@/lib/dynasty/contracts";
import { DYNASTY_ROLES } from "@/lib/dynasty/contracts";
import { ROLE_LABEL, draftedPlayers, fixed, sharedAffiliations } from "@/lib/dynasty/model";
import { Eyebrow, RarityChip, RoleTag, SURFACE } from "./parts";
import { rarityStyle } from "./rarity";

const WHEN_IT_MATTERS: Record<string, string> = {
  baron_buff: "Always applies in the team battle (worth 2 of the 7 points).",
  lane_specialist: "Applies to the one lane you choose; best on a lane you expect to be close.",
  all_in: "A trade: stronger team battle, weaker in all five lanes.",
  flash_ready: "Only acts after you lose a lane: that lane gets one extra roll at its own odds.",
  fearless_scholar: "Only matters for champions outside a starter's proficiency pool.",
  team_spirit: "Only matters if your roster has synergy (shared org or region, frontline, mixed damage).",
};

export function RelicStage({ snapshot, busy, onChoose }: {
  snapshot: DynastySnapshot;
  busy: boolean;
  onChoose: (relicId: string, targetRole: DynastyRole | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState<DynastyRole | null>(null);
  useEffect(() => { setTarget(null); }, [selected]);
  const chosen = snapshot.relic_offer.find((r) => r.relic_id === selected) ?? null;
  const ready = Boolean(chosen && (!chosen.targeted || target));
  const roster = draftedPlayers(snapshot);
  const starters = DYNASTY_ROLES.map((r) => snapshot.roster.starters[r]).filter((p): p is DynastyPlayer => Boolean(p));
  const shared = sharedAffiliations(starters);

  return (
    <section aria-labelledby="relic-heading" className="space-y-4" data-testid="dynasty-relic">
      <header className={cn(SURFACE, "p-4")}>
        <Eyebrow>Roster locked · {roster.length} players</Eyebrow>
        <h2 id="relic-heading" className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Choose a relic</h2>
        <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-white/60">
          One relic for this run. Relics change power or rolls; they never change how many points a battle is worth.
        </p>
        <p className="mt-2 text-[11.5px] text-white/50" data-testid="relic-roster-facts">
          Starters sharing an org: {shared.orgs.length ? shared.orgs.map(([o, n]) => `${o} ×${n}`).join(", ") : "none"} ·
          sharing a region: {shared.regions.length ? shared.regions.map(([o, n]) => `${o} ×${n}`).join(", ") : "none"}
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Relic offer">
        {snapshot.relic_offer.map((r) => (
          <RelicChoice key={r.relic_id} relic={r} selected={selected === r.relic_id} disabled={busy} onSelect={() => setSelected(r.relic_id)} />
        ))}
      </div>

      {chosen?.targeted ? (
        <fieldset className={cn(SURFACE, "p-4")} data-testid="relic-target">
          <legend className="sr-only">Lane for {chosen.name}</legend>
          <Eyebrow>Which lane gets {chosen.name}?</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DYNASTY_ROLES.map((role) => {
              const p = snapshot.roster.starters[role];
              return (
                <label
                  key={role}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2 transition",
                    target === role ? "border-[#e3c66f] bg-[#e3c66f]/10" : "border-white/10 hover:border-white/25",
                  )}
                >
                  <input type="radio" name="relic-target" value={role} className="sr-only" checked={target === role} onChange={() => setTarget(role)} />
                  <RoleTag role={role} />
                  <span className="truncate text-[12px] text-white/80">{p ? `${p.name} · ${fixed(p.rating)}` : "—"}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a1424]/95 p-3 shadow-xl backdrop-blur">
        <p className="text-[12.5px] text-white/70" aria-live="polite">
          {chosen ? (chosen.targeted && !target ? `Pick a lane for ${chosen.name}.` : `Selected ${chosen.name}${target ? ` · ${ROLE_LABEL[target]}` : ""}.`) : "Select a relic."}
        </p>
        <button
          type="button"
          className="w-full rounded-xl bg-[#e3c66f] px-4 py-2 text-sm font-bold sm:w-auto text-[#1a1406] shadow transition hover:bg-[#f1dc95] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!ready || busy}
          onClick={() => chosen && onChoose(chosen.relic_id, chosen.targeted ? target : null)}
          data-testid="relic-confirm"
        >
          {busy ? "Equipping…" : chosen ? `Equip ${chosen.name}` : "Equip"}
        </button>
      </div>
    </section>
  );
}

function RelicChoice({ relic, selected, disabled, onSelect }: { relic: RelicCard; selected: boolean; disabled: boolean; onSelect: () => void }) {
  const r = rarityStyle(relic.rarity);
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      data-testid={`relic-${relic.relic_id}`}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,hsl(258_40%_14%),hsl(214_52%_8%))] p-4 text-left transition",
        r.ring,
        selected ? "ring-2 ring-[#e3c66f] ring-offset-2 ring-offset-[#07101c]" : "hover:border-[#e3c66f]/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] disabled:opacity-50",
      )}
    >
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent", r.glow)} />
      <span className="relative flex items-center justify-between">
        <Sparkles className="h-5 w-5 text-[#e3c66f]" aria-hidden />
        <RarityChip rarity={relic.rarity} />
      </span>
      <span className="relative mt-3 block text-lg font-bold tracking-tight text-white">{relic.name}</span>
      <span className="relative mt-1 block text-[13px] leading-snug text-white/85">{relic.description}</span>
      {WHEN_IT_MATTERS[relic.relic_id] ? (
        <span className="relative mt-3 block border-t border-white/[0.08] pt-2 text-[11.5px] leading-snug text-white/55">
          {WHEN_IT_MATTERS[relic.relic_id]}
        </span>
      ) : null}
      {relic.targeted ? <span className="relative mt-2 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c9a84c]">Choose a lane</span> : null}
    </button>
  );
}
