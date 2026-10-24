// ---------------------------------------------------------------------------
// PULSE-2B — cadence and categories.
//
// The owner edits the plain data the shared scheduler reads (slots,
// promotion cap, promotion spacing) plus per-category enable / frequency /
// expiry. The "resulting cycle" is computed by `buildPulseCycle` itself on
// the public projection, so what is shown is what would play, guard rails
// (no repeats, no same-kind neighbours, promotion caps across the wrap)
// included.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { buildPulseCycle, promotionPositions } from "@/features/academy-pulse/model/pulse-cadence";
import { CATEGORY_LABEL, PROMOTIONAL_CATEGORIES, type PulseCategory } from "@/features/academy-pulse/model/pulse-types";
import { CADENCE_LIMITS, type PulseCategorySetting, type PulseWorkspaceSnapshot } from "@/lib/admin/pulse/contract";
import { effectiveCadence, projectPublicPulse } from "@/lib/admin/pulse/projection";
import { ALL_PULSE_CATEGORIES } from "@/lib/admin/pulse/prototypeSeed";
import { isoToLocalInput, localInputToIso, type PulseWorkspaceState } from "@/lib/admin/pulse/usePulseWorkspace";
import { validateSchedule } from "@/lib/admin/pulse/validation";
import { cn } from "@/lib/utils";

import { IssueList, Notice, NumberField } from "./fields";

interface Props {
  snapshot: PulseWorkspaceSnapshot;
  now: Date;
  busy: boolean;
  write: PulseWorkspaceState["write"];
}

/** Categories whose content comes only from a live provider (PULSE-2A), not the workspace. */
const PROVIDER_CATEGORIES: ReadonlySet<PulseCategory> = new Set(["player-activity", "leaderboard", "personal-insight", "community-challenge", "premium"]);

function CategoryRow({ setting, contentCount, busy, write }: {
  setting: PulseCategorySetting; contentCount: number; busy: boolean; write: PulseWorkspaceState["write"];
}) {
  const [draft, setDraft] = useState(setting);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => setDraft(setting), [setting]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(setting);
  const save = async (next = draft) => {
    const { revision, ...rest } = next;
    const r = await write((repo) => repo.saveCategory(rest, revision));
    setResult(r.ok ? null : { ok: false, message: r.message });
  };
  return (
    <tr className="border-t" data-testid={`pulse-category-${setting.category}`}>
      <td className="px-3 py-2 font-medium">
        {CATEGORY_LABEL[setting.category]}
        {PROVIDER_CATEGORIES.has(setting.category) && <span className="block text-[10px] font-normal text-muted-foreground">Provider content</span>}
      </td>
      <td className="px-3 py-2">
        <Switch checked={draft.enabled} disabled={busy} aria-label={`${CATEGORY_LABEL[setting.category]} enabled`}
          data-testid={`pulse-category-enabled-${setting.category}`}
          onCheckedChange={(enabled) => { const next = { ...draft, enabled }; setDraft(next); void save(next); }} />
      </td>
      <td className="px-3 py-2">
        <input type="number" min={0} max={24} className="w-16 rounded-md border bg-background px-2 py-1 text-xs" value={draft.maxPerCycle ?? ""}
          placeholder="any" aria-label={`${CATEGORY_LABEL[setting.category]} slots per cycle`} disabled={busy}
          onChange={(e) => setDraft({ ...draft, maxPerCycle: e.target.value === "" ? null : Number(e.target.value) })} />
      </td>
      <td className="px-3 py-2">
        <input type="datetime-local" className="rounded-md border bg-background px-2 py-1 text-xs" value={isoToLocalInput(draft.expiresAt)}
          aria-label={`${CATEGORY_LABEL[setting.category]} expiry`} disabled={busy}
          onChange={(e) => setDraft({ ...draft, expiresAt: localInputToIso(e.target.value) })} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">{contentCount}</td>
      <td className="px-3 py-2">
        {dirty && <Button size="sm" className="h-6 px-2 text-[11px]" disabled={busy} onClick={() => void save()}>Save</Button>}
        {result && <Notice result={result} />}
      </td>
    </tr>
  );
}

export function PulseCadencePanel({ snapshot, now, busy, write }: Props) {
  const saved = snapshot.schedule;
  const [slots, setSlots] = useState<PulseCategory[]>(saved.slots);
  const [maxPromos, setMaxPromos] = useState<number | null>(saved.maxPromotionsPerCycle);
  const [gap, setGap] = useState<number | null>(saved.minPromotionGap);
  const [add, setAdd] = useState<PulseCategory>("news");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { setSlots(saved.slots); setMaxPromos(saved.maxPromotionsPerCycle); setGap(saved.minPromotionGap); }, [saved]);

  const draft = { slots, maxPromotionsPerCycle: maxPromos ?? -1, minPromotionGap: gap ?? -1 };
  const issues = validateSchedule(draft);
  const dirty = JSON.stringify(slots) !== JSON.stringify(saved.slots) || maxPromos !== saved.maxPromotionsPerCycle || gap !== saved.minPromotionGap;

  const projection = useMemo(() => projectPublicPulse(snapshot, now), [snapshot, now]);
  const cadence = useMemo(() => (issues.length ? null : effectiveCadence(draft, snapshot.categories, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(draft), snapshot.categories, now, issues.length]);
  const cycles = useMemo(() => (cadence ? [0, 1].map((c) => buildPulseCycle(projection.catalogue, cadence, c)) : []), [cadence, projection]);
  const emptySlots = [...new Set(slots.filter((s) => !(projection.catalogue[s]?.length)))];
  const counts = useMemo(() => {
    const m = new Map<PulseCategory, number>();
    for (const i of snapshot.items) if (i.state !== "archived") m.set(i.payload.category, (m.get(i.payload.category) ?? 0) + 1);
    return m;
  }, [snapshot.items]);

  const move = (i: number, d: -1 | 1) => {
    const next = [...slots];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSlots(next);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2" aria-labelledby="pulse-categories-h">
        <h3 id="pulse-categories-h" className="text-sm font-semibold">Categories</h3>
        <p className="text-xs text-muted-foreground">
          Off removes a category's content and its cadence slots. Frequency caps how many slots it gets per cycle; expiry turns it off at a set time.
          Provider categories have no authoritative public source yet and stay off until PULSE-2A ships one.
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">On</th>
                <th className="px-3 py-2 font-medium">Slots / cycle</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Content</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {ALL_PULSE_CATEGORIES.map((c) => {
                const s = snapshot.categories.find((x) => x.category === c);
                return s ? <CategoryRow key={c} setting={s} contentCount={counts.get(c) ?? 0} busy={busy} write={write} /> : null;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="pulse-cadence-h">
        <h3 id="pulse-cadence-h" className="text-sm font-semibold">Cadence</h3>
        <ol className="flex flex-wrap gap-1.5" data-testid="pulse-cadence-slots">
          {slots.map((s, i) => (
            <li key={`${s}-${i}`} className={cn("flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
              PROMOTIONAL_CATEGORIES.has(s) && "border-amber-500/50 bg-amber-500/10")}>
              <span className="text-muted-foreground">{i + 1}.</span> {CATEGORY_LABEL[s]}
              <button type="button" aria-label={`Move ${CATEGORY_LABEL[s]} earlier`} disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3 w-3" /></button>
              <button type="button" aria-label={`Move ${CATEGORY_LABEL[s]} later`} disabled={busy || i === slots.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3 w-3" /></button>
              <button type="button" aria-label={`Remove slot ${i + 1}`} disabled={busy} onClick={() => setSlots(slots.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-[11px] font-semibold">
            <span className="block">Add slot</span>
            <select className="rounded-md border bg-background px-2 py-1 text-xs" value={add} onChange={(e) => setAdd(e.target.value as PulseCategory)}
              data-testid="pulse-cadence-add-select">
              {ALL_PULSE_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <Button size="sm" variant="outline" disabled={busy || slots.length >= CADENCE_LIMITS.maxSlots} onClick={() => setSlots([...slots, add])}
            data-testid="pulse-cadence-add">Add</Button>
          <div className="w-36">
            <NumberField label="Promotions per cycle" field="maxPromotionsPerCycle" issues={issues} value={maxPromos}
              min={0} max={CADENCE_LIMITS.maxPromotionsPerCycle} disabled={busy} onChange={setMaxPromos} testId="pulse-cadence-max-promos" />
          </div>
          <div className="w-36">
            <NumberField label="Promotion spacing" field="minPromotionGap" issues={issues} value={gap}
              min={CADENCE_LIMITS.minPromotionGap} max={CADENCE_LIMITS.maxPromotionGap} disabled={busy} onChange={setGap}
              hint="Positions apart, across the wrap." testId="pulse-cadence-gap" />
          </div>
        </div>
        <IssueList issues={issues.filter((i) => i.field === "slots")} title="Cadence" />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy || !dirty || issues.length > 0} data-testid="pulse-cadence-save"
            onClick={async () => {
              const r = await write((repo) => repo.saveSchedule(draft, saved.revision));
              setResult(r.ok ? { ok: true, message: "Cadence saved." } : { ok: false, message: r.message });
            }}>
            Save cadence
          </Button>
          {dirty && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setSlots(saved.slots); setMaxPromos(saved.maxPromotionsPerCycle); setGap(saved.minPromotionGap); }}>Discard</Button>}
          <Notice result={result} />
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="pulse-cycle-h" data-testid="pulse-cycle-preview">
        <h3 id="pulse-cycle-h" className="text-sm font-semibold">Resulting cycle {dirty && <span className="font-normal text-amber-600 dark:text-amber-300">(unsaved)</span>}</h3>
        <p className="text-xs text-muted-foreground">
          Computed by the Home Hub's own scheduler from content that is eligible right now. Amber = promotional.
        </p>
        {cycles.map((cycle, n) => (
          <div key={n} className="space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground">
              Cycle {n + 1} · {cycle.length} scenes · promotions at {promotionPositions(cycle).map((p) => p + 1).join(", ") || "none"}
            </p>
            <ol className="flex flex-wrap gap-1" data-testid={`pulse-cycle-${n}`}>
              {cycle.map((item, i) => (
                <li key={`${item.id}-${i}`} className={cn("rounded border px-1.5 py-0.5 text-[11px]",
                  PROMOTIONAL_CATEGORIES.has(item.category) && "border-amber-500/50 bg-amber-500/10")}>
                  {i + 1}. {CATEGORY_LABEL[item.category]}
                  <span className="text-muted-foreground"> · {snapshot.items.find((x) => x.id === item.id)?.label ?? item.id}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {emptySlots.length > 0 && (
          <p className="text-[11px] text-muted-foreground" data-testid="pulse-cycle-empty-slots">
            Skipped (nothing eligible): {emptySlots.map((s) => CATEGORY_LABEL[s]).join(", ")}.
          </p>
        )}
      </section>
    </div>
  );
}
