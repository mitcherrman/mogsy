// ---------------------------------------------------------------------------
// Admin Directory — the private grouped index of every legitimate admin
// destination. Registered under AdminRoute in App.tsx; content is additionally
// wrapped in the shared AdminAuthGate so nothing renders before the
// backend-verified admin session resolves. Child admin pages keep their own
// existing guards — this page only navigates, it never mutates.
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminDirectoryCard } from "@/components/admin/AdminDirectoryCard";
import { useAdminAuth } from "@/lib/admin-auth/AdminAuthProvider";
import {
  ADMIN_DIRECTORY_PATH,
  groupedAdminDirectoryItems,
} from "@/lib/admin/admin-directory";

interface AdminDirectoryProps {
  /** Overridable for tests; defaults to the build mode. */
  includeDevelopment?: boolean;
}

export default function AdminDirectory({
  includeDevelopment = import.meta.env.DEV,
}: AdminDirectoryProps) {
  const groups = groupedAdminDirectoryItems(includeDevelopment);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <SEOHead
        title="Mogzy Admin · Directory"
        description="Private administration directory."
        path={ADMIN_DIRECTORY_PATH}
        noindex
      />

      <AdminAuthGate>
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              Mogzy Admin
            </h1>
            <p className="text-xs text-muted-foreground">Private administration directory.</p>
            <DirectoryIdentity />
          </div>
          <Link
            to="/lol"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Mogzy
          </Link>
        </header>

        <div className="space-y-8">
          {groups.map((group) => {
            const headingId = `directory-${group.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
            return (
            <section key={group.category} aria-labelledby={headingId}>
              <h2
                id={headingId}
                className="mb-3 text-sm font-semibold text-muted-foreground"
              >
                {group.category}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.items.map((item) => (
                  <AdminDirectoryCard key={item.id} item={item} />
                ))}
              </div>
            </section>
            );
          })}
        </div>
      </AdminAuthGate>
    </div>
  );
}

/**
 * Shows the authorized identity already held by the provider (no extra
 * request). Renders nothing when no principal email is available.
 */
function DirectoryIdentity() {
  const { principal } = useAdminAuth();
  if (!principal?.email) return null;
  return (
    <p className="text-[11px] text-muted-foreground/70" data-testid="admin-directory-identity">
      Signed in as {principal.email}
    </p>
  );
}
