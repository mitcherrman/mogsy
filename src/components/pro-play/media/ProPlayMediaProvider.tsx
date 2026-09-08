// ---------------------------------------------------------------------------
// One media request per screen, shared by every slot on it.
//
// WHY A PROVIDER AND NOT A HOOK PER SLOT. A dossier draws two crests, up to ten
// portraits and two more crests in the summary plates. Resolving each one on
// its own would be fourteen requests to answer one page, and — worse — the
// slots would light up at different moments, which reads as a broken layout
// rather than a loading one. The provider collects the keys the page already
// knows, asks once, and every slot reads the same answer.
//
// THE SLOTS STAY DUMB. `TeamCrest` and `PlayerPortrait` do not fetch, do not
// know this file exists when no provider is mounted, and render exactly the
// frame they rendered before. Dropping media in changed the picture and
// nothing else, which is what DossierMedia's own header promised.
//
// NO REACT-QUERY, DELIBERATELY. This provider is meant to be droppable into any
// surface that draws an esports entity — a search row, a profile header, the
// LIVE1 scoreboard — and `useQuery` throws outright when no QueryClient is
// above it. A media layer that can crash a page it was added to is worse than
// no media layer, and the existing Matchup Explorer tests render the page with
// no client at all. So the fetch is a plain effect over a module-level cache:
// same de-duplication and same session-lifetime reuse, no ambient requirement.
// ---------------------------------------------------------------------------

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchProPlayMedia,
  indexMedia,
  mediaKey,
  mediaSrc,
  type EntityMedia,
  type MediaBatch,
} from "@/lib/pro-play/mediaApi";

interface MediaContextValue {
  entry: (entityType: "team" | "player", entityKey: string) => EntityMedia | undefined;
  src: (entityType: "team" | "player", entityKey: string) => string | null;
  /** False when the backend could not verify identities at all. Surfaces are
   *  free to ignore it; it exists so a screen of monograms is diagnosable. */
  identityAvailable: boolean;
}

const EMPTY: MediaContextValue = {
  entry: () => undefined,
  src: () => null,
  identityAvailable: true,
};

const ProPlayMediaContext = createContext<MediaContextValue>(EMPTY);

/** Session-lifetime cache, keyed by the exact request. Crests and portraits
 *  change when a team rebrands or a season turns, never inside one visit, so a
 *  screen revisited costs nothing and the entry is never invalidated. */
const CACHE = new Map<string, MediaBatch | null>();
const INFLIGHT = new Map<string, Promise<MediaBatch | null>>();

function load(cacheKey: string, teams: string[], players: string[]) {
  const cached = CACHE.get(cacheKey);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = INFLIGHT.get(cacheKey);
  if (existing) return existing;
  const request = fetchProPlayMedia({ teams, players })
    .then((batch) => {
      // A null (network failure, 5xx) is NOT cached: every slot falls back for
      // this render, and the next screen that needs these keys tries again.
      if (batch) CACHE.set(cacheKey, batch);
      return batch;
    })
    .finally(() => INFLIGHT.delete(cacheKey));
  INFLIGHT.set(cacheKey, request);
  return request;
}

/** Test seam: drop every cached batch. */
export function __resetProPlayMediaCache() {
  CACHE.clear();
  INFLIGHT.clear();
}

export function ProPlayMediaProvider({
  teams = [],
  players = [],
  children,
}: {
  teams?: (string | null | undefined)[];
  players?: (string | null | undefined)[];
  children: ReactNode;
}) {
  // Sorted and de-duplicated so a re-render that reorders the same entities
  // does not become a new query key and a second request.
  const teamKeys = useMemo(
    () => [...new Set(teams.filter((k): k is string => Boolean(k)))].sort(),
    [teams],
  );
  const playerKeys = useMemo(
    () => [...new Set(players.filter((k): k is string => Boolean(k)))].sort(),
    [players],
  );

  const cacheKey = `${teamKeys.join("\u001f")}|${playerKeys.join("\u001f")}`;
  const [data, setData] = useState<MediaBatch | null>(
    () => CACHE.get(cacheKey) ?? null,
  );

  useEffect(() => {
    if (!teamKeys.length && !playerKeys.length) {
      setData(null);
      return;
    }
    let live = true;
    // A cache hit still lands through setState so the first paint of a
    // revisited screen is a single render, not a flash of monograms.
    load(cacheKey, teamKeys, playerKeys).then((batch) => {
      if (live) setData(batch);
    });
    return () => {
      live = false;
    };
  }, [cacheKey, teamKeys, playerKeys]);

  const value = useMemo<MediaContextValue>(() => {
    const index = indexMedia(data);
    return {
      entry: (entityType, entityKey) => index.get(mediaKey(entityType, entityKey)),
      src: (entityType, entityKey) => mediaSrc(index.get(mediaKey(entityType, entityKey))),
      identityAvailable: data?.identity_available ?? true,
    };
  }, [data]);

  return (
    <ProPlayMediaContext.Provider value={value}>{children}</ProPlayMediaContext.Provider>
  );
}

/** Media for one entity. Returns null art outside a provider — by design, so a
 *  component can be rendered in isolation (or in a test) without one. */
export function useEntityMedia(
  entityType: "team" | "player",
  entityKey?: string | null,
) {
  const context = useContext(ProPlayMediaContext);
  if (!entityKey) return { src: null as string | null, entry: undefined };
  return { src: context.src(entityType, entityKey), entry: context.entry(entityType, entityKey) };
}

export function useProPlayMediaAvailability() {
  return useContext(ProPlayMediaContext).identityAvailable;
}
