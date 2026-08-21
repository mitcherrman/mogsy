/**
 * PLAY1 — Invite: the Academy roster, on the record.
 *
 * WHAT IS REAL HERE
 * ─────────────────
 * All of it, except the challenge itself. The roster is the account's actual
 * accepted friendships from `useFriends` — the same rows the friends drawer
 * shows, with the same soft-disabled-bot suppression already applied by that
 * hook. The search filters those real rows. The selection is real state. The
 * empty and signed-out cases are the real cases.
 *
 * WHAT IS NOT REAL YET, AND IS SAID SO
 * ────────────────────────────────────
 * There is no Ranked invite backend — no endpoint that creates a match
 * between two named accounts, no invitation row, no channel. That fact has
 * exactly one home, `@/lib/ranked-public/rankedInvite`, and this view asks it
 * rather than assuming. When the gateway reports unavailable, the challenge
 * action is presented and inert, with the reason written beside it as a
 * finished notice, and the action is `aria-describedby` that notice so the
 * refusal is not a visual-only fact.
 *
 * The alternative — letting the button appear to work — was rejected: an
 * invite the server never received is not an invite, and a fake success here
 * would be discovered by two players at once.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ──────────────────────────────────
 * It does not reach for the Stat Check invite rooms. Those are a different
 * game with a different room lifecycle and no Ranked rating; wiring them here
 * would produce an invite that works and then starts the wrong match. See the
 * seam module for the full statement.
 */

import { useMemo, useState } from "react";
import { Check, Search, UserRound, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PlayModePlate from "./PlayModePlate";
import { useFriends, type FriendRow } from "@/hooks/useFriends";
import {
  rankedInviteGateway,
  type RankedInviteAvailability,
} from "@/lib/ranked-public/rankedInvite";
import { PLAY_INK as INK } from "./ink";

const NOTICE_ID = "play-invite-availability";

export default function InvitePlayView({
  signedIn,
  onBack,
  availability = rankedInviteGateway.availability(),
  roster,
}: {
  signedIn: boolean;
  onBack: () => void;
  /** Injectable so the finished-backend path is testable before it exists. */
  availability?: RankedInviteAvailability;
  /**
   * A roster to draw INSTEAD of the account's own.
   *
   * The same seam `availability` is, and for the same reason: a populated
   * roster and a chosen summoner cannot be looked at without an account that
   * already has Academy connections, so those two states were unreviewable —
   * and a state nobody can look at is a state nobody has checked. Supplied
   * only by `/dev/play-scroll`. Undefined in production, where the rows are
   * the account's real accepted friendships and nothing else.
   */
  roster?: FriendRow[];
}) {
  /**
   * The roster is read HERE, not by the scroll's host.
   *
   * This view is mounted only once the player has actually opened Invite,
   * so the Academy roster query fires then and not a moment earlier —
   * opening the match-entry record to queue for Ranked must not also go and
   * read the player's friendships.
   */
  const live = useFriends();
  const friends = roster ?? live.friends;
  const loading = roster === undefined && live.loading;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = friends.filter((row) => row.profile.id);
    if (needle === "") return rows;
    return rows.filter((row) =>
      (row.profile.display_name ?? "").toLowerCase().includes(needle),
    );
  }, [friends, query]);

  const selected = matches.find((row) => row.profile.id === selectedId) ?? null;
  const selectedName = selected?.profile.display_name ?? "this summoner";
  // The reason challenges cannot be sent, or null when they can. Read once
  // here rather than re-asked at three separate JSX sites.
  const unavailableReason = availability.available ? null : availability.reason;

  return (
    /*
     * A column with its OWN scroll boundary, rather than one long block
     * inside the record's.
     *
     * On a short viewport the record is capped at the window's height, and
     * with a single scrolling body the roster pushed the challenge action and
     * the way back off the bottom of the sheet — the two controls the view
     * exists for. The roster is the only part that can grow, so it is the
     * only part that scrolls; the heading above it and the notice and actions
     * below it are pinned to the sheet.
     */
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="play-invite">
      {/* THE INVITE CARD, EXPANDED — and it keeps the card's own LAYOUT, not
          just its picture: the same miniature at the left, the same eyebrow
          over the same title beside it. Pressing the clause promotes it to
          the head of the view it opened, which is what makes this read as
          that entry unfolding rather than as a different screen.

          The card's descriptive line is NOT repeated here. The player just
          read it and pressed it; restating it costs a third of the sheet's
          vertical room, and that room is the roster's. When it was centred
          under a full-size plate the register below it was squeezed to 18px
          on a 720-tall window — the one thing this view exists to show. */}
      <div className="play-invite-head shrink-0">
        <PlayModePlate mode="invite" size="notice" />
        <div className="min-w-0">
          <p
            className="text-[9.5px] font-bold uppercase tracking-[0.26em]"
            style={{ color: INK.faint }}
          >
            Your roster
          </p>
          <h3
            className="mt-0.5 text-[18px] font-black leading-tight sm:text-[20px]"
            style={{ color: INK.strong, textShadow: INK.press }}
          >
            Invite
          </h3>
        </div>
      </div>

      {/* The register. A ruled panel with its own boundary, so the roster
          reads as a bound page of the record rather than as loose rows
          floating on the sheet — which is what made the empty case look like
          a rendering failure rather than an honest "nobody here yet". */}
      <div className="play-invite-register min-h-0 flex-1 overflow-y-auto">
      {!signedIn ? (
        <Empty
          testId="play-invite-signed-out"
          icon={<UserRound className="h-5 w-5" aria-hidden="true" />}
          text="Your roster is sealed."
          hint="Sign in to see your connections."
        />
      ) : loading ? (
        <p
          data-testid="play-invite-loading"
          className="py-4 text-center text-[12px] font-semibold"
          style={{ color: INK.faint }}
        >
          Reading your roster…
        </p>
      ) : friends.length === 0 ? (
        <Empty
          testId="play-invite-empty"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          text="No summoners on your roster yet."
          hint="Add them from an Academy profile."
        />
      ) : (
        <>
          {/* Search. Present only when there is enough roster for it to do
              something — a filter over three names is furniture. */}
          {friends.length > 5 && (
            <label className="relative block">
              <span className="sr-only">Search your connections</span>
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                style={{ color: INK.faint }}
                aria-hidden="true"
              />
              <input
                type="search"
                data-testid="play-invite-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search connections"
                /* No `focus-visible:ring-2`: Tailwind's ring takes `--ring`,
                   which in this app's theme is a bright blue (210 80% 65%) —
                   a dev-console rectangle on a parchment sheet. The record's
                   own focus treatment is scoped in `index.css` and is the
                   sheet's rubric red. */
                className="play-invite-search"
              />
            </label>
          )}

          <ul
            data-testid="play-invite-roster"
            className="flex flex-col gap-1.5"
            role="listbox"
            aria-label="Your Academy connections"
          >
            {matches.length === 0 ? (
              <li
                data-testid="play-invite-no-matches"
                className="py-3 text-center text-[12px] font-semibold"
                style={{ color: INK.faint }}
              >
                No connection matches “{query.trim()}”.
              </li>
            ) : (
              matches.map((row) => {
                const id = row.profile.id;
                const name = row.profile.display_name ?? "Unknown summoner";
                const chosen = id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={chosen}
                      data-testid={`play-invite-friend-${id}`}
                      onClick={() => setSelectedId(chosen ? null : id)}
                      className="play-scroll-clause flex min-h-[44px] w-full items-center gap-2.5 py-1.5 pl-3 pr-2.5"
                      data-emphasis={chosen ? "true" : undefined}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={row.profile.avatar_url ?? undefined} alt="" />
                        <AvatarFallback
                          className="text-[10px] font-bold"
                          style={{ background: INK.inset, color: INK.strong }}
                        >
                          {name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className="min-w-0 flex-1 truncate text-left text-[13px] font-bold"
                        style={{ color: INK.strong }}
                      >
                        {name}
                      </span>
                      {chosen && (
                        <span className="play-invite-chosen shrink-0">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Chosen
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      )}
      </div>

      {/* The challenge, and the truth about it. The notice is written whether
          or not a summoner is chosen, so the state of the feature is never
          something the player discovers only by trying. */}
      {unavailableReason !== null && (
        <p
          id={NOTICE_ID}
          data-testid="play-invite-availability"
          className="play-invite-notice shrink-0"
          style={{ color: INK.body }}
        >
          {unavailableReason}
        </p>
      )}

      <div className="flex shrink-0 flex-col items-center gap-2">
        <button
          type="button"
          data-testid="play-invite-send"
          disabled={unavailableReason !== null || selected === null}
          aria-describedby={unavailableReason === null ? undefined : NOTICE_ID}
          className="play-scroll-clause flex min-h-[46px] w-full items-center justify-center px-4 text-[12.5px] font-black uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
          data-emphasis="true"
          style={{ color: INK.strong }}
        >
          {selected === null ? "Choose a summoner" : `Challenge ${selectedName}`}
        </button>
        <button
          type="button"
          data-testid="play-invite-back"
          onClick={onBack}
          className="play-scroll-back"
        >
          Back
        </button>
      </div>
    </div>
  );
}

/**
 * The register with nothing in it — the signed-out and no-connections cases.
 *
 * Composed rather than a glyph over a sentence in the middle of a large
 * sheet. The mark is struck in the parchment's own brown inside a ruled
 * roundel, the first line states the case and the second says what to do
 * about it, so an empty roster reads as a page waiting to be written on
 * rather than as a failure.
 */
function Empty({
  testId,
  icon,
  text,
  hint = null,
}: {
  testId: string;
  icon: React.ReactNode;
  text: string;
  /** The next step, when there is an honest one. */
  hint?: string | null;
}) {
  return (
    <div data-testid={testId} className="play-invite-empty">
      <span className="play-invite-empty__mark" aria-hidden="true">
        {icon}
      </span>
      <p
        className="max-w-[34ch] text-[12.5px] font-bold leading-snug"
        style={{ color: INK.strong }}
      >
        {text}
      </p>
      {/* Kept SHORT enough to set on one line inside the register. Two lines
          here pushed the composition past the register's 7.5rem floor, and an
          empty panel that opens already scrolled reads as a rendering fault
          rather than as an empty page. */}
      {hint !== null && (
        <p
          className="max-w-[38ch] text-[11.5px] font-medium leading-snug"
          style={{ color: INK.faint }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
