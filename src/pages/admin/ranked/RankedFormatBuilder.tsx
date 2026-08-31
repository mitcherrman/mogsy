// ---------------------------------------------------------------------------
// Admin Ranked Builder — /admin/ranked?section=format-builder
//
// Configures the ordered module cycle for one of two independently saved
// targets. Direct save: there is no draft, no publish, no activation. The
// latest save for a target IS that target's configuration, and it governs the
// next match created on that lane.
//
// LAYOUT. The target selector, Add module, Save and the save state live in a
// STICKY header, because all four are needed while looking at the list and the
// list is the thing that scrolls. They used to sit at the bottom, which meant
// adding a module or saving one began by scrolling past everything.
//
// State is deliberately small: the selected target, the loaded revision, the
// editable format, the catalog, load/save status, and which row is being
// dragged. No validation mirror —
// the backend's Ranked format schema is the authority, and its refusal is
// rendered verbatim rather than pre-empted by a second set of rules here.
//
// AUTHORIZATION: unchanged. Reads and writes go through the same
// buildAdminHeaders() path every other admin client uses, against endpoints
// already behind require_admin.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import {
  CONFIG_TARGETS,
  RankedFormatApiError,
  TARGET_LABELS,
  fetchFormatConfig,
  fetchModuleCatalog,
  saveFormatConfig,
  type ConfigTarget,
  type ModuleCatalog,
  type RankedFormatJson,
} from "@/lib/admin/rankedFormatApi";
import {
  clampChallengeCountForMasterySet,
  fillVisibleDefaults,
  formatsDiffer,
  insertSegmentAt,
  normalizeSegmentConfig,
  moveSegmentDown,
  moveSegmentTo,
  moveSegmentUp,
  removeSegment,
  setSegmentField,
} from "@/lib/admin/rankedFormatEditing";
import { cn } from "@/lib/utils";
import { SegmentRow } from "./SegmentRow";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; revision: number }
  | { kind: "error"; message: string; code: string | null };

export default function RankedFormatBuilder() {
  const [target, setTarget] = useState<ConfigTarget>("admin_bot");
  const [catalog, setCatalog] = useState<ModuleCatalog | null>(null);
  const [format, setFormat] = useState<RankedFormatJson | null>(null);
  const [baseline, setBaseline] = useState<RankedFormatJson | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; code: string | null } | null>(
    null,
  );
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  // Which row is mid-drag, and where a newly added module goes. `addAt` is
  // null for "append", which is what an admin who has not chosen means.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addAt, setAddAt] = useState<number | null>(null);

  // Catalog once: it describes the build, not the target.
  useEffect(() => {
    let cancelled = false;
    void fetchModuleCatalog()
      .then((data) => !cancelled && setCatalog(data))
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError({
          message:
            err instanceof RankedFormatApiError
              ? err.message
              : "Could not load the module catalog.",
          code: err instanceof RankedFormatApiError ? err.code : null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Config per target. Switching target reloads, discarding local edits — the
  // two targets are separate configurations and carrying edits between them is
  // how the wrong lane gets saved.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSave({ kind: "idle" });
    // The two targets are separate configurations with separate lengths; an
    // insertion point chosen against one is meaningless against the other.
    setAddAt(null);
    setDragIndex(null);
    void fetchFormatConfig(target)
      .then((view) => {
        if (cancelled) return;
        // With no saved config the backend's own fallback — what the lane runs
        // today — is the editable starting state, so the admin edits reality
        // rather than a blank page.
        const start = view.config ?? view.fallback;
        setFormat(start ? structuredClone(start) : null);
        setBaseline(start ? structuredClone(start) : null);
        setRevision(view.revision);
        setSavedAt(view.saved_at);
        if (!start && view.fallback_unavailable) {
          setLoadError(view.fallback_unavailable);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFormat(null);
        setBaseline(null);
        setLoadError({
          message:
            err instanceof RankedFormatApiError
              ? err.message
              : "Could not load this target's configuration.",
          code: err instanceof RankedFormatApiError ? err.code : null,
        });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [target, nonce]);

  const moduleFor = useCallback(
    (moduleId: string, moduleVersion: number) =>
      catalog?.modules.find(
        (m) => m.module_id === moduleId && m.module_version === moduleVersion,
      ),
    [catalog],
  );

  const dirty = useMemo(() => formatsDiffer(format, baseline), [format, baseline]);

  const edit = (next: RankedFormatJson) => {
    setFormat(next);
    setSave({ kind: "idle" });
  };

  /**
   * Add a module at the chosen slot, and keep the chooser pointing just after
   * it so building a cycle front-to-back is a run of clicks rather than a
   * click-then-reorder each time.
   */
  const onAddModule = (defaults: RankedFormatJson["segment_pattern"][number]) => {
    if (!format) return;
    const at = addAt ?? format.segment_pattern.length;
    edit(insertSegmentAt(format, defaults, at));
    setAddAt(Math.min(at + 1, format.segment_pattern.length));
  };

  const onSave = async () => {
    if (!format) return;
    setSave({ kind: "saving" });
    try {
      const result = await saveFormatConfig(target, format);
      setRevision(result.revision);
      setSavedAt(result.saved_at);
      setBaseline(structuredClone(result.format));
      setFormat(structuredClone(result.format));
      setSave({ kind: "saved", revision: result.revision });
    } catch (err: unknown) {
      setSave({
        kind: "error",
        message: err instanceof RankedFormatApiError ? err.message : "Save failed.",
        code: err instanceof RankedFormatApiError ? err.code : null,
      });
    }
  };

  const storedConfigInvalid =
    loadError?.code === "RANKED_STORED_CONFIG_INVALID" ||
    (save.kind === "error" && save.code === "RANKED_STORED_CONFIG_INVALID");

  return (
    <AdminAuthGate>
      <div className="space-y-4" data-testid="ranked-format-builder">
        {/* ---- STICKY CONTROLS ----
            Everything needed while reading the list: which lane is being
            edited, adding to it, saving it, and what the last save was. All
            four used to be somewhere the list had to be scrolled past. */}
        <div
          className="sticky top-0 z-20 -mx-1 space-y-2 border-b border-border
            bg-background/95 px-1 pb-2 pt-1 backdrop-blur"
          data-testid="builder-toolbar"
        >
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Configuration target">
          {CONFIG_TARGETS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={target === option}
              data-testid={`target-${option}`}
              onClick={() => setTarget(option)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                target === option
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {TARGET_LABELS[option]}
            </button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 text-xs"
            onClick={() => setNonce((n) => n + 1)}
            aria-label="Reload configuration"
          >
            <RefreshCw className="h-3 w-3" /> Reload
          </Button>
        </div>

        {/* ---- public warning: informational, no gate ---- */}
        {target === "public" && (
          <p
            role="status"
            data-testid="public-target-warning"
            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            Saving this configuration affects new Public Ranked matches immediately.
          </p>
        )}

        {/* ---- add + save, always reachable ---- */}
        {format && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5" data-testid="add-module">
              <span className="text-[11px] text-muted-foreground">
                <Plus className="mr-0.5 inline h-3 w-3" />
                Add module:
              </span>
              {catalog?.modules.map((module) => (
                <Button
                  key={`${module.module_id}.v${module.module_version}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  data-testid={`add-${module.module_id}-v${module.module_version}`}
                  onClick={() => onAddModule(module.defaults)}
                >
                  {module.label}
                </Button>
              ))}
              {/* WHERE it lands. Defaults to the end, which is what the
                  previous append-only control always did. */}
              <select
                aria-label="Insert position for a new module"
                data-testid="add-position"
                className="h-7 rounded border border-border bg-background px-1 text-[11px]"
                value={addAt ?? format.segment_pattern.length}
                onChange={(e) => setAddAt(Number(e.target.value))}
              >
                {Array.from({ length: format.segment_pattern.length + 1 }, (_, i) => (
                  <option key={i} value={i}>
                    {i === format.segment_pattern.length ? "at end" : `at ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {dirty && save.kind !== "saving" && (
                <span className="text-[10px] text-muted-foreground" data-testid="dirty-label">
                  Unsaved changes
                </span>
              )}
              {save.kind === "saved" && (
                <span
                  role="status"
                  data-testid="save-success"
                  className="text-[11px] text-emerald-400"
                >
                  Saved as revision {save.revision}. New {TARGET_LABELS[target]} matches use
                  it from now on.
                </span>
              )}
              {save.kind === "error" && !storedConfigInvalid && (
                <span
                  role="alert"
                  data-testid="save-error"
                  className="text-[11px] text-destructive"
                >
                  {save.message}
                </span>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                data-testid="save-config"
                disabled={save.kind === "saving" || !dirty}
                onClick={() => void onSave()}
              >
                {save.kind === "saving" ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
        </div>

        {/* ---- the stored-config-invalid state, stated plainly ---- */}
        {storedConfigInvalid && (
          <p
            role="alert"
            data-testid="stored-config-invalid"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive-foreground"
          >
            <strong className="mr-1">This lane is not creating matches.</strong>
            {loadError?.code === "RANKED_STORED_CONFIG_INVALID"
              ? loadError.message
              : save.kind === "error"
                ? save.message
                : null}
          </p>
        )}

        <AdminPanel
          title="Ranked module cycle"
          description={catalog?.cycle_note ?? "Modules repeat in this order until the Ranked match ends."}
          testId="module-cycle-panel"
          action={
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span data-testid="revision-label">
                {revision === null ? "No saved configuration" : `Revision ${revision}`}
              </span>
              {savedAt && <span data-testid="saved-at-label">· {savedAt}</span>}
            </div>
          }
        >
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}

          {!loading && loadError && !storedConfigInvalid && (
            <p role="alert" data-testid="load-error" className="text-xs text-destructive">
              {loadError.message}
            </p>
          )}

          {!loading && format && (
            <>
              {revision === null && (
                <p className="mb-2 text-[10px] text-muted-foreground" data-testid="fallback-notice">
                  Nothing saved for {TARGET_LABELS[target]} yet — this is what the lane runs
                  today. Saving stores it as revision 1.
                </p>
              )}

              <ol className="space-y-2" data-testid="segment-list">
                {format.segment_pattern.map((segment, index) => {
                  const module = moduleFor(segment.module_id, segment.module_version);
                  return (
                    <SegmentRow
                      key={`${segment.module_id}-${index}`}
                      segment={segment}
                      index={index}
                      total={format.segment_pattern.length}
                      module={module}
                      onMoveUp={() => edit(moveSegmentUp(format, index))}
                      onMoveDown={() => edit(moveSegmentDown(format, index))}
                      onMoveTo={(to) => edit(moveSegmentTo(format, index, to))}
                      onRemove={() => edit(removeSegment(format, index))}
                      dragging={dragIndex === index}
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => setDragIndex(null)}
                      onDropOn={() => {
                        if (dragIndex !== null) edit(moveSegmentTo(format, dragIndex, index));
                        setDragIndex(null);
                      }}
                      onFieldChange={(key, value) => {
                        let next = setSegmentField(format, index, key, value);
                        if (key === "module_config.mastery_set_id") {
                          const setOptions = module?.fields.find((f) => f.key === key)?.options;
                          next = clampChallengeCountForMasterySet(next, index, setOptions, value);
                        }
                        if (module) {
                          // A tagged-union switch (Mastery Champion <-> Matchup)
                          // both reveals fields the config has never held and
                          // strands the previous branch's keys. The backend
                          // refuses a config carrying either problem, so
                          // normalize at the moment of the switch rather than
                          // letting the admin discover it as a save error.
                          next = normalizeSegmentConfig(next, index, module.fields);
                          next = fillVisibleDefaults(
                            next,
                            index,
                            module.fields,
                            module.defaults,
                          );
                        }
                        edit(next);
                      }}
                    />
                  );
                })}
              </ol>

            </>
          )}
        </AdminPanel>
      </div>
    </AdminAuthGate>
  );
}
