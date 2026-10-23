/**
 * Content Creator — the composer: the ordered selection and every setting the
 * Content Studio offers (mode, image sizes, card states, difficulty badge,
 * challenge copy variants, daily-package featured question). Vocabularies come
 * from `creatorState`, which reads them from the Content Factory registries.
 */
import { ArrowDown, ArrowUp, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLASSIC_STATES,
  CREATOR_FORMATS,
  CREATOR_MODES,
  DIFFICULTY_TIERS,
  MID_CTA_VARIANTS,
  MODE_COPY,
  PLATFORMS,
  REPEAT_COPY_VARIANTS,
  describeItem,
  selectionLimits,
  type CreatorItem,
  type CreatorSettings,
} from "@/lib/content-creator/creatorState";
import type { DifficultyTier } from "@/lib/quiz-screenshot/difficulty";
import type { MidCtaVariantId, RepeatVariantId } from "@/lib/quiz-screenshot/challenge";
import type { StudioPlatform } from "@/lib/quiz-screenshot/studio-request";
import { getFormat } from "@/lib/quiz-screenshot/formats";
import { cn } from "@/lib/utils";

const SELECT =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  testId,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "rounded-md border px-2 py-1 text-[11px] transition-colors",
        active
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Composer({
  items,
  settings,
  onSettings,
  onMove,
  onRemove,
  onClear,
}: {
  items: readonly CreatorItem[];
  settings: CreatorSettings;
  onSettings: (next: Partial<CreatorSettings>) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const limits = selectionLimits(settings.mode);
  const toggle = <T,>(list: readonly T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const isDaily = settings.mode === "daily-package";
  const isChallenge = settings.mode === "multi-question" || isDaily;

  return (
    <section className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border/70 bg-card/60 p-3" data-testid="cc-composer">
      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wide">Format</h2>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CREATOR_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSettings({ mode })}
              aria-pressed={settings.mode === mode}
              data-testid={`cc-mode-${mode}`}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors",
                settings.mode === mode
                  ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                  : "border-border/60 bg-background/40 hover:border-border",
              )}
            >
              <p className="text-xs font-semibold">{MODE_COPY[mode].title}</p>
              <p className="text-[10px] leading-snug text-muted-foreground">{MODE_COPY[mode].slides}</p>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{MODE_COPY[settings.mode].blurb}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide">
            Questions{" "}
            <span className="text-[11px] font-normal text-muted-foreground" data-testid="cc-selected-count">
              {items.length} selected · {limits.min}–{limits.max} for this format
            </span>
          </h2>
          {items.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 p-4 text-center text-[11px] text-muted-foreground">
            Add questions from the bank. {isChallenge ? "Their order is the carousel order." : ""}
          </p>
        ) : (
          <ol className="space-y-1" data-testid="cc-selection">
            {items.map((item, index) => {
              const info = describeItem(item.row);
              const featured = settings.featuredId === info.id;
              return (
                <li
                  key={info.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1.5",
                    featured ? "border-amber-400/60 bg-amber-400/5" : "border-border/60 bg-background/40",
                  )}
                  data-testid={`cc-selected-${info.id}`}
                >
                  <span className="w-5 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium" title={info.prompt}>
                      {info.prompt}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      ✓ {info.correctLabel ?? "—"}
                    </p>
                  </div>
                  <select
                    className="h-6 rounded border border-border bg-background px-1 text-[10px]"
                    aria-label={`Badge for question ${info.id}`}
                    value={settings.overrides[info.id] ?? ""}
                    onChange={(e) => {
                      const next = { ...settings.overrides };
                      if (e.target.value) next[info.id] = e.target.value as DifficultyTier;
                      else delete next[info.id];
                      onSettings({ overrides: next });
                    }}
                  >
                    <option value="">Badge: run</option>
                    {DIFFICULTY_TIERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {isDaily && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn("h-6 w-6", featured && "text-amber-400")}
                      aria-label={`Feature question ${info.id}`}
                      aria-pressed={featured}
                      onClick={() => onSettings({ featuredId: featured ? null : info.id })}
                      data-testid={`cc-feature-${info.id}`}
                    >
                      <Star className={cn("h-3.5 w-3.5", featured && "fill-current")} />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index, -1)}>
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label="Move down"
                    disabled={index === items.length - 1}
                    onClick={() => onMove(index, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    aria-label={`Remove question ${info.id}`}
                    onClick={() => onRemove(info.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Field label="Image sizes">
        <div className="flex flex-wrap gap-1.5">
          {CREATOR_FORMATS.map((f) => {
            const fmt = getFormat(f.key)!;
            return (
              <Chip
                key={f.key}
                active={settings.formats.includes(f.key)}
                onClick={() => onSettings({ formats: toggle(settings.formats, f.key) })}
                testId={`cc-format-${f.key}`}
                title={`${fmt.width}×${fmt.height}`}
              >
                {f.label} <span className="opacity-60">{fmt.width}×{fmt.height}</span>
              </Chip>
            );
          })}
        </div>
      </Field>

      {settings.mode === "classic" && (
        <Field label="Cards per question">
          <div className="flex flex-wrap gap-1.5">
            {CLASSIC_STATES.map((s) => (
              <Chip
                key={s.state}
                active={settings.states.includes(s.state)}
                onClick={() => onSettings({ states: toggle(settings.states, s.state) })}
                testId={`cc-state-${s.state}`}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <Field label="Difficulty badge" hint="Run default; each question's own content difficulty is used when this is off.">
        <div className="flex flex-wrap gap-1.5">
          <Chip active={settings.difficulty === null} onClick={() => onSettings({ difficulty: null })} testId="cc-difficulty-none">
            Question's own
          </Chip>
          {DIFFICULTY_TIERS.map((t) => (
            <Chip key={t} active={settings.difficulty === t} onClick={() => onSettings({ difficulty: t })} testId={`cc-difficulty-${t}`}>
              {t}
            </Chip>
          ))}
        </div>
      </Field>

      {isChallenge && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="Repeat-opener copy" hint={isDaily ? "Used when the featured question opens the challenge." : undefined}>
            <select
              className={SELECT}
              value={settings.repeatVariant ?? ""}
              onChange={(e) => onSettings({ repeatVariant: e.target.value ? (Number(e.target.value) as RepeatVariantId) : null })}
              data-testid="cc-repeat"
            >
              <option value="">Off</option>
              {REPEAT_COPY_VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.line1} {v.line2}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mid-challenge line">
            <select
              className={SELECT}
              value={settings.midCtaVariant ?? ""}
              onChange={(e) => onSettings({ midCtaVariant: e.target.value ? (Number(e.target.value) as MidCtaVariantId) : null })}
              data-testid="cc-mid"
            >
              <option value="">Off</option>
              {MID_CTA_VARIANTS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.text}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {isDaily && (
        <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={settings.reuseFeaturedAsOpener}
            onChange={(e) => onSettings({ reuseFeaturedAsOpener: e.target.checked })}
            data-testid="cc-reuse-featured"
          />
          Open the challenge with the featured question
        </label>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={isDaily ? "Package name" : "Run name"} hint="Letters, numbers, - and _. Blank uses a timestamp.">
          <Input
            value={settings.runName}
            onChange={(e) => onSettings({ runName: e.target.value })}
            placeholder={isDaily ? "daily-2026-10-23" : "optional"}
            className="h-8 text-xs"
            data-testid="cc-run-name"
          />
        </Field>
        <Field label="Posting to">
          <select
            className={SELECT}
            value={settings.platform}
            onChange={(e) => onSettings({ platform: e.target.value as StudioPlatform })}
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}
