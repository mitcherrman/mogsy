/**
 * The admin-only way into the Pro Play research surfaces.
 *
 * WHY THIS EXISTS. `/lol/pro-play/matchup`, `/lol/pro-play/search` and the
 * three profiles are gated by `AdminAuthGate`. The public hub therefore
 * carries no tile for them — a public tile would walk ordinary readers into a
 * 403. But an admin-only surface with no link at all is one nobody can review
 * without being told the URL, so the entry point lives HERE, on Explore Pro
 * Data, and renders only once admin authorization has actually resolved.
 *
 * IT IS A LINK, NOT A GATE. Rendering nothing for a non-admin is a courtesy,
 * not the security boundary: the pages themselves are still gated server-side
 * and by `AdminAuthGate`. Nothing here decides who may read what.
 */
import { Link } from "react-router-dom";
import { GitCompareArrows, Search as SearchIcon } from "lucide-react";

import { useOptionalAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import { PRO_PLAY_MATCHUP_ROUTE, PRO_PLAY_SEARCH_ROUTE } from "@/lib/pro-play/routes";

const LINKS = [
  {
    to: PRO_PLAY_MATCHUP_ROUTE,
    title: "Matchup Explorer",
    description:
      "Two teams, five lanes, demonstrated champion pools and bans over four comparison scopes.",
    Icon: GitCompareArrows,
  },
  {
    to: PRO_PLAY_SEARCH_ROUTE,
    title: "Pro Play Search",
    description:
      "Find a player, team or champion and read their demonstrated record.",
    Icon: SearchIcon,
  },
];

export default function ProPlayResearchLinks() {
  // Optional on purpose: this is a link, not a gate, so a page that mounts it
  // without the provider must render without it rather than crash.
  const status = useOptionalAdminAuth()?.status;
  const authorized = status === "authorized" || status === "authorized_via_fallback";
  if (!authorized) return null;

  return (
    <section className="mb-6" aria-labelledby="pro-play-research-links">
      <h2
        id="pro-play-research-links"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Research surfaces &middot; admin only
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map(({ to, title, description, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-start gap-3 rounded-lg border border-[#c9a84c]/30 bg-card/40 p-3 transition-colors hover:border-[#c9a84c]/60 hover:bg-card/70"
          >
            <span
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#c9a84c]/30 bg-[#c9a84c]/10"
              aria-hidden="true"
            >
              <Icon className="h-4 w-4 text-[#c9a84c]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
