// ---------------------------------------------------------------------------
// /lol/pro-play/search — the global Pro Play research entry point.
//
// GLOBAL. There is no Worlds filter here, deliberately: the focus set is a
// marker on a team row, never a fence around what a reader may look up.
//
// AMBIGUITY IS SHOWN, NOT RESOLVED. When the backend reports `ambiguous` this
// page renders the tied candidates FIRST, as a choice, above the ranked list.
// It never picks one and navigates. The candidates come from
// `ambiguity.candidates`, which carries every tied entity regardless of the
// result limit — so a truncated list cannot hide one of the options.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  EmptyRow,
  ErrorBlock,
  LoadingBlock,
  Note,
  Panel,
  ResearchBreadcrumb,
  ResearchPage,
} from "@/components/pro-play/ResearchShell";
import { TeamCrest } from "@/components/pro-play/media/EntityCrest";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import {
  decodeRegistryText,
  formatDate,
  profilePath,
  searchEntities,
  type EntityKind,
  type SearchResponse,
  type SearchResult,
} from "@/lib/pro-play/researchApi";

const KIND_LABEL: Record<EntityKind, string> = {
  player: "Player",
  team: "Team",
  champion: "Champion",
};

const EXAMPLES = ["Faker", "Chovy", "T1", "Gen.G", "Azir", "Faker Azir", "IG"];

function ResultRow({ result }: { result: SearchResult }) {
  // A crest is an identity cue in a list whose job is the NAME, so it is small
  // and it leads the row. Champions keep the existing text-only row: champion
  // art has its own authority and pulling it in here would be a second media
  // system, which this workstream exists to avoid.
  const context: string[] = [];
  if (result.primary_role) context.push(result.primary_role);
  if (result.region) context.push(result.region);
  // Registry names carry raw HTML entities; decode for display only.
  if (result.real_name) context.push(decodeRegistryText(String(result.real_name)));
  if (result.declared_current_team) context.push(String(result.declared_current_team));
  if (result.is_disbanded) context.push("disbanded");
  if (result.is_retired) context.push("retired");

  return (
    <li className="border-b border-border/50 last:border-0" data-testid="search-result">
      <Link
        to={profilePath(result.kind, result.key)}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 py-2.5 hover:bg-muted/40"
      >
        {result.kind === "team" ? (
          <TeamCrest
            teamKey={result.key}
            name={result.display_name}
            shortCode={result.short ?? null}
            size="sm"
            className="self-center"
          />
        ) : null}
        <Badge variant="outline" className="text-[10px] uppercase">
          {KIND_LABEL[result.kind]}
        </Badge>
        <span className="font-medium">{result.display_name}</span>
        {result.key !== result.display_name ? (
          <span className="text-xs text-muted-foreground">{result.key}</span>
        ) : null}
        {context.length ? (
          <span className="text-xs text-muted-foreground">{context.join(" · ")}</span>
        ) : null}
        {result.worlds_focus?.in_focus_set ? (
          <Badge variant="secondary" className="text-[10px]">
            Worlds watchlist
          </Badge>
        ) : null}
        <span className="ml-auto flex items-baseline gap-3 text-xs tabular-nums text-muted-foreground">
          {/* Zero is a real answer, not a missing value: a registry page with
              no professional games has no profile to open. Say so. */}
          <span>{result.has_pro_play_facts ? `${result.games} pro games` : "no pro games"}</span>
          <span>{formatDate(result.last_played_at)}</span>
        </span>
      </Link>
    </li>
  );
}

function Disambiguation({ data }: { data: SearchResponse }) {
  const candidates = data.ambiguity.candidates ?? [];
  if (data.ambiguity.state !== "ambiguous" || !candidates.length) return null;
  return (
    <Panel
      title={`"${data.query}" matches ${data.ambiguity.tied_candidates} entities`}
      note={data.ambiguity.reason}
    >
      <p className="mb-3 text-sm text-muted-foreground" data-testid="disambiguation-prompt">
        Pick the one you mean. Mogzy does not choose between them, because the
        evidence for each is equally strong.
      </p>
      <ul data-testid="disambiguation-list">
        {candidates.map((c) => (
          <ResultRow key={`${c.kind}:${c.key}`} result={c} />
        ))}
      </ul>
    </Panel>
  );
}

function InterpretationHint({ data }: { data: SearchResponse }) {
  const i = data.interpretation;
  if (!i) return null;
  const to = profilePath(i.subject.kind, i.subject.key);
  return (
    <Panel title="Did you mean">
      <Link to={to} className="text-sm hover:underline" data-testid="interpretation-hint">
        <span className="font-medium">{i.subject.display_name}</span>
        {i.champion_key ? <span className="text-muted-foreground"> on {i.champion_key}</span> : null}
        {i.scope_id ? <span className="text-muted-foreground"> — {i.scope_id}</span> : null}
      </Link>
      <Note>
        Read as one entity plus a champion or a scope. Opens the entity's
        profile, where that champion or scope is one row.
      </Note>
    </Panel>
  );
}

function SearchBody() {
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    abort.current?.abort();
    if (q.trim().length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError(null);
    try {
      setData(await searchEntities(q, { limit: 25 }, controller.signal));
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError((err as Error).message || "Search failed");
      setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Debounced so a keystroke is not a request, and the URL carries the query
  // so a result set is linkable.
  useEffect(() => {
    const id = window.setTimeout(() => {
      run(query);
      setParams(query ? { q: query } : {}, { replace: true });
    }, 250);
    return () => window.clearTimeout(id);
  }, [query, run, setParams]);

  useEffect(() => () => abort.current?.abort(), []);

  // Every team key on screen, in ONE request — the ranked list plus any
  // disambiguation candidates, which are the same rows rendered twice.
  const teamKeys = useMemo(() => {
    const keys = [
      ...(data?.results ?? []),
      ...(data?.ambiguity.candidates ?? []),
    ]
      .filter((r) => r.kind === "team")
      .map((r) => r.key);
    return [...new Set(keys)];
  }, [data]);

  return (
    <ResearchPage>
      <ProPlayMediaProvider teams={teamKeys}>
      <ResearchBreadcrumb trail={[{ label: "Search" }]} />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight md:text-3xl">
        Pro Play research
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Search any professional player, team or champion in the canonical Pro
        Play corpus. Not restricted to Worlds teams.
      </p>

      <div className="relative mb-4">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Faker, T1, Azir…"
          className="pl-9"
          autoFocus
          aria-label="Search players, teams and champions"
          data-testid="research-search-input"
        />
      </div>

      <div className="mb-6 flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setQuery(e)}
            className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {e}
          </button>
        ))}
      </div>

      {loading && !data ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error} /> : null}

      {data ? (
        <>
          <Disambiguation data={data} />
          <InterpretationHint data={data} />
          <Panel
            title={
              data.total_matches
                ? `${data.total_matches} match${data.total_matches === 1 ? "" : "es"}`
                : "Results"
            }
            note={
              data.registry_available
                ? undefined
                : "The roster identity registry is unavailable, so aliases, real names, roles and regions are missing. Entities with canonical games are still searchable by their page id."
            }
          >
            {data.results.length ? (
              <ul data-testid="search-results">
                {data.results.map((r) => (
                  <ResultRow key={`${r.kind}:${r.key}`} result={r} />
                ))}
              </ul>
            ) : (
              <EmptyRow label={`Nothing in the Pro Play authority matches "${data.query}".`} />
            )}
            {data.truncated ? (
              <Note>Showing the strongest 25 matches of {data.total_matches}.</Note>
            ) : null}
          </Panel>
        </>
      ) : null}
      </ProPlayMediaProvider>
    </ResearchPage>
  );
}

export default function ProPlaySearch() {
  return (
    <>
      <SEOHead
        title="Pro Play Research — Search | Mogzy"
        description="Search professional League of Legends players, teams and champions across the canonical Pro Play corpus."
        path="/lol/pro-play/search"
      />
      <SearchBody />
    </>
  );
}
