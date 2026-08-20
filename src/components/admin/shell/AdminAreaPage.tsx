// ---------------------------------------------------------------------------
// Shared primitives for an Admin area page: the header, the URL-driven section
// tabs, and the cards that link to a registry tool.
//
// URL-driven sections (?section=<id>) rather than local state, so an operator
// can link, bookmark and refresh into an exact tab — the pattern
// /admin/quiz-content already proved.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, ExternalLink, Lock, Wrench } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { cn } from "@/lib/utils";
import {
  type AdminArea,
  type AdminAreaSection,
  type AdminTool,
} from "@/lib/admin/admin-registry";

/** Resolve the active section from ?section=, falling back to the first. */
export function useAreaSection(area: AdminArea): [AdminAreaSection, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  const active =
    area.sections.find((s) => s.id === requested) ?? area.sections[0];
  const setSection = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    setParams(next, { replace: false });
  };
  return [active, setSection];
}

export function AdminAreaHeader({
  area,
  active,
  onSelect,
}: {
  area: AdminArea;
  active: AdminAreaSection;
  onSelect: (id: string) => void;
}) {
  return (
    <header className="mb-5 space-y-3">
      <SEOHead
        title={`Mogzy Admin · ${area.label}`}
        description={area.description}
        path={area.path}
        noindex
      />
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{area.label}</h1>
          {area.badge && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                area.kind === "archived"
                  ? "bg-muted text-muted-foreground"
                  : "bg-amber-400/10 text-amber-300",
              )}
              data-testid={`admin-area-badge-${area.id}`}
            >
              {area.badge}
            </span>
          )}
        </div>
        <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {area.description}
        </p>
      </div>

      {/* A navigation strip, not an ARIA tablist: half these controls are links
          to their own route, and the content below is not a tabpanel. Links
          carry aria-current; in-page switches carry aria-pressed. */}
      {area.sections.length > 1 && (
        <nav
          aria-label={`${area.label} sections`}
          data-testid={`admin-sections-${area.id}`}
          className="flex flex-wrap gap-1"
        >
          {area.sections.map((section) => {
            const isActive = section.id === active.id;
            const className = cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            );
            // A section that owns its own route links; the rest switch ?section=.
            return section.path ? (
              <Link
                key={section.id}
                to={section.path}
                aria-current={isActive ? "page" : undefined}
                data-testid={`admin-section-tab-${section.id}`}
                className={className}
              >
                {section.label}
              </Link>
            ) : (
              <button
                key={section.id}
                type="button"
                aria-pressed={isActive}
                data-testid={`admin-section-tab-${section.id}`}
                onClick={() => onSelect(section.id)}
                className={className}
              >
                {section.label}
              </button>
            );
          })}
        </nav>
      )}

      <p className="text-[11px] text-muted-foreground">{active.summary}</p>
    </header>
  );
}

/** A titled block inside a section. */
export function AdminPanel({
  title,
  description,
  children,
  action,
  testId,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-lg border border-border bg-card/40 p-4"
      data-testid={testId}
      aria-label={title}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DangerBadge({ tool }: { tool: AdminTool }) {
  if (tool.dangerLevel === "none") return null;
  const label =
    tool.dangerLevel === "destructive"
      ? "Destructive"
      : tool.dangerLevel === "mutates-production"
        ? "Mutates production"
        : "Caution";
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tool.dangerLevel === "destructive"
          ? "bg-destructive/15 text-destructive"
          : tool.dangerLevel === "mutates-production"
            ? "bg-destructive/10 text-destructive"
            : "bg-amber-400/10 text-amber-300",
      )}
    >
      {label}
    </span>
  );
}

/**
 * One registry tool rendered as a card. Tools with no path (backend-only
 * capabilities and named future gaps) render as documentation, never as a
 * control — an invisible capability becomes visible without becoming armed.
 */
export function AdminToolCard({ tool }: { tool: AdminTool }) {
  const navigable = Boolean(tool.path) && tool.kind !== "gap" && tool.kind !== "backend";

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border p-3.5",
        tool.dangerLevel === "destructive"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/20",
      )}
      data-testid={`admin-tool-${tool.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{tool.title}</h3>
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {tool.status}
          </span>
          {tool.developerOnly && (
            <span
              className="flex items-center gap-0.5 rounded bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300"
              data-testid={`admin-tool-devlabel-${tool.id}`}
            >
              <Wrench className="h-2.5 w-2.5" aria-hidden /> Developer
            </span>
          )}
          {tool.requiredRole && (
            <span className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-amber-300">
              <Lock className="h-2.5 w-2.5" aria-hidden /> {tool.requiredRole}
            </span>
          )}
          <DangerBadge tool={tool} />
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">{tool.description}</p>

      {tool.warning && (
        <p
          className={cn(
            "flex items-start gap-1.5 text-[11px]",
            tool.dangerLevel === "destructive" ? "text-destructive" : "text-amber-300",
          )}
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{tool.warning}</span>
        </p>
      )}

      <div className="mt-auto space-y-1.5 pt-1">
        {navigable ? (
          tool.newTab ? (
            <a
              href={tool.path}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted/50"
            >
              Open {tool.title}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <Link
              to={tool.path!}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted/50"
            >
              Open {tool.title}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          )
        ) : (
          <span
            className="inline-flex items-center rounded border border-dashed border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground"
            data-testid={`admin-tool-nocontrol-${tool.id}`}
          >
            {tool.kind === "gap" ? "Future gap — no surface exists" : "No UI — documented only"}
          </span>
        )}
        {tool.path && !navigable && (
          <code className="block text-[10px] text-muted-foreground/80">{tool.path}</code>
        )}
        {navigable && <code className="block text-[10px] text-muted-foreground/80">{tool.path}</code>}
      </div>
    </article>
  );
}

/** A grid of registry tools. */
export function AdminToolGrid({ tools }: { tools: AdminTool[] }) {
  if (tools.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        <AdminToolCard key={tool.id} tool={tool} />
      ))}
    </div>
  );
}

/** A short cross-link out to another area's canonical home. */
export function AdminCrossLink({
  to,
  label,
  note,
}: {
  to: string;
  label: string;
  note?: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
    >
      {label}
      {note && <span className="text-muted-foreground">— {note}</span>}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}
