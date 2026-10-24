// PULSE-2B — small form controls shared by the workspace panels.
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PulseIssue } from "@/lib/admin/pulse/validation";

const inputClass = "w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground disabled:opacity-60";

export function issueFor(issues: readonly PulseIssue[], field: string): string | null {
  return issues.find((i) => i.field === field)?.message ?? null;
}

interface FieldProps {
  label: string;
  field?: string;
  issues?: readonly PulseIssue[];
  hint?: string;
  children: (id: string, invalid: boolean) => ReactNode;
  className?: string;
}

export function Field({ label, field, issues = [], hint, children, className }: FieldProps) {
  const id = useId();
  const error = field ? issueFor(issues, field) : null;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="text-[11px] font-semibold text-foreground">{label}</label>
      {children(id, !!error)}
      {error
        ? <p className="text-[11px] text-destructive" data-testid={`pulse-issue-${field}`}>{error}</p>
        : hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextField(props: {
  label: string; value: string; onChange(v: string): void; field?: string; issues?: readonly PulseIssue[];
  hint?: string; disabled?: boolean; multiline?: boolean; maxLength?: number; placeholder?: string; testId?: string; className?: string;
}) {
  const { value, onChange, disabled, multiline, maxLength, placeholder, testId, ...rest } = props;
  return (
    <Field {...rest}>
      {(id, invalid) => multiline
        ? <textarea id={id} rows={3} className={inputClass} value={value} maxLength={maxLength} placeholder={placeholder}
            disabled={disabled} aria-invalid={invalid} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className={inputClass} value={value} maxLength={maxLength} placeholder={placeholder}
            disabled={disabled} aria-invalid={invalid} data-testid={testId} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** Empty input ↔ null (optional links, ids). */
export function NullableTextField(props: Omit<Parameters<typeof TextField>[0], "value" | "onChange"> & { value: string | null; onChange(v: string | null): void }) {
  const { value, onChange, ...rest } = props;
  return <TextField {...rest} value={value ?? ""} onChange={(v) => onChange(v.trim() === "" ? null : v)} />;
}

export function NumberField(props: {
  label: string; value: number | null; onChange(v: number | null): void; field?: string; issues?: readonly PulseIssue[];
  hint?: string; disabled?: boolean; min?: number; max?: number; placeholder?: string; testId?: string;
}) {
  const { value, onChange, disabled, min, max, placeholder, testId, ...rest } = props;
  return (
    <Field {...rest}>
      {(id, invalid) => (
        <input id={id} type="number" className={inputClass} value={value ?? ""} min={min} max={max} placeholder={placeholder}
          disabled={disabled} aria-invalid={invalid} data-testid={testId}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      )}
    </Field>
  );
}

export function DateTimeField(props: {
  label: string; value: string; onChange(v: string): void; field?: string; issues?: readonly PulseIssue[];
  hint?: string; disabled?: boolean; testId?: string;
}) {
  const { value, onChange, disabled, testId, ...rest } = props;
  return (
    <Field {...rest}>
      {(id, invalid) => (
        <input id={id} type="datetime-local" className={inputClass} value={value} disabled={disabled}
          aria-invalid={invalid} data-testid={testId} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  );
}

export function SelectField<T extends string>(props: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void;
  field?: string; issues?: readonly PulseIssue[]; hint?: string; disabled?: boolean; testId?: string;
}) {
  const { value, options, onChange, disabled, testId, ...rest } = props;
  return (
    <Field {...rest}>
      {(id, invalid) => (
        <select id={id} className={inputClass} value={value} disabled={disabled} aria-invalid={invalid} data-testid={testId}
          onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function CheckField({ label, checked, onChange, disabled, testId, hint }: {
  label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean; testId?: string; hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-xs">
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} data-testid={testId}
        onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export function IssueList({ issues, title }: { issues: readonly PulseIssue[]; title: string }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-200" data-testid="pulse-issue-list">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {issues.map((i, n) => <li key={`${i.field}-${n}`}>{i.message}</li>)}
      </ul>
    </div>
  );
}

export function Notice({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} data-testid="pulse-result"
      className={cn("text-xs", result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
      {result.message}
    </p>
  );
}
