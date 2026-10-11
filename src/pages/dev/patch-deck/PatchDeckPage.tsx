import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { List } from "lucide-react";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import { fetchPatchReport, fetchPatchReports } from "@/lib/patch-reports/api";
import { buildDeckModel, indexOfCard, isEntityCard } from "@/lib/patch-deck/deck";
import { deckSearch, readDeckRoute, type DeckFace } from "@/lib/patch-deck/route";
import { patchReportHref } from "@/components/patch-catchup/route";
import { reportSearch } from "@/components/patch-catchup/route";
import { PatchDeck } from "@/components/patch-deck/PatchDeck";
import "@/components/patch-deck/patch-deck.css";

/**
 * /dev/patch-deck — PHD1 Patch Hub Deck View prototype.
 *
 * A second presentation of the SAME Patch Report the List View shows at
 * /lol/patch-reports: same list and detail queries (shared cache keys), same
 * report structure, same Impact loader. It renders outside the app shell so
 * the stage owns the viewport; production integration (the List/Deck switch)
 * is a later, separately reviewed step.
 */
const PatchDeckPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const route = readDeckRoute(searchParams);

  const listQuery = useQuery({ queryKey: ["patch-reports"], queryFn: fetchPatchReports });
  const listData = listQuery.data;
  const patches = useMemo(() => listData?.patches ?? [], [listData]);
  const versions = useMemo(() => patches.map((p) => p.patch_version), [patches]);
  const version = route.patch ?? patches[0]?.patch_version ?? null;

  const detailQuery = useQuery({
    queryKey: ["patch-report", version],
    queryFn: () => fetchPatchReport(version as string),
    enabled: Boolean(version),
  });
  const detail = detailQuery.data;
  const { data: manifest } = useChampionAssets();

  const model = useMemo(() => (detail ? buildDeckModel(detail) : null), [detail]);
  const index = model ? indexOfCard(model, route.card) : 0;
  const current = model?.cards[index];

  useEffect(() => {
    const name = current && isEntityCard(current) ? `${current.entity.card.entity_name} · ` : "";
    document.title = version ? `${name}Patch ${version} Deck · Mogzy` : "Patch Deck · Mogzy";
  }, [current, version]);

  const setPosition = useCallback(
    (next: { card?: string | null; face?: DeckFace }) => {
      if (!version) return;
      setSearchParams(
        (prev) => {
          const prevRoute = readDeckRoute(prev);
          const card = next.card === undefined ? prevRoute.card : next.card;
          // A new card opens on its overview unless a face was asked for.
          const face = next.face ?? (next.card !== undefined && next.card !== prevRoute.card ? "overview" : prevRoute.face);
          return new URLSearchParams(deckSearch({ patch: version, card, face }));
        },
        { replace: true },
      );
    },
    [version, setSearchParams],
  );

  const onIndex = useCallback(
    (i: number) => {
      if (!model) return;
      setPosition({ card: model.cards[i]?.id ?? null });
    },
    [model, setPosition],
  );
  const onFace = useCallback((face: DeckFace) => setPosition({ face }), [setPosition]);

  const listHref =
    version && current && isEntityCard(current) ? patchReportHref(version, current.id) : `/lol/patch-reports${reportSearch(version)}`;

  return (
    <div className="phd1-deck">
      <header className="dk-top">
        <Link to="/lol/patch-reports" className="dk-wordmark" aria-label="Mogzy Patch Hub">
          MOGZY
          <small>Patch Deck · prototype</small>
        </Link>
        <div className="flex items-center gap-2">
          {patches.length > 0 && (
            <label className="sr-only" htmlFor="deck-patch">
              Patch
            </label>
          )}
          {patches.length > 0 && (
            <select
              id="deck-patch"
              className="dk-select"
              value={version ?? ""}
              onChange={(e) => setSearchParams(new URLSearchParams(deckSearch({ patch: e.target.value })))}
              data-testid="deck-patch-select"
            >
              {patches.map((p) => (
                <option key={p.patch_version} value={p.patch_version}>
                  Patch {p.patch_version}
                </option>
              ))}
            </select>
          )}
          <Link to={listHref} className="dk-toplink" data-testid="deck-list-link">
            <List aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">List View</span>
          </Link>
        </div>
      </header>

      <main>
        {listQuery.isError && (
          <p className="px-6 py-16 text-center text-sm" style={{ color: "var(--dk-nerf)" }} role="alert">
            Could not load patch reports.
          </p>
        )}
        {!listQuery.isLoading && !listQuery.isError && patches.length === 0 && (
          <p className="px-6 py-16 text-center text-sm" style={{ color: "var(--dk-ink-3)" }}>
            No patch reports have been built yet.
          </p>
        )}
        {detailQuery.isError && version && (
          <p className="px-6 py-16 text-center text-sm" style={{ color: "var(--dk-nerf)" }} role="alert">
            Could not load patch {version}.
          </p>
        )}
        {(listQuery.isLoading || (detailQuery.isLoading && version)) && !detail && (
          <div className="dk-stage" aria-busy="true" data-testid="deck-loading">
            <div className="dk-sliver dk-skeleton" aria-hidden />
            <div className="dk-card-slot">
              <div className="dk-card dk-skeleton" style={{ minHeight: 520 }}>
                <p className="sr-only">Loading patch {version ?? ""}…</p>
              </div>
            </div>
            <div className="dk-sliver dk-skeleton" aria-hidden />
          </div>
        )}
        {model && detail && (
          <PatchDeck model={model} detail={detail} manifest={manifest} versions={versions} index={index} face={route.face} onIndex={onIndex} onFace={onFace} />
        )}
      </main>
    </div>
  );
};

export default PatchDeckPage;
