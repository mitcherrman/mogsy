import type { ReactNode } from "react";
import type { PatchReconciliation, PatchReportDetail } from "@/lib/patch-reports/api";
import { PATCH_HUB_TOP_ANCHOR } from "@/lib/patch-reports/sr-navigation";

const GOLD = "#c9a84c";

const RECON_PILL: Record<string, { label: string; tone: string }> = {
  RECONCILED: { label: "Mogzy data current", tone: "text-emerald-500 border-emerald-600/40" },
  RECONCILED_WITH_HELDS: {
    label: "Mogzy data partly current",
    tone: "text-amber-500 border-amber-600/40",
  },
  RECONCILIATION_FAILED: {
    label: "Mogzy data not reconciled",
    tone: "text-red-500 border-red-600/40",
  },
  PUBLISHED_NOT_RECONCILED: {
    label: "Mogzy data not reconciled",
    tone: "text-muted-foreground border-border",
  },
};

type Props = {
  patchVersion: string | null;
  detail: PatchReportDetail | undefined;
  entityCount: number;
  changeCount: number;
  sectionCount: number;
  reconciliation?: PatchReconciliation;
  /** Anchor of the full reconciliation notice, so the pill can jump to it. */
  reconciliationAnchor: string;
  /** The "Patch Report | Catch Up" view switch, under the title. */
  viewSwitch?: ReactNode;
};

/**
 * Compact patch masthead: product name, the module the reader is in, and the
 * one-line facts about the open patch. Riot's source link leads; Mogzy's
 * reconciliation state is a secondary pill that links to the full notice.
 */
export const PatchHubMasthead = ({
  patchVersion,
  detail,
  entityCount,
  changeCount,
  sectionCount,
  reconciliation,
  reconciliationAnchor,
  viewSwitch,
}: Props) => {
  const recon =
    RECON_PILL[reconciliation?.status ?? "PUBLISHED_NOT_RECONCILED"] ??
    RECON_PILL.PUBLISHED_NOT_RECONCILED;
  return (
    <header id={PATCH_HUB_TOP_ANCHOR} className="mb-5 scroll-mt-24" data-testid="patch-hub-masthead">
      <p className="text-xs uppercase tracking-[0.3em]" style={{ color: GOLD }}>
        Mogzy Knowledge
      </p>
      <h1 className="mt-1 text-3xl font-bold">Patch Hub</h1>
      {viewSwitch}
      {patchVersion && (
        <div className="mt-3 border-l-2 pl-3" style={{ borderColor: GOLD }}>
          <h2
            id="patch-report-heading"
            tabIndex={-1}
            className="text-xl font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
          >
            Patch Report <span className="text-muted-foreground">·</span> {patchVersion}
          </h2>
          {detail && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                {entityCount} {entityCount === 1 ? "entry" : "entries"} · {changeCount}{" "}
                {changeCount === 1 ? "change" : "changes"} · {sectionCount}{" "}
                {sectionCount === 1 ? "section" : "sections"}
              </p>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[#c9a84c]"
                >
                  Riot patch {detail.patch_version} notes
                </a>
                <a
                  href={`#${reconciliationAnchor}`}
                  className={`rounded-full border px-2 py-0.5 font-medium ${recon.tone}`}
                >
                  {recon.label}
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </header>
  );
};
