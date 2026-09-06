/**
 * Academy Updates ("What's New") — the owner's news channel for the /lol Hall.
 * ===========================================================================
 *
 * THIS FILE IS NO LONGER THE AUTHORITY. As of WHATSNEW2 the notices live in
 * Supabase (`public.academy_updates`) and the master switch lives in
 * `public.app_settings` under `POLICY_KEYS.academyUpdatesEnabled`. What remains
 * here is the shared contract both ends agree on: the type, the ordering rule,
 * the fail-closed activation rule and the CTA validator — pure functions with
 * no React and no Supabase, so the Hall, the admin screen and the tests cannot
 * disagree about what a notice is.
 *
 * There is deliberately NO update list and NO enabled constant in this file any
 * more. Two production authorities is the failure this workstream existed to
 * remove: an owner editing an array here while the database said something else
 * would have no way to tell which one visitors were reading.
 *
 * ---------------------------------------------------------------------------
 * OWNER GUIDE — no code, no deploy
 * ---------------------------------------------------------------------------
 *
 *   Admin → Studio → Academy Updates      (/admin/academy-updates)
 *
 * 1. WRITE   — "New update" creates a draft. Drafts are invisible to visitors,
 *              and Postgres will not even send one to a non-admin session, so a
 *              half-written notice is safe to leave sitting there.
 * 2. PUBLISH — press Publish on that row. Order does not matter; the surface
 *              sorts by date, newest first.
 * 3. ENABLE  — the switch at the top of the page. Until it is on, the Hall
 *              renders NOTHING for this feature: no mark, no panel, no hidden
 *              click region, no layout shift.
 *
 * All three take effect on the next page load. Nothing needs a commit and
 * nothing needs a Lovable publish.
 *
 * Nothing here is ever derived from git history, changelogs, deploys or
 * database activity. `src/lib/lol-changelog.ts` is the INTERNAL developer log
 * (it lists files and routes and feeds /lol/dev-changelog); it is a different
 * artefact for a different reader and must never be piped in here.
 *
 * Writing style: the audience is a player, not a developer. Say what is now
 * possible, not which module changed. Keep the body to a sentence or two — the
 * panel is small by design and must stay subordinate to the four volumes.
 */

/** One owner-authored announcement. */
export interface AcademyUpdate {
  /**
   * The database row's uuid. Stable, unique, and never rewritten — it is what
   * the browser remembers as "seen", which is exactly why correcting a typo in
   * an old notice does not re-announce it to everyone.
   */
  id: string;
  /** Publication date, `YYYY-MM-DD` (`academy_updates.publish_date`). Sorted
   *  on, and shown to the reader. */
  date: string;
  /** A short headline. One line — it must not wrap more than twice. */
  title: string;
  /** One or two plain sentences. No markdown; rendered as text. */
  body: string;
  /** Drafts are excluded from the surface entirely — and, since the public RLS
   *  policy is `USING (published = true)`, are never sent to a visitor at all.
   *  This field is the client-side restatement of that guarantee, not its
   *  enforcement. */
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
 * How many entries the panel shows before it scrolls. The surface is anchored
 * to Mogzy inside the Hall, so it cannot grow without eating the room.
 */
export const ACADEMY_UPDATES_VISIBLE = 3;

/**
 * What the Hall renders when it knows nothing yet — before the query resolves,
 * and after a query that failed. Empty, because an empty list and "the feature
 * is off" produce identical output, which is what makes the failure path
 * invisible rather than broken.
 */
export const NO_ACADEMY_UPDATES: readonly AcademyUpdate[] = [];

/**
 * Published entries, newest first. Drafts never leave this function.
 *
 * Ties on `date` fall back to the authored order, which is the only other
 * signal we have and is stable across renders.
 */
export function getPublishedUpdates(updates: readonly AcademyUpdate[]): AcademyUpdate[] {
  return updates
    .filter((u) => u.published)
    .map((u, index) => ({ u, index }))
    .sort((a, b) => (a.u.date === b.u.date ? a.index - b.index : a.u.date < b.u.date ? 1 : -1))
    .map(({ u }) => u);
}

/**
 * The single condition under which the Hall shows anything at all. Fails
 * closed in three directions at once: the switch off, the published list empty,
 * and — because a failed read resolves to an empty list — an unreachable
 * database all render exactly the same nothing. An empty "What's New" is worse
 * than none, and a broken one is worse still.
 */
export function isAcademyUpdatesActive(
  updates: readonly AcademyUpdate[],
  enabled: boolean,
): boolean {
  return enabled && getPublishedUpdates(updates).length > 0;
}

/**
 * Classifies an entry's CTA so the renderer knows which element to emit, and
 * drops anything that is neither an in-app route nor an https URL. This is the
 * same guard `safeHref` applies to user-controlled links; the entries are
 * owner-authored, but a typo silently producing a `javascript:` anchor is not
 * a failure mode worth leaving open.
 *
 * It runs at RENDER time, on whatever the database returned — so it is the last
 * word, not the first. The admin form refuses a bad href up front
 * (`validateCtaHref`) on the same rule, but a row edited by any other route
 * still cannot become a dangerous anchor here.
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

/**
 * The admin form's answer to "may I save this href?", stated on exactly the
 * rule `resolveUpdateCta` will apply when the notice renders.
 *
 * The two are kept in step by construction: this function decides by asking
 * `resolveUpdateCta` about a probe entry, so there is one rule and it cannot
 * drift. Rejecting up front is a courtesy — the author finds out immediately
 * rather than wondering why the button never appeared — but the render-time
 * guard is the guarantee.
 *
 * A CTA is OPTIONAL. Both fields blank is valid and means "no button". One
 * field filled and the other blank is not: a label with nowhere to go, or a
 * destination with nothing to click, is a half-finished notice.
 */
export interface CtaValidation {
  /** Whether the pair may be saved. */
  ok: boolean;
  /** The CTA to store, when `ok`. `undefined` means a valid "no button". */
  cta?: AcademyUpdate["cta"];
  /** Why it was rejected, when not `ok`. */
  message?: string;
}

/**
 * One flat result object rather than a discriminated union, deliberately: this
 * repo compiles with `strict: false`, under which narrowing a union on a
 * boolean discriminant does not hold, and a "clever" type that silently fails
 * to narrow is worse than a plain one that does not pretend to.
 */
export function validateCtaHref(label: string, href: string): CtaValidation {
  const l = label.trim();
  const h = href.trim();
  if (!l && !h) return { ok: true };
  if (!l) return { ok: false, message: "Give the button a label, or clear the link." };
  if (!h) return { ok: false, message: "Give the button a destination, or clear the label." };
  const probe = resolveUpdateCta({
    id: "probe", date: "", title: "", body: "", published: false, cta: { label: l, href: h },
  });
  if (!probe) {
    return {
      ok: false,
      message: "The link must be a Mogzy route starting with “/” or a full https:// address.",
    };
  }
  return { ok: true, cta: { label: l, href: h } };
}
