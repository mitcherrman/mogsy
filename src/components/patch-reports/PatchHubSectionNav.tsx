import type { ReportSectionNode } from "@/lib/patch-reports/report-structure";

/**
 * In-page navigation over the official sections (and, for direction-grouped
 * sections, the Buffs / Nerfs / Adjustments groups). Plain anchor links:
 * keyboard-valid, deep-linkable, no scripting required. Wraps rather than
 * scrolls the page.
 */
export const PatchHubSectionNav = ({ sections }: { sections: ReportSectionNode[] }) => {
  if (sections.length === 0) return null;
  return (
    <nav
      aria-label="Patch sections"
      data-testid="patch-hub-section-nav"
      className="mb-6 rounded-lg border border-border bg-card/60 px-3 py-2"
    >
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {sections.map((section) => (
          <li key={section.anchor} className="min-w-0">
            <a
              href={`#${section.anchor}`}
              className="text-sm font-semibold hover:text-[#c9a84c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
            >
              {section.title}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {section.entities.length}
              </span>
            </a>
            {section.directionBuckets && (
              <ul className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {section.directionBuckets.map((bucket) => (
                  <li key={bucket.direction}>
                    <a
                      href={`#${bucket.anchor}`}
                      className="hover:text-[#c9a84c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/60"
                    >
                      {bucket.label} {bucket.entities.length}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
};
