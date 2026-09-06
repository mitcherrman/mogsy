/**
 * Academy Updates ("What's New") — the owner's news channel for the /lol Hall.
 * ===========================================================================
 *
 * THIS FILE IS THE AUTHORITY. There is no database, no backend, no CMS and no
 * admin screen behind it: the updates a visitor sees are the entries written
 * here, shipped with the build. That is deliberate for v1 — a handful of
 * hand-written announcements a few times a month does not justify a table.
 *
 * Nothing here is ever derived from git history, changelogs, deploys or
 * database activity. `src/lib/lol-changelog.ts` is the INTERNAL developer log
 * (it lists files and routes and feeds /lol/dev-changelog); it is a different
 * artefact for a different reader and must never be piped in here.
 *
 * ---------------------------------------------------------------------------
 * OWNER GUIDE
 * ---------------------------------------------------------------------------
 *
 * 1. ADD an update — prepend an object to ACADEMY_UPDATES with `published:
 *    false`. A draft is invisible to visitors, so it is safe to commit and
 *    deploy a half-written entry and come back to it.
 *
 * 2. PUBLISH it — flip that entry's `published` to `true`. Order does not
 *    matter; the surface always sorts by `date`, newest first.
 *
 * 3. ENABLE the whole feature — set ACADEMY_UPDATES_ENABLED to `true`. Until
 *    then the Hall renders NOTHING for this feature: no mark, no panel, no
 *    hidden click region, no layout shift. This is the master switch, and it
 *    ships `false` on purpose while the product is still changing daily.
 *
 * All three steps are ordinary code edits in this one file. Nothing else needs
 * to change to put an announcement in front of users.
 *
 * Writing style: the audience is a player, not a developer. Say what is now
 * possible, not which module changed. Keep `body` to a sentence or two — the
 * panel is small by design and must stay subordinate to the four volumes.
 */

/** One owner-authored announcement. */
export interface AcademyUpdate {
  /**
   * Stable, unique, and never reused. It is what the browser remembers as
   * "seen", so editing an id re-announces the entry to everyone. Convention:
   * `YYYY-MM-DD-short-slug`.
   */
  id: string;
  /** Publication date, `YYYY-MM-DD`. Sorted on, and shown to the reader. */
  date: string;
  /** A short headline. One line — it must not wrap more than twice. */
  title: string;
  /** One or two plain sentences. No markdown; rendered as text. */
  body: string;
  /** Drafts are excluded from the surface entirely. Flip to publish. */
  published: boolean;
  /**
   * Optional single action. `href` is either an in-app route (starts with
   * "/", rendered as a client-side link) or an absolute https:// URL
   * (rendered as an external anchor). Anything else is dropped — see
   * `resolveUpdateCta`.
   */
  cta?: { label: string; href: string };
}

/**
 * MASTER SWITCH. `false` = the feature does not exist as far as the Hall is
 * concerned. See step 3 of the owner guide above.
 */
export const ACADEMY_UPDATES_ENABLED = false;

/**
 * How many entries the panel shows before it scrolls. The surface is anchored
 * to Mogzy inside the Hall, so it cannot grow without eating the room.
 */
export const ACADEMY_UPDATES_VISIBLE = 3;

/**
 * The updates themselves, newest first by convention (the code sorts anyway).
 *
 * The two entries below are DRAFTS kept only so the surface can be exercised
 * in development and in tests. They are invisible in production because
 * `published: false`, and they are invisible twice over while
 * ACADEMY_UPDATES_ENABLED is `false`. Delete them, or overwrite them, when the
 * first real announcement is written — they are not production copy.
 */
export const ACADEMY_UPDATES: AcademyUpdate[] = [
  {
    id: "2026-09-05-example-second",
    date: "2026-09-05",
    title: "Example draft — delete me",
    body: "A placeholder so the Academy Updates panel can be seen during development. It is a draft, so no visitor will ever read it.",
    published: false,
    cta: { label: "Open the Academy", href: "/lol" },
  },
  {
    id: "2026-09-01-example-first",
    date: "2026-09-01",
    title: "Example draft — the older one",
    body: "A second placeholder, dated earlier, so ordering and the older-entry styling can be checked.",
    published: false,
  },
];

/**
 * Published entries, newest first. Drafts never leave this function.
 *
 * Ties on `date` fall back to the authored order, which is the only other
 * signal we have and is stable across renders.
 */
export function getPublishedUpdates(
  updates: readonly AcademyUpdate[] = ACADEMY_UPDATES,
): AcademyUpdate[] {
  return updates
    .filter((u) => u.published)
    .map((u, index) => ({ u, index }))
    .sort((a, b) => (a.u.date === b.u.date ? a.index - b.index : a.u.date < b.u.date ? 1 : -1))
    .map(({ u }) => u);
}

/**
 * The single condition under which the Hall shows anything at all. Fails
 * closed: enabled with zero published entries renders nothing, exactly as if
 * the switch were off — an empty "What's New" is worse than none.
 */
export function isAcademyUpdatesActive(
  updates: readonly AcademyUpdate[] = ACADEMY_UPDATES,
  enabled: boolean = ACADEMY_UPDATES_ENABLED,
): boolean {
  return enabled && getPublishedUpdates(updates).length > 0;
}

/**
 * Classifies an entry's CTA so the renderer knows which element to emit, and
 * drops anything that is neither an in-app route nor an https URL. This is the
 * same guard `safeHref` applies to user-controlled links; the entries here are
 * owner-authored, but a typo silently producing a `javascript:` anchor is not
 * a failure mode worth leaving open.
 */
export function resolveUpdateCta(
  update: AcademyUpdate,
): { label: string; href: string; external: boolean } | null {
  const cta = update.cta;
  if (!cta) return null;
  const href = cta.href.trim();
  const label = cta.label.trim();
  if (!href || !label) return null;
  if (href.startsWith("/")) return { label, href, external: false };
  if (/^https:\/\//i.test(href)) return { label, href, external: true };
  return null;
}
