import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { usePatchCatchUpLoader } from "@/hooks/usePatchCatchUpLoader";
import type { CatchUpLoader } from "@/lib/patch-catchup-loader";
import { cn } from "@/lib/utils";
import { PatchCatchUpControls } from "./PatchCatchUpControls";
import { PatchCatchUpCoverageNotice } from "./PatchCatchUpCoverageNotice";
import { CatchUpRenderContextProvider, type CatchUpRenderContext } from "./render-context";
import { PatchCatchUpSection } from "./PatchCatchUpSection";
import {
  buildCatchUpViewModel,
  coverageNotices,
  rangeText,
  searchCatchUp,
  type CatchUpViewModel,
} from "./presentation";
import { patchReportHref, reportSearch } from "./route";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60";

export type PatchCatchUpViewProps = {
  /** Baseline from the URL (`?since=`), EXCLUDED; null = none chosen yet. */
  since: string | null;
  /** The page's own patch index (newest first); no extra request. */
  listedVersions: string[];
  /** Riot source link per patch, from the same index. */
  sourceUrls: ReadonlyMap<string, string>;
  /** The current baseline came from the remembered preference. */
  fromMemory: boolean;
  onBaselineChange: (version: string) => void;
  onForget: () => void;
  /** Increments when the reader switched into Catch Up: move focus. */
  focusRequest: number;
};

function failureCopy(loader: CatchUpLoader, since: string | null): { title: string; body: string | null } {
  if (loader.state.status !== "failed") return { title: "", body: null };
  const { failure } = loader.state;
  switch (failure.code) {
    case "index_failed":
    case "index_malformed":
      return { title: "Couldn't load the patch list.", body: null };
    case "reports_unavailable": {
      const v = failure.versions;
      const span = v.length > 1 ? `${v[0]} – ${v[v.length - 1]}` : (v[0] ?? "");
      return {
        title: `Couldn't load ${v.length === 1 ? "patch" : "patches"} ${span}.`,
        body: "This isn't “nothing changed” — the reports didn't arrive.",
      };
    }
    case "range_invalid":
      if (failure.detail === "since_after_through") {
        return { title: `${since} is newer than the latest patch report.`, body: "Pick a patch above." };
      }
      if (failure.detail === "no_listed_patches") {
        return { title: "No patch reports have been built yet.", body: null };
      }
      return { title: `Mogzy doesn't have a report called “${since ?? ""}”.`, body: "Pick a patch above." };
    case "domain_error":
    default:
      return { title: "Something went wrong building this catch-up.", body: null };
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Catch Up ("what changed after patch X?"), PH3-D. Mounted only in Catch Up
 * mode, so ordinary Patch Report rendering never mounts the loader.
 *
 * Two layers stay apart: every Riot line that loaded is rendered (layer 1,
 * `report.entities[].riotLines`); Mogzy notes are decoration on the final step
 * of a PH3-B chain (layer 2) and disappear whenever continuity is withheld.
 */
export const PatchCatchUpView = ({
  since,
  listedVersions,
  sourceUrls,
  fromMemory,
  onBaselineChange,
  onForget,
  focusRequest,
}: PatchCatchUpViewProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const loader = usePatchCatchUpLoader({ sincePatch: since, enabled: true });
  const { report, state } = loader;

  const model: CatchUpViewModel | null = useMemo(() => (report ? buildCatchUpViewModel(report) : null), [report]);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(() => (model ? searchCatchUp(model, deferredQuery) : null), [model, deferredQuery]);

  // Disclosure state: reader toggles without search, and separately while a
  // search is active (reset per query), so clearing search restores the
  // default collapse state.
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [searchToggles, setSearchToggles] = useState<{ query: string; open: Record<string, boolean> }>({
    query: "",
    open: {},
  });
  const [everOpened, setEverOpened] = useState<Record<string, boolean>>({});
  const searchOpen = searchToggles.query === deferredQuery ? searchToggles.open : {};

  // A `#cu-…` hash (Back from a Patch Report) opens the section that holds it.
  const hashId = location.hash.startsWith("#cu-") ? safeDecode(location.hash.slice(1)) : null;
  const hashSectionKey = useMemo(() => {
    if (!model || !hashId) return null;
    for (const section of model.sections) {
      if (section.id === hashId || section.entries.some((e) => hashId === e.id || hashId.startsWith(`${e.id}--`))) {
        return section.key;
      }
    }
    return null;
  }, [model, hashId]);

  const isOpen = (key: string, defaultCollapsed: boolean): boolean => {
    if (!defaultCollapsed) return true;
    if (result?.active) return searchOpen[key] ?? true;
    return toggles[key] ?? key === hashSectionKey;
  };

  const onToggle = useCallback(
    (key: string, open: boolean) => {
      if (open) setEverOpened((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      if (result?.active) {
        setSearchToggles((prev) => ({
          query: deferredQuery,
          open: { ...(prev.query === deferredQuery ? prev.open : {}), [key]: open },
        }));
      } else {
        setToggles((prev) => ({ ...prev, [key]: open }));
      }
    },
    [result?.active, deferredQuery],
  );

  // Scroll to a `#cu-` target once the content holding it is rendered.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!model || !hashId) return;
    const token = `${location.key}${location.hash}`;
    if (scrolledFor.current === token) return;
    const el = document.getElementById(hashId);
    if (!el) return;
    scrolledFor.current = token;
    el.scrollIntoView?.();
  }, [model, hashId, hashSectionKey, location.key, location.hash]);

  // Focus after the reader switched INTO Catch Up (not on refresh or Back).
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (focusRequest === 0) return;
    (since ? headingRef.current : selectRef.current)?.focus();
    // Only a new request moves focus; a baseline change keeps it on the select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  // Leaving for a canonical Patch Report: first record where the reader was
  // (replace with `#cu-<entry>`), then the link itself pushes the report, so
  // browser Back returns here scrolled to the same entry.
  const onLeaveToReport = useCallback(
    (entryId: string, e: MouseEvent<HTMLAnchorElement>) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      navigate({ search: location.search, hash: entryId }, { replace: true, state: location.state });
    },
    [navigate, location.search, location.state],
  );

  const renderContext = useMemo<CatchUpRenderContext | null>(
    () =>
      report
        ? {
            chainByLine: model?.chainByLine ?? new Map(),
            wording: {
              sincePatch: report.sincePatch,
              clampedToCoverageFloor: report.range.clampedToCoverageFloor,
            },
            onLeaveToReport,
          }
        : null,
    [report, model, onLeaveToReport],
  );

  const failed = state.status === "failed";
  const invalidBaseline = failed && state.failure.code === "range_invalid";
  const through = loader.range?.throughPatch ?? null;
  const upToDate = report?.range.status === "up_to_date";
  const first = report?.includedPatches[0] ?? loader.requiredVersions[0] ?? null;
  const rangeLine = upToDate ? null : rangeText(first, through);
  const totals =
    report && !upToDate
      ? `${plural(report.totals.riotLines, "change", "changes")} · ${plural(report.totals.entities, "entry", "entries")} · ${plural(report.includedPatches.length, "patch", "patches")}`
      : null;
  const notices = report ? coverageNotices(loader, report) : [];

  let announcement = "";
  if (state.status === "loading_index") announcement = "Loading patches…";
  else if (state.status === "loading_reports") announcement = `Loading ${state.settled} of ${state.total} patches…`;
  else if (report && result && !upToDate) {
    announcement = result.active
      ? `${plural(result.entryCount, "entry matches", "entries match")}`
      : `Showing ${plural(report.totals.riotLines, "change", "changes")} in ${plural(report.totals.entities, "entry", "entries")} across ${plural(report.includedPatches.length, "patch", "patches")}`;
  }

  const loading = state.status === "loading_index" || state.status === "loading_reports";
  const failure = failureCopy(loader, since);
  const visibleSections = result?.sections ?? [];

  return (
    <div data-testid="patch-catchup-view">
      <PatchCatchUpControls
        ref={headingRef}
        selectRef={selectRef}
        listedVersions={listedVersions}
        since={since}
        sinceSelectable={!invalidBaseline}
        rangeLine={rangeLine}
        totals={totals}
        fromMemory={fromMemory}
        onChange={onBaselineChange}
        onForget={onForget}
      />

      <p aria-live="polite" className="sr-only" data-testid="catchup-announcement">
        {announcement}
      </p>

      <div aria-busy={loading} data-testid="catchup-results">
        {loading && (
          <div data-testid="catchup-loading">
            <p className="text-sm text-muted-foreground">
              {state.status === "loading_reports"
                ? `Loading ${state.settled} of ${state.total} patches…`
                : "Loading patches…"}
            </p>
            <div aria-hidden className="mt-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl border border-border bg-card/40 motion-safe:animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {failed && (
          <div
            role="alert"
            data-testid="catchup-failure"
            data-code={state.failure.code}
            className="rounded-lg border border-border bg-card/60 px-3 py-3 text-sm"
          >
            <p className="font-semibold [overflow-wrap:anywhere]">{failure.title}</p>
            {failure.body && <p className="mt-0.5 text-muted-foreground">{failure.body}</p>}
            <div className="mt-2 flex flex-wrap gap-3">
              {loader.canRetry && (
                <button
                  type="button"
                  onClick={loader.retry}
                  className={cn(
                    "min-h-9 rounded-md border border-[#c9a84c]/60 px-3 font-semibold text-[#d8bd70] hover:bg-[#c9a84c]/10",
                    FOCUS,
                  )}
                >
                  Retry
                </button>
              )}
              {state.failure.code === "domain_error" && (
                <Link to="/lol/patch-reports" className={cn("min-h-9 underline hover:text-[#c9a84c]", FOCUS)}>
                  Open Patch Report
                </Link>
              )}
            </div>
          </div>
        )}

        {report && upToDate && (
          <div data-testid="catchup-up-to-date" className="rounded-lg border border-border bg-card/60 px-3 py-3 text-sm">
            <p className="font-semibold">No later patches are available yet.</p>
            <p className="mt-0.5 text-muted-foreground">
              {report.throughPatch} is the newest patch report.{" "}
              <Link
                to={`/lol/patch-reports${reportSearch(report.throughPatch)}`}
                className={cn("rounded underline hover:text-[#c9a84c]", FOCUS)}
              >
                Open Patch Report {report.throughPatch}
              </Link>
            </p>
          </div>
        )}

        {report && model && result && renderContext && !upToDate && (
          <CatchUpRenderContextProvider.Provider value={renderContext}>
            <PatchCatchUpCoverageNotice
              notices={notices}
              canRetry={loader.canRetry}
              retrying={loader.retrying}
              onRetry={loader.retry}
            />

            {report.includedPatches.length === 1 && (
              <p className="mb-4 text-sm text-muted-foreground">
                This is patch {report.includedPatches[0]} grouped by entry. Open the Patch Report for Riot&apos;s full
                layout and Mogzy&apos;s per-change data.
              </p>
            )}

            <div className="mb-5 flex flex-col gap-3">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search champions, items, abilities…"
                aria-label="Search this catch-up"
                data-testid="catchup-search"
                className={cn(
                  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:border-[#c9a84c] sm:max-w-xs",
                  FOCUS,
                )}
              />
              {visibleSections.length > 0 && (
                <nav
                  aria-label="Catch Up sections"
                  data-testid="catchup-section-nav"
                  className="rounded-lg border border-border bg-card/60 px-3 py-2"
                >
                  <ul className="flex flex-wrap gap-x-5 gap-y-2">
                    {visibleSections.map((section) => (
                      <li key={section.key} className="min-w-0">
                        <a
                          href={`#${section.id}`}
                          className={cn("text-sm font-semibold hover:text-[#c9a84c]", FOCUS)}
                        >
                          {section.title}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">{section.entries.length}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>

            <div className="mx-auto w-full max-w-4xl">
              {result.active && result.entryCount === 0 && (
                <div data-testid="catchup-no-matches" className="mb-6 text-sm text-muted-foreground">
                  <p>No Catch-Up changes match your search.</p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className={cn("mt-1 rounded underline hover:text-[#c9a84c]", FOCUS)}
                  >
                    Clear search
                  </button>
                </div>
              )}

              {visibleSections.map((section) => {
                const open = isOpen(section.key, section.defaultCollapsed);
                return (
                  <PatchCatchUpSection
                    key={section.key}
                    section={section}
                    entries={section.entries}
                    open={open}
                    rendered={open || Boolean(everOpened[section.key])}
                    onToggle={onToggle}
                    aside={
                      section.key === "patch-champions" && model.crossReferences.length > 0 ? (
                        <p className="text-sm text-muted-foreground" data-testid="catchup-cross-reference">
                          Some changes apply to many champions at once and are listed by Riot under{" "}
                          {model.crossReferences.map((ref, i) => (
                            <span key={ref.key}>
                              {i > 0 && (i === model.crossReferences.length - 1 ? " and " : ", ")}
                              <a href={`#${ref.id}`} className={cn("rounded underline hover:text-[#c9a84c]", FOCUS)}>
                                {ref.title}
                              </a>
                            </span>
                          ))}
                          .
                        </p>
                      ) : undefined
                    }
                  />
                );
              })}

              {!result.active && model.otherAnnouncements.length > 0 && (
                <section aria-labelledby="cu-other-heading" id="cu-other" className="mb-10 scroll-mt-24">
                  <h3 id="cu-other-heading" className="mb-3 border-b border-[#c9a84c]/25 pb-2 text-xl font-bold">
                    Other announcements
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {model.otherAnnouncements.map((card) => (
                      <li key={`${card.patch}#${card.cardIndex}`} className="[overflow-wrap:anywhere]">
                        {card.entityName} · {card.patch} —{" "}
                        <Link
                          to={patchReportHref(card.patch, `s-${card.sectionKey}`)}
                          onClick={(e) => onLeaveToReport("cu-other", e)}
                          className={cn("rounded underline hover:text-[#c9a84c]", FOCUS)}
                        >
                          View in Patch {card.patch}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
              <p className="flex flex-wrap gap-x-2 gap-y-1">
                <span>Riot patch notes:</span>
                {report.includedPatches.map((patch) => {
                  const url = sourceUrls.get(patch);
                  return url ? (
                    <a
                      key={patch}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn("rounded underline hover:text-[#c9a84c]", FOCUS)}
                    >
                      {patch}
                    </a>
                  ) : (
                    <span key={patch}>{patch}</span>
                  );
                })}
              </p>
              <details className="group mt-2">
                <summary
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer select-none list-none items-center gap-1 rounded py-1 pr-1 hover:text-foreground",
                    FOCUS,
                    "[&::-webkit-details-marker]:hidden",
                  )}
                >
                  <ChevronRight
                    aria-hidden
                    className="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none [details[open]_&]:rotate-90"
                  />
                  About Mogzy notes
                </summary>
                <p className="ml-4 max-w-prose border-l border-border pl-3 leading-relaxed">
                  Every change above is Riot&apos;s, as published. A Mogzy note appears only where Mogzy can prove the
                  same Riot value changed in more than one patch of this range, and it states the value only. No note
                  does not mean no trend: it means Mogzy has no safe claim to make. Some changes reach champions
                  through other sections (for example Systems), so an entry is not always the whole story.
                </p>
              </details>
            </footer>
          </CatchUpRenderContextProvider.Provider>
        )}
      </div>
    </div>
  );
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
