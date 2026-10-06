import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
import type { PatchReportEntrySlots } from "@/components/patch-reports/PatchReportEntrySlots";
import { PatchImpactChangeAnalysis } from "@/components/patch-impact/PatchImpactChangeAnalysis";
import { CombatLabHandoffLink } from "@/components/patch-hub-combat-lab/CombatLabHandoffLink";
import { PatchHubViewSwitch, type PatchHubView } from "@/components/patch-reports/PatchHubViewSwitch";
import { PatchCatchUpView } from "@/components/patch-catchup/PatchCatchUpView";
import {
  catchUpSearch,
  readLocationState,
  patchReportHref,
  readPatchHubRoute,
  reportSearch,
  type PatchHubLocationState,
} from "@/components/patch-catchup/route";
import {
  forgetRememberedBaseline,
  readRememberedBaseline,
  writeRememberedBaseline,
} from "@/components/patch-catchup/remembered-baseline";
import { combatLabHandoffFor } from "@/lib/patch-hub-combat-lab/handoff";
import { usePatchHubShare } from "@/hooks/usePatchHubShare";
import { resolveLandingTarget } from "@/lib/patch-hub-share/anchors";
import { reportAnchorUrl } from "@/lib/patch-hub-share/urls";
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

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}

const PatchReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // `?since=` (or `?view=catchup`) is Catch Up; anything else is the Patch Report.
  const route = readPatchHubRoute(searchParams);
  const catchUp = route.mode === "catchup";
  const locationState = useMemo(() => readLocationState(location.state), [location.state]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<PatchEntityType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<MogzyStatus | "all">("all");

  const listQuery = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
  const patches = listQuery.data?.patches ?? [];
  const selectedVersion = searchParams.get("patch") ?? patches[0]?.patch_version ?? null;

  // Catch Up never fetches the single-patch report in the background.
  const detailQuery = useQuery({
    queryKey: ["patch-report", selectedVersion],
    queryFn: () => fetchPatchReport(selectedVersion as string),
    enabled: Boolean(selectedVersion) && !catchUp,
  });

  const detail = catchUp ? undefined : detailQuery.data;
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
  // PH2 Patch Impact attaches through the PH1 changeAnalysis seam (under Riot's
  // exact line, before Mogzy evidence). The slot returns a component so the
  // loader hook lives in a real component body.
  const reportVersion = detail?.patch_version ?? null;
  const share = usePatchHubShare();
  const slots = useMemo<PatchReportEntrySlots | undefined>(
    () =>
      reportVersion
        ? {
            changeAnalysis: (ctx) => <PatchImpactChangeAnalysis ctx={ctx} patchVersion={reportVersion} />,
            // PH4-C: champion-only handoff; one per entity, never per change, and no patch data.
            // The slot returns null for ineligible cards so the header adds no empty wrapper.
            entityActions: ({ entity }) => {
              const handoff = combatLabHandoffFor(entity.card);
              return handoff ? <CombatLabHandoffLink handoff={handoff} /> : null;
            },
            // PH4-A: the entity permalink always names its patch, so a copy never
            // drifts to whatever later becomes "latest".
            entityShare: ({ entity }) => ({
              href: patchReportHref(reportVersion, entity.anchor),
              onShare: () => {
                void share({
                  url: reportAnchorUrl(reportVersion, entity.anchor),
                  title: `${entity.card.entity_name} · Patch ${reportVersion} changes`,
                });
                navigate({ search: reportSearch(reportVersion), hash: `#${entity.anchor}` }, { replace: true });
              },
            }),
          }
        : undefined,
    [reportVersion, share, navigate],
  );
  const filtering = search.trim() !== "" || typeFilter !== "all" || statusFilter !== "all";

  // A deep link like ?patch=26.18#s-patch-champions__e-champion-ahri targets content that
  // only exists after the detail query resolves, so scroll once it has. Keyed by
  // the router location too: arriving from Catch Up at a report that is already
  // cached renders the same `detail` object, and a new hash on the same report
  // changes no data at all; both must still scroll. Once per navigation.
  //
  // PH4-A: a browser's own scroll restoration can land after our scroll (as it
  // did for Catch-Up Back), so the scroll is re-applied once on the next frame.
  // If the exact id is gone (a re-ingest renamed a line), landing falls back
  // exact → group → entity, and never to an unrelated line.
  const scrolledFor = useRef<string | null>(null);
  const reapplyFrame = useRef<number | null>(null);
  useEffect(() => {
    if (catchUp || !detail || !location.hash) return;
    const token = `${location.key}${location.hash}`;
    if (scrolledFor.current === token) return;
    scrolledFor.current = token;
    const el = resolveLandingTarget(decodeHash(location.hash), (id) => document.getElementById(id));
    if (!el) return;
    el.scrollIntoView?.();
    if (typeof window.requestAnimationFrame !== "function") return;
    if (reapplyFrame.current !== null) window.cancelAnimationFrame(reapplyFrame.current);
    reapplyFrame.current = window.requestAnimationFrame(() => {
      reapplyFrame.current = null;
      if (el.isConnected) el.scrollIntoView?.();
    });
  }, [catchUp, detail, location.key, location.hash]);
  useEffect(
    () => () => {
      if (reapplyFrame.current !== null) window.cancelAnimationFrame?.(reapplyFrame.current);
    },
    [],
  );

  /* ---------------------------- Catch Up wiring ---------------------------- */

  const listData = listQuery.data;
  const listedVersions = useMemo(() => (listData?.patches ?? []).map((p) => p.patch_version), [listData]);
  const sourceUrls = useMemo(
    () => new Map((listData?.patches ?? []).map((p) => [p.patch_version, p.source_url])),
    [listData],
  );
  // Bumped after a write/forget so the remembered value is re-read.
  const [memoryEpoch, setMemoryEpoch] = useState(0);
  const remembered = useMemo(
    () => readRememberedBaseline(listedVersions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listedVersions, memoryEpoch],
  );

  // URL hygiene: in Catch Up, `patch` and `through` are dropped and `view` is
  // implied by `since` (replace, so no history entry).
  const cleanSearch = route.mode === "catchup" ? route.cleanSearch : null;
  useEffect(() => {
    if (cleanSearch === null) return;
    navigate({ search: cleanSearch, hash: location.hash }, { replace: true, state: location.state });
  }, [cleanSearch, navigate, location.hash, location.state]);

  // Catch Up without a baseline uses the remembered one, once it is known to be
  // listed. Normal Patch Report mode never reads it.
  const since = route.mode === "catchup" ? route.since : null;
  useEffect(() => {
    if (!catchUp || since !== null || cleanSearch !== null || !remembered) return;
    const state: PatchHubLocationState = { ...locationState, fromMemory: true };
    navigate({ search: catchUpSearch(remembered) }, { replace: true, state });
  }, [catchUp, since, cleanSearch, remembered, navigate, locationState]);

  const onBaselineChange = useCallback(
    (version: string) => {
      writeRememberedBaseline(version);
      setMemoryEpoch((n) => n + 1);
      // Tweaking the baseline must not stack history entries.
      const state: PatchHubLocationState = { ...locationState, fromMemory: false };
      navigate({ search: catchUpSearch(version) }, { replace: true, state });
    },
    [navigate, locationState],
  );

  const onForget = useCallback(() => {
    forgetRememberedBaseline();
    setMemoryEpoch((n) => n + 1);
    const state: PatchHubLocationState = { ...locationState, fromMemory: false };
    navigate({ search: location.search, hash: location.hash }, { replace: true, state });
  }, [navigate, location.search, location.hash, locationState]);

  // Focus follows an explicit view switch (not a refresh or Back).
  const [catchUpFocusRequest, setCatchUpFocusRequest] = useState(0);
  const focusReportHeading = useRef(false);
  const onSwitch = useCallback((view: PatchHubView) => {
    if (view === "catchup") setCatchUpFocusRequest((n) => n + 1);
    else focusReportHeading.current = true;
  }, []);
  useEffect(() => {
    if (catchUp || !focusReportHeading.current) return;
    const heading = document.getElementById("patch-report-heading");
    if (!heading) return;
    focusReportHeading.current = false;
    heading.focus();
  }, [catchUp, selectedVersion]);

  const returnPatch = catchUp ? (locationState.returnPatch ?? null) : searchParams.get("patch");
  const catchUpState: PatchHubLocationState = { returnPatch, fromMemory: remembered !== null };
  const viewSwitch = (
    <PatchHubViewSwitch
      current={catchUp ? "catchup" : "report"}
      reportTo={{ pathname: "/lol/patch-reports", search: reportSearch(returnPatch) }}
      catchUpTo={{ pathname: "/lol/patch-reports", search: catchUpSearch(remembered) }}
      catchUpState={catchUpState}
      onSwitch={onSwitch}
    />
  );

  if (catchUp) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-foreground">
        <PatchHubMasthead
          patchVersion={null}
          detail={undefined}
          entityCount={0}
          changeCount={0}
          sectionCount={0}
          reconciliationAnchor={RECON_ANCHOR}
          viewSwitch={viewSwitch}
        />
        {listQuery.isLoading && <p className="text-sm text-muted-foreground">Loading patches…</p>}
        {!listQuery.isLoading && !listQuery.isError && patches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No patch reports have been built yet.</p>
        ) : (
          <PatchCatchUpView
            since={since}
            listedVersions={listedVersions}
            sourceUrls={sourceUrls}
            fromMemory={locationState.fromMemory === true}
            onBaselineChange={onBaselineChange}
            onForget={onForget}
            focusRequest={catchUpFocusRequest}
          />
        )}
      </div>
    );
  }

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
        viewSwitch={viewSwitch}
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
        <PatchHubSection key={section.anchor} section={section} slots={slots} />
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
