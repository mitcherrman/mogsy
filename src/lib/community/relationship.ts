// ---------------------------------------------------------------------------
// COM1-2 — the ONE relationship vocabulary.
//
// Before this file there were three. `useFriends.FriendStatus` said
// `pending_sent | pending_received`, the drawer split the same rows into three
// arrays by re-deriving direction from `myProfileId`, and `/user/:profileId`
// computed a fourth answer from `rows[0]` with no ordering. Each was correct in
// isolation and none could see a block the OTHER party created, which is how a
// button could read "Add Friend" for someone whose every request the database
// refuses.
//
// The states below are what `public.get_relationship_state` and
// `public.search_league_profiles` return. The database decides; this module
// only names the answer and says what a user may do with it.
//
// ON `none` AND A BLOCK YOU DID NOT CREATE
// If the OTHER party blocked you, the server reports `none` and `canRequest`
// stays true. That is deliberate — see the migration header. The refusal
// happens at the write and arrives as the same neutral SocialResult sentence
// as any other refusal. `canRequest` is an eligibility HINT, never an
// authorization.
// ---------------------------------------------------------------------------

export type Relationship =
  /** The caller's own profile. */
  | "self"
  /** No live friendship row either way. */
  | "none"
  /** The caller sent a request that has not been answered. */
  | "outgoing"
  /** The other party sent a request the caller has not answered. */
  | "incoming"
  /** An accepted friendship. */
  | "friends"
  /** The CALLER blocked this profile. Never means "they blocked you". */
  | "blocked"
  /** Not visible, not resolvable, or not signed in. */
  | "unavailable";

const RELATIONSHIPS: ReadonlySet<string> = new Set<Relationship>([
  "self",
  "none",
  "outgoing",
  "incoming",
  "friends",
  "blocked",
  "unavailable",
]);

/**
 * Narrow an untrusted server string. Anything unrecognised becomes
 * `unavailable` — the state that offers no action — rather than falling through
 * to `none`, which offers "Add Friend".
 */
export function toRelationship(value: unknown): Relationship {
  return typeof value === "string" && RELATIONSHIPS.has(value)
    ? (value as Relationship)
    : "unavailable";
}

/** What the primary control on a search result does. */
export type RelationshipAction =
  | "add"
  | "requested"
  | "accept"
  | "friends"
  | "unblock"
  | "none";

export interface RelationshipPresentation {
  action: RelationshipAction;
  /** The control's label. Empty when there is no control. */
  label: string;
  /** True when the control is inert — shown as state, not as an offer. */
  passive: boolean;
}

/**
 * One state, one presentation. The mapping lives here rather than in JSX so the
 * "outgoing shows Requested, not Add Friend" rule is testable without a DOM,
 * and so a future surface cannot quietly invent a different word for a state
 * that already has one.
 */
export function presentRelationship(state: Relationship): RelationshipPresentation {
  switch (state) {
    case "none":
      return { action: "add", label: "Add Friend", passive: false };
    case "outgoing":
      return { action: "requested", label: "Requested", passive: true };
    case "incoming":
      return { action: "accept", label: "Accept", passive: false };
    case "friends":
      return { action: "friends", label: "Friends", passive: true };
    case "blocked":
      return { action: "unblock", label: "Unblock", passive: false };
    // `self` renders as "You" and `unavailable` as "Unavailable": both are
    // states the viewer cannot act on, and neither explains itself. In
    // particular "Unavailable" never says why, because one of the reasons is a
    // block the viewer is not entitled to know about.
    case "self":
      return { action: "none", label: "You", passive: true };
    case "unavailable":
      return { action: "none", label: "Unavailable", passive: true };
  }
}
