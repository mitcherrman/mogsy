import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  fetchPatchReport,
  fetchPatchReports,
  type MogzyStatus,
  type PatchEntityType,
} from "@/lib/patch-reports/api";
import { PatchHubMasthead } from "@/components/patch-reports/PatchHubMasthead";
import { PatchHubSection } from "@/components/patch-reports/PatchHubSection";
import { PatchHubSectionNav } from "@/components/patch-reports/PatchHubSectionNav";
import { PatchDataStatusNotice } from "@/components/patch-reports/PatchDataStatusNotice";
import { STATUS_LABELS, filterCards } from "@/lib/patch-reports/filter";
import {
  buildPatchReportStructure,
  filterReportStructure,
} from "@/lib/patch-reports/report-structure";

const RECON_ANCHOR = "patch-data-status";

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
  // One semantic authority: structure (sections, anchors, section intros,
  // direction buckets) is built from the whole report, then narrowed to the
  // filtered cards, so a search never changes an anchor or re-promotes a
  // hoisted section intro onto the one entry left.
  const structure = useMemo(
    () => (detail ? buildPatchReportStructure(detail) : null),
    [detail],
  );
  const sections = useMemo(
    () => (structure ? filterReportStructure(structure, new Set(filtered)).sections : []),
    [structure, filtered],
  );
  const changeCount = useMemo(
    () => filtered.reduce((n, c) => n + c.changes.length, 0),
    [filtered],
  );
  const filtering = search.trim() !== "" || typeFilter !== "all" || statusFilter !== "all";

  // A deep link like ?patch=26.18#s-patch-champions__e-champion-ahri targets content that
  // only exists after the detail query resolves, so scroll once it has.
  useEffect(() => {
    if (!detail || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [detail]);

  const notice = detail && <PatchDataStatusNotice reconciliation={detail.reconciliation} />;
  // Riot's account leads. The reconciliation notice sits above the report only
  // when Mogzy's data is NOT known-current; a clean RECONCILED notice moves to
  // the footer. Never hidden: absent status renders as not-reconciled.
  const noticeFirst = detail?.reconciliation?.status !== "RECONCILED";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 text-foreground">
      <PatchHubMasthead
        patchVersion={selectedVersion}
        detail={detail}
        entityCount={filtered.length}
        changeCount={changeCount}
        sectionCount={sections.length}
        reconciliation={detail?.reconciliation}
        reconciliationAnchor={RECON_ANCHOR}
      />

      {listQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Loading patches…</p>
      )}
      {listQuery.isError && (
        <p className="text-sm text-destructive">Could not load patch reports.</p>
      )}
      {!listQuery.isLoading && !listQuery.isError && patches.length === 0 && (
        <p className="text-sm text-muted-foreground">No patch reports have been built yet.</p>
      )}

      {patches.length > 0 && (
        <nav
          aria-label="Patch selector"
          className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
        >
          {patches.map((p) => {
            const active = p.patch_version === selectedVersion;
            return (
              <button
                key={p.patch_version}
                onClick={() => setSearchParams({ patch: p.patch_version })}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
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

      {detail && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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
            className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm"
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
            className="min-w-0 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">All Mogzy statuses</option>
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

      {detail && <PatchHubSectionNav sections={sections} />}

      {noticeFirst && <div id={RECON_ANCHOR}>{notice}</div>}

      {sections.map((section) => (
        <PatchHubSection key={section.anchor} section={section} />
      ))}

      {detail && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {filtering ? "No changes match the current filters." : "This report has no entries."}
        </p>
      )}

      {detail && (
        <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          {!noticeFirst && <div id={RECON_ANCHOR} className="mb-4">{notice}</div>}
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

export default PatchReports;
