import React from "react";
import type { ChampionDoc, DocAbility, DocChampionStats, DocFormula, DocRankValues } from "../../lib/league-docs/api";

const card = "rounded-2xl border border-border bg-card/40 p-5 md:p-6";
const SLOT_LABELS: Record<DocAbility["slot"], string> = { P: "Passive", Q: "Q", W: "W", E: "E", R: "R" };

function rankText(values: DocRankValues | null): string | null {
  if (!values) return null;
  if (values.by_rank && values.by_rank.length > 0) return values.by_rank.join(" / ");
  return values.raw || null;
}

const STAT_ROWS: { label: string; base: (s: DocChampionStats) => number | null; growth?: (s: DocChampionStats) => number | null; growthSuffix?: string; hidden?: (s: DocChampionStats) => boolean }[] = [
  { label: "Health", base: (s) => s.hp, growth: (s) => s.hp_per_level },
  { label: "Health regen (per 5s)", base: (s) => s.hp5, growth: (s) => s.hp5_per_level },
  { label: "Mana", base: (s) => s.mp, growth: (s) => s.mp_per_level, hidden: (s) => !s.mp },
  { label: "Mana regen (per 5s)", base: (s) => s.mp5, growth: (s) => s.mp5_per_level, hidden: (s) => !s.mp },
  { label: "Attack damage", base: (s) => s.ad, growth: (s) => s.ad_per_level },
  { label: "Attack speed", base: (s) => s.attack_speed, growth: (s) => s.attack_speed_per_level, growthSuffix: "%" },
  { label: "Armor", base: (s) => s.armor, growth: (s) => s.armor_per_level },
  { label: "Magic resist", base: (s) => s.magic_resist, growth: (s) => s.magic_resist_per_level },
  { label: "Move speed", base: (s) => s.move_speed },
  { label: "Attack range", base: (s) => s.attack_range },
];

export default function ChampionReference({ doc }: { doc: ChampionDoc }) {
  const { champion, stats, abilities, meta } = doc;
  return (
    <article className="mx-auto max-w-3xl px-4 py-6">
      <header className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428] to-[#0a0a1a] p-5 md:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-[#c9a84c]">League Docs · Champion</p>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{champion.name}</h1>
        {champion.title && <p className="text-sm italic text-muted-foreground">{champion.title}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {champion.resource_type && <Fact label="Resource" value={champion.resource_type} />}
          {champion.release_date && <Fact label="Released" value={champion.release_date} />}
        </dl>
      </header>

      {stats && (
        <Section title="Base Stats & Growth">
          <ul>
            {STAT_ROWS.filter((row) => !row.hidden?.(stats)).map((row) => {
              const base = row.base(stats);
              const growth = row.growth?.(stats) ?? null;
              return (
                <li key={row.label} className="flex justify-between py-1">
                  <span>{row.label}</span>
                  <strong>
                    {base ?? "—"}
                    {growth ? ` (+${growth}${row.growthSuffix ?? ""}/level)` : ""}
                  </strong>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Abilities">
        <div className="space-y-4">
          {abilities.map((ability) => (
            <div key={ability.slot}>
              <h3 className="font-bold">
                {SLOT_LABELS[ability.slot]}
                {ability.name ? ` — ${ability.name}` : ""}
              </h3>
              {ability.description && <p className="text-sm text-muted-foreground">{ability.description}</p>}
              <ul className="mt-1 text-xs text-muted-foreground">
                {rankText(ability.cooldown) && <li>Cooldown: {rankText(ability.cooldown)}</li>}
                {rankText(ability.cost) && <li>Cost: {rankText(ability.cost)}</li>}
                {rankText(ability.range) && <li>Range: {rankText(ability.range)}</li>}
              </ul>
              {ability.formulas.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {ability.formulas.map((formula: DocFormula, i: number) => (
                    <li key={`${formula.type}-${i}`} className="font-mono text-[12px] text-foreground/90">
                      {formula.label}: {formula.normalized}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <footer className="mt-4 text-xs text-muted-foreground">
        {meta.patch ? `Patch ${meta.patch}. ` : ""}
        {meta.source ? `Source: ${meta.source}. ` : ""}
        Verification: {meta.verification_status}
        {meta.last_verified ? ` (as of ${meta.last_verified})` : ""}.
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`mt-4 ${card}`}>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-black/20 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
