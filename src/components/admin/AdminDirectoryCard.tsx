// ---------------------------------------------------------------------------
// AdminDirectoryCard — one destination card on the Admin Directory page.
// Purely presentational: renders a registry item's title, purpose, canonical
// path, textual status/warnings, the primary open action, child actions, and
// legacy aliases as metadata (never as navigation cards).
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminDirectoryItem } from "@/lib/admin/admin-directory";

export function AdminDirectoryCard({ item }: { item: AdminDirectoryItem }) {
  return (
    <article
      className="flex h-full flex-col gap-2 rounded-lg border border-border bg-muted/20 p-4"
      data-testid={`admin-directory-card-${item.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] font-normal">
            {item.status}
          </Badge>
          {item.requiredRole && (
            <Badge variant="outline" className="text-[10px] font-normal text-amber-300">
              Requires {item.requiredRole}
            </Badge>
          )}
          {item.dangerLevel === "mutates-production" && (
            <Badge variant="outline" className="text-[10px] font-normal text-destructive">
              Mutates Production
            </Badge>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>
      <code className="text-[11px] text-muted-foreground/80">{item.path}</code>

      {item.warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{item.warning}</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button asChild size="sm" className="h-7 gap-1 text-xs">
          <Link to={item.path}>
            Open {item.title}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </Button>
        {item.childActions?.map((action) =>
          action.newTab ? (
            <a
              key={action.path}
              href={action.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {action.label}
              {action.note ? ` (${action.note})` : ""}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <Link
              key={action.path}
              to={action.path}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {action.label}
              {action.note ? ` (${action.note})` : ""}
            </Link>
          ),
        )}
      </div>

      {item.legacyAliases && item.legacyAliases.length > 0 && (
        <p className="text-[11px] text-muted-foreground/60">
          Legacy aliases (redirect here): {item.legacyAliases.join(", ")}
        </p>
      )}
    </article>
  );
}
