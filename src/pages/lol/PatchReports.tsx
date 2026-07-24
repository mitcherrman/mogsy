import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  fetchPatchReport,
  fetchPatchReports,
  type MogzyStatus,
  type PatchEntityType,
  type PatchReportCard,
} from "@/lib/patch-reports/api";
import { PatchReportEntityCard } from "@/components/patch-reports/PatchReportEntityCard";
import { STATUS_LABELS, filterCards } from "@/lib/patch-reports/filter";

const GOLD = "#c9a84c";

const TYPE_LABELS: Record<PatchEntityType, string> = {
  champion: "Champions",
  item: "Items",
  rune: "Runes",
  system: "Systems & Modes",
};

const TYPE_ORDER: PatchEntityType[] = ["champion", "item", "rune", "system"];

const PatchReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PatchEntityType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MogzyStatus | "all">("all");

  const listQuery = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
  const patches = listQuery.data?.patches ?? [];
  const selectedVersion = searchParams.get("patch") ?? patches[0]?.patch_version ?? null;

  const detailQuery = useQuery({
    queryKey: ["patch-report", selectedVersion],
    queryFn: () => fetchPatchReport(selectedVersion as string),
    enabled: Boolean(selectedVersion),
  });

  const detail = detailQuery.data;
  const filtered = useMemo(
    () => filterCards(detail?.cards ?? [], search, typeFilter, statusFilter),
    [detail, search, typeFilter, statusFilter],
  );
  const byType = useMemo(() => {
    const groups = new Map<PatchEntityType, PatchReportCard[]>();
    for (const t of TYPE_ORDER) groups.set(t, []);
    for (const card of filtered) groups.get(card.entity_type)?.push(card);
    return groups;
  }, [filtered]);

  const selectedSummary = patches.find((p) => p.patch_version === selectedVersion);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 text-foreground">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.3em]" style={{ color: GOLD }}>
          Mogzy Knowledge
        </p>
        <h1 className="mt-1 text-3xl font-bold">Patch Reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every gameplay change from the latest official League of Legends patches —
          what changed, why Riot changed it, and whether Mogzy&apos;s data matches.
        </p>
      </header>

      {listQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading patches…</p>
      )}
      {listQuery.isError && (
        <p className="text-sm text-destructive">Could not load patch reports.</p>
      )}
      {!listQuery.isLoading && !listQuery.isError && patches.length === 0 && (
        <p className="text-sm text-muted-foreground">No patch reports have been built yet.</p>
      )}

      {/* Patch selector timeline */}
      {patches.length > 0 && (
        <nav aria-label="Patch selector" className="mb-6 flex flex-wrap gap-2">
          {patches.map((p) => {
            const active = p.patch_version === selectedVersion;
            return (
              <button
                key={p.patch_version}
                onClick={() => setSearchParams({ patch: p.patch_version })}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]"
                    : "border-border bg-card text-muted-foreground hover:border-[#c9a84c]/50"
                }`}
              >
                {p.patch_version}
              </button>
            );
          })}
        </nav>
      )}

      {/* Summary strip */}
      {selectedSummary && (
        <section
          aria-label="Patch summary"
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        >
          <SummaryTile label="Entities changed" value={selectedSummary.card_count} />
          <SummaryTile label="Total changes" value={selectedSummary.change_count} />
          {TYPE_ORDER.map((t) => (
            <SummaryTile
              key={t}
              label={TYPE_LABELS[t]}
              value={selectedSummary.cards_by_type[t] ?? 0}
            />
          ))}
        </section>
      )}

      {/* Search + filters */}
      {detail && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities or properties…"
            aria-label="Search changes"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-[#c9a84c] sm:max-w-xs"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as PatchEntityType | "all")}
            aria-label="Filter by entity type"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">All types</option>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as MogzyStatus | "all")}
            aria-label="Filter by Mogzy status"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABELS) as MogzyStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {detailQuery.isLoading && selectedVersion && (
        <p className="text-sm text-muted-foreground">Loading patch {selectedVersion}…</p>
      )}
      {detailQuery.isError && (
        <p className="text-sm text-destructive">Could not load patch {selectedVersion}.</p>
      )}

      {detail &&
        TYPE_ORDER.map((t) => {
          const cards = byType.get(t) ?? [];
          if (cards.length === 0) return null;
          return (
            <section key={t} aria-label={TYPE_LABELS[t]} className="mb-10">
              <h2
                className="mb-4 border-b pb-2 text-xl font-bold"
                style={{ borderColor: `${GOLD}40` }}
              >
                {TYPE_LABELS[t]}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {cards.length}
                </span>
              </h2>
              <div className="flex flex-col gap-4">
                {cards.map((card) => (
                  <PatchReportEntityCard key={card.id} card={card} />
                ))}
              </div>
            </section>
          );
        })}

      {detail && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No changes match the current filters.</p>
      )}

      {detail && (
        <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Official source:{" "}
          <a
            href={detail.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[#c9a84c]"
          >
            Riot patch {detail.patch_version} notes
          </a>{" "}
          · Report built {new Date(detail.built_at).toLocaleString()}
        </footer>
      )}
    </div>
  );
};

const SummaryTile = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-border bg-card px-3 py-2">
    <p className="text-lg font-bold" style={{ color: GOLD }}>
      {value}
    </p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

export default PatchReports;
