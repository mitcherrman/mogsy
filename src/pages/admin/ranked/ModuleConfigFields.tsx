// ---------------------------------------------------------------------------
// Controls for one module's configurable fields.
//
// Rendered from the BACKEND catalog, never from module knowledge held here.
// This file knows five field shapes and nothing about quiz pools, Meta Reflex
// families, or which modules exist — add a field to the catalog and it renders
// with no change to this file, which is the point.
//
// It also holds no validation rules. The only checks are the ones needed to
// keep the form usable (a required text field flagged as empty), never a
// second opinion on what the backend will accept.
// ---------------------------------------------------------------------------

import type { CatalogField, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";
import { fieldApplies, readSegmentField, toggleMultiValue } from "@/lib/admin/rankedFormatEditing";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FieldProps {
  field: CatalogField;
  segment: SegmentSpecJson;
  index: number;
  onChange: (key: string, value: unknown) => void;
}

function FieldShell({
  field,
  index,
  children,
}: {
  field: CatalogField;
  index: number;
  children: React.ReactNode;
}) {
  const id = `segment-${index}-${field.key}`;
  return (
    <div className="space-y-1" data-testid={`field-${index}-${field.key}`}>
      <label htmlFor={id} className="block text-[11px] font-medium text-muted-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-amber-400">*</span>}
      </label>
      {children}
      {field.help && (
        <p className="text-[10px] leading-relaxed text-muted-foreground/80">{field.help}</p>
      )}
    </div>
  );
}

function EnumField({ field, segment, index, onChange }: FieldProps) {
  const value = readSegmentField(segment, field.key);
  return (
    <FieldShell field={field} index={index}>
      {/* A native <select>: the shadcn Select is a listbox that renders its
          options in a portal, which makes it markedly harder to drive from a
          test and adds nothing for an eight-option enum. */}
      <select
        id={`segment-${index}-${field.key}`}
        aria-label={field.label}
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.key, e.target.value)}
      >
        <option value="" disabled>
          Choose…
        </option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function MultiEnumField({ field, segment, index, onChange }: FieldProps) {
  const raw = readSegmentField(segment, field.key);
  const selected = new Set(Array.isArray(raw) ? (raw as string[]) : []);
  const options = field.options ?? [];
  const allValues = options.map((o) => o.value);
  const tooFew = (field.min_items ?? 0) > selected.size;

  return (
    <FieldShell field={field} index={index}>
      <div
        role="group"
        aria-label={field.label}
        className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-md border border-border bg-background/60 p-1.5"
      >
        {options.map((option) => {
          const on = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-testid={`option-${index}-${option.value}`}
              onClick={() =>
                onChange(field.key, toggleMultiValue(raw, option.value, allValues))
              }
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                on
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {tooFew && (
        <p className="text-[10px] text-amber-400" role="status">
          Choose at least {field.min_items}.
        </p>
      )}
    </FieldShell>
  );
}

function NumberField({ field, segment, index, onChange }: FieldProps) {
  const value = readSegmentField(segment, field.key);
  return (
    <FieldShell field={field} index={index}>
      <Input
        id={`segment-${index}-${field.key}`}
        aria-label={field.label}
        type="number"
        className="h-8 text-xs"
        min={field.min}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          // An empty box is `null`, not 0. The backend distinguishes "inherit
          // the match config" from "zero", and turning a cleared field into a
          // zero would silently change the segment's meaning.
          if (raw === "") {
            onChange(field.key, null);
            return;
          }
          const parsed = field.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
          onChange(field.key, Number.isNaN(parsed) ? null : parsed);
        }}
      />
    </FieldShell>
  );
}

function TextField({ field, segment, index, onChange }: FieldProps) {
  const value = readSegmentField(segment, field.key);
  return (
    <FieldShell field={field} index={index}>
      <Input
        id={`segment-${index}-${field.key}`}
        aria-label={field.label}
        className="h-8 text-xs"
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.key, e.target.value === "" ? null : e.target.value)}
      />
    </FieldShell>
  );
}

export function ModuleConfigFields({
  fields,
  segment,
  index,
  onChange,
}: {
  fields: CatalogField[];
  segment: SegmentSpecJson;
  index: number;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* A field whose `visible_when` does not match the segment's current
          values belongs to the other branch of a tagged-union config (e.g.
          Mastery's Champion fields while Matchup is selected). Rendering it
          would invite an admin to fill in a field the backend will reject. */}
      {fields.filter((field) => fieldApplies(field, segment)).map((field) => {
        const props = { field, segment, index, onChange };
        switch (field.type) {
          case "enum":
            return <EnumField key={field.key} {...props} />;
          case "multi_enum":
            return <MultiEnumField key={field.key} {...props} />;
          case "number":
          case "integer":
            return <NumberField key={field.key} {...props} />;
          case "text":
            return <TextField key={field.key} {...props} />;
          default:
            // A field type this build does not know about. Saying so is better
            // than rendering nothing, which would look like a field with no
            // value and invite an admin to save over it.
            return (
              <p key={field.key} className="text-[10px] text-muted-foreground">
                {field.label}: this build cannot edit this field type
                {` (${String(field.type)})`}.
              </p>
            );
        }
      })}
    </div>
  );
}
