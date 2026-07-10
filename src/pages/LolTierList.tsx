import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Swords, ArrowRight, Trophy } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { SITE_URL } from "@/lib/site-config";
import lolIcon from "@/assets/lol-icon.png";

type Tier = "S+" | "S" | "A" | "B" | "C";
type Role = "Top" | "Jungle" | "Mid" | "ADC" | "Support";

interface ChampionEntry {
  name: string;
  tier: Tier;
  note?: string;
}

const PATCH_LABEL = "Patch 14.10";

const TIER_DATA: Record<Role, ChampionEntry[]> = {
  Top: [
    { name: "Aatrox", tier: "S+", note: "Sustain bruiser, dominant in extended fights." },
    { name: "K'Sante", tier: "S", note: "Pro-play menace with strong teamfight pivots." },
    { name: "Camille", tier: "S", note: "Lane bully that snowballs side lanes." },
    { name: "Darius", tier: "A", note: "Crushes melee match-ups, weak vs ranged." },
    { name: "Fiora", tier: "A", note: "Carry-style splitpusher with high skill ceiling." },
    { name: "Garen", tier: "B", note: "Safe pick, ceiling capped at mid-elo." },
    { name: "Tryndamere", tier: "B", note: "Splitpush specialist, weak to crowd control." },
    { name: "Yorick", tier: "C", note: "Strong 1v1, falls off in teamfights." },
  ],
  Jungle: [
    { name: "Bel'Veth", tier: "S+", note: "Best scaling jungler in the meta." },
    { name: "Brand", tier: "S", note: "AP damage spike around 2 items." },
    { name: "Lillia", tier: "S", note: "Fast clear, strong objective control." },
    { name: "Kha'Zix", tier: "A", note: "Snowballs isolated targets." },
    { name: "Wukong", tier: "A", note: "Reliable engage tank with carry potential." },
    { name: "Vi", tier: "B", note: "Strong ganks, mediocre clear." },
    { name: "Master Yi", tier: "B", note: "Punishes uncoordinated teams." },
    { name: "Shyvana", tier: "C", note: "Needs items to come online." },
  ],
  Mid: [
    { name: "Hwei", tier: "S+", note: "Highest pick-rate carry mage right now." },
    { name: "Yone", tier: "S", note: "Flex carry with insane teamfight potential." },
    { name: "Ahri", tier: "S", note: "Safe roaming mage, scales well." },
    { name: "Akali", tier: "A", note: "All-in assassin with sky-high skill ceiling." },
    { name: "Orianna", tier: "A", note: "Best teamfight control mage." },
    { name: "Syndra", tier: "B", note: "Burst pick that struggles vs gap closers." },
    { name: "Annie", tier: "B", note: "Beginner-friendly burst mage." },
    { name: "Ryze", tier: "C", note: "Pro pick, hard to execute solo queue." },
  ],
  ADC: [
    { name: "Kai'Sa", tier: "S+", note: "Best hybrid carry in the bot lane." },
    { name: "Jinx", tier: "S", note: "Hyper-scaler with team-wide reset potential." },
    { name: "Caitlyn", tier: "S", note: "Lane bully with strong tower-take pressure." },
    { name: "Ashe", tier: "A", note: "Utility carry, on-hit Guinsoo build is meta." },
    { name: "Varus", tier: "A", note: "Flex pick — lethality or on-hit." },
    { name: "Vayne", tier: "A", note: "Late-game monster vs tanks." },
    { name: "Ezreal", tier: "B", note: "Safe poke, falls off vs hyper-carries." },
    { name: "Sivir", tier: "B", note: "Wave-clear and team utility." },
    { name: "Kalista", tier: "C", note: "Niche flex; rewards coordination." },
  ],
  Support: [
    { name: "Nautilus", tier: "S+", note: "Lockdown engage support, S-tier in every elo." },
    { name: "Thresh", tier: "S", note: "Highest skill expression, top-tier playmaker." },
    { name: "Leona", tier: "S", note: "Snowballs lane with reliable CC chain." },
    { name: "Lulu", tier: "A", note: "Best enchanter for hyper-carry ADCs." },
    { name: "Janna", tier: "A", note: "Safest scaling enchanter." },
    { name: "Pyke", tier: "B", note: "Roaming assassin support." },
    { name: "Soraka", tier: "B", note: "Heal-bot for late-game compositions." },
    { name: "Brand", tier: "C", note: "Damage support; weak vs all-in lanes." },
  ],
};

const ROLES: Role[] = ["Top", "Jungle", "Mid", "ADC", "Support"];
const TIER_ORDER: Tier[] = ["S+", "S", "A", "B", "C"];

const TIER_STYLES: Record<Tier, { label: string; ring: string; bg: string; text: string }> = {
  "S+": { label: "S+ God Tier", ring: "ring-[#ff4655]/40", bg: "bg-gradient-to-r from-[#ff4655]/20 to-[#ff4655]/5", text: "text-[#ff4655]" },
  S: { label: "S Tier", ring: "ring-[#c9a84c]/40", bg: "bg-gradient-to-r from-[#c9a84c]/20 to-[#c9a84c]/5", text: "text-[#c9a84c]" },
  A: { label: "A Tier", ring: "ring-[#3a7bd5]/40", bg: "bg-gradient-to-r from-[#3a7bd5]/20 to-[#3a7bd5]/5", text: "text-[#3a7bd5]" },
  B: { label: "B Tier", ring: "ring-emerald-500/40", bg: "bg-gradient-to-r from-emerald-500/15 to-emerald-500/5", text: "text-emerald-400" },
  C: { label: "C Tier", ring: "ring-zinc-500/40", bg: "bg-gradient-to-r from-zinc-500/15 to-zinc-500/5", text: "text-zinc-300" },
};

export default function LolTierList() {
  const [role, setRole] = useState<Role>("Mid");

  const grouped = useMemo(() => {
    const list = TIER_DATA[role];
    const out: Record<Tier, ChampionEntry[]> = { "S+": [], S: [], A: [], B: [], C: [] };
    for (const c of list) out[c.tier].push(c);
    return out;
  }, [role]);

  const totalChampions = Object.values(TIER_DATA).reduce((n, arr) => n + arr.length, 0);

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `League of Legends Tier List — ${role} (${PATCH_LABEL})`,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    numberOfItems: TIER_DATA[role].length,
    itemListElement: TIER_DATA[role].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${c.name} (${c.tier})`,
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "League of Legends", item: `${SITE_URL}/lol` },
      { "@type": "ListItem", position: 3, name: "Tier List", item: `${SITE_URL}/lol/tier-list` },
    ],
  };

  return (
    <div>
      <SEOHead
        title={`League of Legends Tier List ${PATCH_LABEL} — Best Champions by Role | Mogsy`}
        description={`The Mogsy LoL tier list ranks the best League of Legends champions for ${PATCH_LABEL} across Top, Jungle, Mid, ADC and Support. Updated meta picks with notes.`}
        path="/lol/tier-list"
        keywords="league of legends tier list, lol tier list, best lol champions, lol meta, lol patch tier list, top lane tier list, jungle tier list, mid tier list, adc tier list, support tier list"
        jsonLd={[itemListLd, breadcrumbLd]}
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground mb-3">
          <Link to="/lol" className="hover:text-foreground">League of Legends</Link>
          <span className="mx-2 opacity-50">/</span>
          <span className="text-foreground">Tier List</span>
        </nav>

        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-6 md:p-10">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={lolIcon} alt="" aria-hidden className="absolute -right-10 -top-10 w-80 h-80 object-contain blur-2xl" />
          </div>
          <div className="relative flex items-center gap-4">
            <div className="rounded-xl bg-black/40 border border-[#c9a84c]/30 p-3">
              <Trophy className="h-8 w-8 text-[#c9a84c]" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#c9a84c] font-bold">{PATCH_LABEL} · Meta Rankings</div>
              <h1 className="text-2xl md:text-4xl font-bold text-foreground">League of Legends Tier List</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 max-w-2xl">
                The best champions to climb with this patch, ranked across all five roles. Curated from
                pro-play data, high-elo win rates and the Mogsy community.
              </p>
            </div>
          </div>
        </header>

        {/* Role tabs */}
        <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Tier list role">
          {ROLES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={role === r}
              onClick={() => setRole(r)}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors ${
                  role === r
                    ? "bg-[#c9a84c]/90 text-black border-[#c9a84c]"
                    : "bg-card/70 backdrop-blur-sm text-foreground border-border hover:border-[#c9a84c]/50"
                }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Tier rows */}
        <section className="mt-4 space-y-3" aria-label={`${role} tier list`}>
          {TIER_ORDER.map((tier) => {
            const champs = grouped[tier];
            if (!champs.length) return null;
            const s = TIER_STYLES[tier];
            return (
              <article
                key={tier}
                className={`rounded-xl border border-border ring-1 ${s.ring} ${s.bg} p-4`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`text-2xl md:text-3xl font-black ${s.text}`}>{tier}</div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</div>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {champs.map((c) => (
                    <li
                      key={c.name}
                      className="rounded-lg border border-border bg-background/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">{c.name}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.text}`}>{tier}</span>
                      </div>
                      {c.note && (
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{c.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        {/* Methodology / SEO body */}
        <section className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5">
            <h2 className="text-lg font-bold text-foreground mb-2">How the Mogsy LoL tier list works</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This tier list ranks the {totalChampions} most-played League of Legends champions across the
              five roles for {PATCH_LABEL}. Rankings blend high-elo win rates, pro-play presence and the
              community votes powering the Mogsy ranking platform. Champions are graded from <b>S+</b>
              {" "}(must-pick / ban) down to <b>C</b> (niche or off-meta), and each entry includes a quick
              note on how the champion fits into the current meta.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              Want to test a build against this meta? Use the <Link to="/combat-lab" className="text-[#c9a84c] hover:underline">Combat Lab</Link>
              {" "}to simulate matchups, or jump into <Link to="/swipe" className="text-[#c9a84c] hover:underline">Swipe</Link>
              {" "}to vote on the next iteration of this list.
            </p>
          </div>

          <Link
            to="/combat-lab"
            className="group relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/90 to-[#0a1428]/90 backdrop-blur-sm p-5 hover:border-primary/50 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-black/40 border border-white/10 p-3">
                <Swords className="h-5 w-5 text-[#c9a84c]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground">Test it in Combat Lab</h3>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-primary transition-all" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Run simulated matchups against meta champions and theorycraft builds.
                </p>
              </div>
            </div>
          </Link>
        </section>

        {/* FAQ for SEO */}
        <section className="mt-6 rounded-xl border border-border bg-card/70 backdrop-blur-sm p-5">
          <h2 className="text-lg font-bold text-foreground mb-3">FAQ</h2>
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-semibold text-foreground">What patch is this LoL tier list for?</h3>
              <p className="text-muted-foreground">{PATCH_LABEL}. We refresh rankings every major patch.</p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Who is the best champion right now?</h3>
              <p className="text-muted-foreground">
                Across roles, Aatrox (Top), Bel'Veth (Jungle), Hwei (Mid), Kai'Sa (ADC) and Nautilus
                (Support) lead the S+ tier this patch.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">How do you rank champions?</h3>
              <p className="text-muted-foreground">
                We combine high-elo win rates, pro-play presence and head-to-head votes from the Mogsy
                community to grade champions from S+ down to C.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}