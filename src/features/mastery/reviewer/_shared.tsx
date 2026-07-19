/**
 * Shared read-only presentation primitives for the Mastery reviewer inspector
 * (G5.2C). Display only — no computation, no formulas, no ID generation.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/** Non-canonical clipboard copy (guarded for non-browser/test environments). */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-6 px-1.5 text-[10px]"
      data-testid="mastery-copy-button"
      onClick={() => {
        const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        if (clip?.writeText) {
          void clip.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** A monospace ID/value with an accessible copy affordance; long values wrap. */
export function IdValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[11px]" title={value}>
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}

/** A label/value pair list. Object values render as compact JSON. */
export function KeyValueList({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="space-y-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-wrap items-baseline gap-2">
          <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-all text-xs">
            {typeof v === "object" && v !== null ? (
              <code className="font-mono">{JSON.stringify(v)}</code>
            ) : (
              String(v)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Collapsed-by-default JSON disclosure. Content is rendered via React text nodes
 * (JSON.stringify), never dangerouslySetInnerHTML — no HTML injection. Bounded,
 * scrollable, monospace.
 */
export function JsonDisclosure({
  value,
  label = "Raw JSON",
  testId,
}: {
  value: unknown;
  label?: string;
  testId?: string;
}) {
  return (
    <Collapsible>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger
          data-testid={testId ?? "mastery-json-trigger"}
          className="text-[11px] text-muted-foreground underline underline-offset-2"
        >
          {label}
        </CollapsibleTrigger>
        <span className="text-[10px] text-muted-foreground">(backend fixture data)</span>
      </div>
      <CollapsibleContent>
        <pre
          data-testid="mastery-json-content"
          className="mt-1 max-h-80 overflow-auto rounded border border-border bg-muted/40 p-2 font-mono text-[10px] leading-snug"
        >
          {JSON.stringify(value, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
  );
}
