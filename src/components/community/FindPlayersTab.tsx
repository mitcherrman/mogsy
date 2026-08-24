// ---------------------------------------------------------------------------
// COM1-2 — Find Players. The product's only stranger-discovery surface.
//
// The drawer's original "Find" tab was removed on the correct grounds that it
// could not work: it searched `public_profiles`, a `security_invoker` view over
// owner-only RLS, so it returned an empty list for every query. This tab is not
// that tab restored — it searches `public.search_league_profiles`, a SECURITY
// DEFINER RPC over the AUTH3 normalised username, and `public.profiles` RLS is
// unchanged and still owner-only.
//
// WHAT THE SERVER DECIDES, NOT THIS FILE
//   * which profiles exist for this viewer (self, bots, disabled profiles and
//     profiles that blocked the viewer are absent),
//   * the relationship on every row,
//   * the row cap.
//
// So there is no client-side filtering here, and no second round trip per
// result to learn which button to draw.
//
// NO OPTIMISTIC SUCCESS. A mutation's own `SocialResult` decides whether
// anything happened, and the row's new state comes from re-running the search
// against the server — never from assuming the write landed.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, UserPlus, UserRoundSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/UserAvatar";
import {
  SEARCH_DEBOUNCE_MS,
  isSearchable,
  searchPlayers,
  MIN_SEARCH_LENGTH,
  type PlayerSearchResult,
} from "@/lib/community/discovery";
import { presentRelationship } from "@/lib/community/relationship";
import type { SocialResult } from "@/lib/community/social-result";

interface Props {
  /** `useFriends().sendRequest` — reused, not reimplemented. */
  onAddFriend: (targetProfileId: string) => Promise<SocialResult>;
  /** `useFriends().acceptRequest`. */
  onAcceptRequest: (friendshipId: string) => Promise<SocialResult>;
  /** `useBlocks().unblockUser`. */
  onUnblock: (targetProfileId: string) => Promise<SocialResult>;
  /** Opens the existing public profile. This phase does not redesign it. */
  onOpenProfile: (profileId: string) => void;
  /** Debounce override for tests. */
  debounceMs?: number;
}

export default function FindPlayersTab({
  onAddFriend,
  onAcceptRequest,
  onUnblock,
  onOpenProfile,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Monotonic request id. A slow early query must never overwrite the results
  // of a later one — with a per-keystroke debounce that reordering is not
  // hypothetical, it is what happens on a bad connection.
  const runId = useRef(0);

  const run = useCallback(async (raw: string) => {
    const mine = ++runId.current;
    if (!isSearchable(raw)) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      setError(null);
      return;
    }
    setSearching(true);
    const outcome = await searchPlayers(raw);
    if (mine !== runId.current) return;
    setResults(outcome.results);
    setSearched(outcome.searched);
    setError(outcome.error ?? null);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run(query), debounceMs);
    return () => clearTimeout(t);
  }, [query, debounceMs, run]);

  /**
   * Every action follows the same shape: run the mutation, report only what the
   * result says, then re-read from the server so the row's relationship comes
   * from the database rather than from an assumption about what we just did.
   */
  const act = async (
    id: string,
    mutate: () => Promise<SocialResult>,
    successMessage?: string,
  ) => {
    setBusyId(id);
    const result = await mutate();
    setBusyId(null);
    if (!result.ok) {
      if (result.error) toast.error(result.error);
      // A refused write still means the local view may be stale.
      await run(query);
      return;
    }
    if (successMessage) toast.success(successMessage);
    await run(query);
  };

  const showEmpty = searched && !searching && !error && results.length === 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username…"
          aria-label="Search players by username"
          data-testid="find-players-input"
          autoComplete="off"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {error && (
        <p
          role="alert"
          data-testid="find-players-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {searching && (
        <p
          className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
          data-testid="find-players-loading"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Searching…
        </p>
      )}

      {!searched && !searching && !error && (
        <div className="py-8 text-center" data-testid="find-players-hint">
          <UserRoundSearch className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Type at least {MIN_SEARCH_LENGTH} characters to find a player by username.
          </p>
        </div>
      )}

      {showEmpty && (
        <div className="py-8 text-center" data-testid="find-players-empty">
          <p className="text-sm text-muted-foreground">No players found.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2" data-testid="find-players-results">
          {results.map((p) => (
            <ResultRow
              key={p.id}
              player={p}
              busy={busyId === p.id}
              onOpenProfile={onOpenProfile}
              onAdd={() =>
                act(p.id, () => onAddFriend(p.id), "Friend request sent")
              }
              onAccept={() =>
                p.friendshipId
                  ? act(p.id, () => onAcceptRequest(p.friendshipId as string))
                  : Promise.resolve()
              }
              onUnblock={() =>
                act(p.id, () => onUnblock(p.id), "User unblocked")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  player,
  busy,
  onOpenProfile,
  onAdd,
  onAccept,
  onUnblock,
}: {
  player: PlayerSearchResult;
  busy: boolean;
  onOpenProfile: (id: string) => void;
  onAdd: () => void | Promise<void>;
  onAccept: () => void | Promise<void>;
  onUnblock: () => void | Promise<void>;
}) {
  const name = player.displayName || "User";
  const { action, label, passive } = presentRelationship(player.relationship);

  const handler =
    action === "add" ? onAdd : action === "accept" ? onAccept : action === "unblock" ? onUnblock : null;

  return (
    <div
      data-testid={`find-player-${player.id}`}
      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
    >
      <button
        type="button"
        onClick={() => onOpenProfile(player.id)}
        data-testid={`find-player-open-${player.id}`}
        className="flex min-w-0 items-center gap-2.5 text-left"
      >
        <UserAvatar src={player.avatarUrl} name={name} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          {player.isPro && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary">Pro</span>
          )}
        </span>
      </button>

      {/* The relationship the SERVER reported decides this control. A passive
          state renders as text, not as a disabled button, so "Requested" and
          "Friends" never read as an offer that happens to be greyed out. */}
      {passive ? (
        <span
          className="flex-shrink-0 text-xs text-muted-foreground"
          data-testid={`find-player-state-${player.id}`}
        >
          {label}
        </span>
      ) : (
        <Button
          size="sm"
          variant={action === "unblock" ? "outline" : "default"}
          className="h-8 flex-shrink-0 gap-1.5 px-3 text-xs"
          disabled={busy}
          data-testid={`find-player-action-${player.id}`}
          onClick={() => void handler?.()}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : action === "add" ? (
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
          ) : null}
          {label}
        </Button>
      )}
    </div>
  );
}
