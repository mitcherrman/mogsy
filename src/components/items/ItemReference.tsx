import React from "react";
import { formatGold, shopPrice, statusLine, type CanonicalItem } from "../../lib/items/types";

type LinkView = (props: { to: string; className?: string; children: React.ReactNode }) => JSX.Element;
const Anchor: LinkView = ({ to, className, children }) => <a href={to} className={className}>{children}</a>;
const card = "rounded-2xl border border-border bg-card/40 p-5 md:p-6";

export default function ItemReference({ item, iconUrl, Link = Anchor }: {
  item: CanonicalItem; iconUrl: string | null; Link?: LinkView;
}) {
  const price = shopPrice(item);
  return <article className="mx-auto max-w-3xl px-4 py-6">
    <header className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428] to-[#0a0a1a] p-5 md:p-7">
      <div className="flex items-center gap-4">
        {iconUrl && <img src={iconUrl} alt={`${item.name} item icon`} width="80" height="80" className="h-20 w-20 rounded-xl border border-[#c9a84c]/40" />}
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#c9a84c]">League of Legends · Item</p>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">{item.name}</h1>
          <p className="text-sm text-muted-foreground">{statusLine(item)}</p></div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {price !== null && <Fact label="Cost" value={`${formatGold(price)} gold`} />}
        {item.stats.map((stat) => <Fact key={stat.key} label={stat.label} value={stat.display} />)}
      </dl>
    </header>
    <Section title="Stats"><ul>{item.stats.map((stat) => <li key={stat.key} className="flex justify-between py-1"><span>{stat.label}</span><strong>{stat.display}</strong></li>)}</ul></Section>
    <Section title="Cost"><dl>
      {price !== null && <FactRow label="Shop price" value={`${formatGold(price)} gold`} />}
      {item.base_cost !== null && <FactRow label="Component value" value={`${formatGold(item.base_cost)} gold`} />}
      {item.combine_cost !== null && <FactRow label="Combine cost" value={`${formatGold(item.combine_cost)} gold`} />}
    </dl></Section>
    <Section title="Recipe"><ul className="space-y-2">{item.components.map((part) => <li key={part.slug}>
      <Link to={`/items/${part.slug}`} className="font-medium text-foreground hover:text-[#c9a84c]">{part.name}{part.quantity > 1 ? ` ×${part.quantity}` : ""}</Link>
    </li>)}</ul></Section>
    <Section title="Effects"><div className="space-y-4">{item.effects.map((effect) => <div key={effect.slot}>
      <h3 className="font-bold">{effect.name ?? effect.kind ?? "Effect"}</h3>
      {effect.description && <p className="text-sm text-muted-foreground">{effect.description}</p>}
      {effect.description2 && <p className="text-sm text-muted-foreground">{effect.description2}</p>}
    </div>)}</div></Section>
    <section className={`mt-4 ${card}`}><h2 className="text-lg font-bold">Use this on Mogzy</h2>
      <div className="mt-3 flex gap-3"><Link to="/combat-lab" className="font-semibold text-[#c9a84c]">Open Combat Lab</Link><Link to="/quiz" className="font-semibold">Practice item questions</Link></div>
    </section>
    <footer className="mt-4 text-xs text-muted-foreground">Data from the League of Legends Wiki{item.provenance.source_revision ? `, revision ${item.provenance.source_revision}` : ""}.</footer>
  </article>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={`mt-4 ${card}`}><h2 className="mb-3 text-lg font-bold">{title}</h2>{children}</section>;
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-black/20 px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-bold">{value}</dd></div>;
}
function FactRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-1"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>;
}
