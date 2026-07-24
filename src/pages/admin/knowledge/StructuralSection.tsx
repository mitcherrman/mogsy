import { AlertTriangle } from "lucide-react";
import type { UpdateDetail, UpdateRow } from "@/lib/knowledge-admin/types";
import {
  ACTION_LABELS,
  KIND_EFFECTS,
  KIND_LABELS,
  KIND_TARGET_TABLE,
  type StructuralParse,
  type StructuralPlan,
  parseStructuralPayload,
} from "@/lib/knowledge-admin/structural";
import { cn } from "@/lib/utils";

/**
 * Presentational pieces for STRUCTURAL proposals (champion onboarding).
 * Read-only rendering of the parsed payload — all safety decisions
 * (approval blocking on malformed payloads) are computed from
 * parseStructuralPayload and enforced by the callers.
 */

export function StructuralKindBadge({ kind }: { kind: string }) {
  const label = KIND_LABELS[kind as keyof typeof KIND_LABELS] ?? kind;
  return (
    <span className="inline-flex items-center rounded bg-primary/15 text-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
      {label}
    </span>
  );
}

/** Compact queue-row summary — replaces the numeric "cur → new" rank chips
 *  (which would render "null → null" for structural rows). */
export function StructuralQueueSummary({ updates }: { updates: UpdateRow[] }) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {updates.map((u) => {
        const parse = parseStructuralPayload(u.property, u.proposed_full_progression ?? null);
        if (!parse.ok) {
          return (
            <span key={u.id} className="inline-flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Structural payload cannot be understood — open Review for details.
            </span>
          );
        }
        const p = parse.payload;
        const headline =
          p.kind === "role_tags"
            ? p.roles.join(", ")
            : p.kind === "ability_create"
              ? (p.fields.find((f) => f.field === "ability_name")?.value ?? "")
              : p.fields.map((f) => f.label).join(", ");
        return (
          <span key={u.id} className="inline-flex items-center gap-2 flex-wrap">
            <StructuralKindBadge kind={p.kind} />
            <span className="text-foreground font-semibold">
              {p.champion}
              {p.slot ? ` ${p.slot}` : ""}
            </span>
            {headline && <span className="text-muted-foreground truncate">{headline}</span>}
          </span>
        );
      })}
    </div>
  );
}

function KeyValueRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 items-baseline">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-foreground break-words", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

export function StructuralMalformedBanner({ reason }: { reason: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1"
    >
      <div className="flex items-center gap-2 text-destructive text-xs font-extrabold uppercase tracking-wider">
        <AlertTriangle className="h-4 w-4" aria-hidden /> Structural payload cannot be understood
      </div>
      <p className="text-xs text-destructive/90">{reason}</p>
      <p className="text-xs text-muted-foreground">
        Approval is disabled. This proposal cannot be safely applied — reject it
        or fix the payload on the backend.
      </p>
    </div>
  );
}

/** The main labeled detail view for a structural proposal. */
export function StructuralDetailSection({
  d,
  parse,
}: {
  d: UpdateDetail;
  parse: StructuralParse;
}) {
  if (!parse.ok) {
    return <StructuralMalformedBanner reason={parse.reason} />;
  }
  const p = parse.payload;
  const table = KIND_TARGET_TABLE[p.kind];
  return (
    <section
      className="rounded-lg border border-border p-3 space-y-3 text-xs"
      aria-label="Structural change"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          Structural Change
        </h3>
        <StructuralKindBadge kind={p.kind} />
      </div>

      <p className="text-muted-foreground">{KIND_EFFECTS[p.kind]}</p>

      <dl className="space-y-1.5">
        <KeyValueRow label="Champion" value={p.champion} />
        {p.slot && <KeyValueRow label="Ability slot" value={p.slot} />}
        <KeyValueRow label="Record affected" value={table} mono />
        {d.patch_version && <KeyValueRow label="Patch identity" value={d.patch_version} mono />}
      </dl>

      {p.roles.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Proposed role set
          </h4>
          <ul className="flex flex-wrap gap-1.5" aria-label="Proposed roles">
            {p.roles.map((r) => (
              <li key={r} className="rounded bg-muted px-2 py-0.5 font-semibold">{r}</li>
            ))}
          </ul>
        </div>
      )}

      {p.fields.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Proposed values
          </h4>
          <dl className="space-y-1.5">
            {p.fields.map((f) => (
              <KeyValueRow
                key={f.field}
                label={f.label}
                value={f.value}
                mono={f.field === "cooldown" || f.field === "cost" || f.field === "range_text"}
              />
            ))}
          </dl>
        </div>
      )}

      {p.skipped.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1">
            Skipped by deterministic parsing
          </h4>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-200">
            {p.skipped.map((s) => (
              <li key={s.field}>
                <span className="font-bold">{s.label}</span>: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground">
        Current database state and the exact create / update / no-op outcome are
        computed by the backend — use <span className="font-bold">Preview write</span> to
        see them before applying.
      </p>

      <details className="rounded-md bg-muted/40">
        <summary className="cursor-pointer px-2 py-1 text-muted-foreground font-semibold select-none">
          Raw payload (debug)
        </summary>
        <pre className="px-2 pb-2 font-mono text-[10px] whitespace-pre-wrap break-words">
          {JSON.stringify(p.raw, null, 2)}
        </pre>
      </details>
    </section>
  );
}

/** Dry-run plan view for a structural approval (before/action/after). */
export function StructuralPlanView({ plan }: { plan: StructuralPlan }) {
  const action = ACTION_LABELS[plan.action] ?? {
    label: `Unrecognised outcome "${plan.action}" — verify on the backend before applying`,
    tone: "noop" as const,
  };
  const before = plan.before;
  const hasBefore =
    before !== null &&
    before !== undefined &&
    !(Array.isArray(before) && before.length === 0);
  return (
    <div className="space-y-2 text-xs">
      <div
        className={cn(
          "rounded px-2 py-1 font-bold inline-block",
          action.tone === "create" && "bg-emerald-500/15 text-emerald-300",
          action.tone === "update" && "bg-amber-500/15 text-amber-300",
          action.tone === "noop" && "bg-muted text-muted-foreground",
        )}
      >
        {action.label}
      </div>
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
          Current database state
        </h4>
        {hasBefore ? (
          <pre className="font-mono text-[10px] bg-background/60 rounded p-2 whitespace-pre-wrap break-words">
            {JSON.stringify(before, null, 2)}
          </pre>
        ) : (
          <p className="text-muted-foreground italic">
            No existing record — approval creates it.
          </p>
        )}
      </div>
      {(plan.fields || plan.roles) && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Will be written
          </h4>
          <pre className="font-mono text-[10px] bg-background/60 rounded p-2 whitespace-pre-wrap break-words text-emerald-200">
            {JSON.stringify(plan.fields ?? plan.roles, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
