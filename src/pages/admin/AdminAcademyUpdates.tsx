// ---------------------------------------------------------------------------
// Admin · Academy Updates (WHATSNEW2).
//
// The owner's whole workflow for the /lol Hall's news channel: write a notice,
// publish it, withdraw it, delete it, and turn the surface on or off. None of
// it requires a commit, a deploy or a Lovable publish — every change here is
// database state, and the Hall reads that state on its next load.
//
// A child of the /admin layout route, so it inherits that route's AdminRoute
// gate; it is additionally wrapped in AdminAuthGate, exactly like
// /admin/platform-policies. NEITHER OF THOSE IS THE SECURITY BOUNDARY. Every
// write on this page goes to Postgres, where RLS on `public.academy_updates`
// and `public.app_settings` allows it only for has_role(auth.uid(),'admin').
// A non-admin who bypasses the client-side route reaches a database that
// refuses them, and cannot even SELECT a draft.
//
// No arbitrary settings writes: the switch only ever sends
// POLICY_KEYS.academyUpdatesEnabled with a `{enabled: boolean}` body this file
// constructs itself.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import SEOHead from "@/components/SEOHead";
import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import AcademyUpdates from "@/components/lol/AcademyUpdates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { POLICY_KEYS } from "@/lib/platform-policy/policy";
import { validateCtaHref, type AcademyUpdate } from "@/lib/lol/academy-updates";
import {
  createUpdate,
  deleteUpdate,
  listAllUpdatesForAdmin,
  readAcademyUpdatesEnabled,
  setUpdatePublished,
  updateUpdate,
  writeAcademyUpdatesEnabled,
  type AcademyUpdateRow,
} from "@/lib/lol/academy-updates-store";

export const ADMIN_ACADEMY_UPDATES_PATH = "/admin/academy-updates";

/** The form's fields. Kept as strings because that is what the inputs hold; the
 *  trimming and the validation happen once, on save. */
interface FormState {
  title: string;
  body: string;
  publish_date: string;
  cta_label: string;
  cta_href: string;
}

/** Today as `YYYY-MM-DD` in the browser's own calendar — a new notice is dated
 *  the day it is written unless the author says otherwise. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const EMPTY_FORM = (): FormState => ({
  title: "",
  body: "",
  publish_date: today(),
  cta_label: "",
  cta_href: "",
});

function formFromRow(row: AcademyUpdateRow): FormState {
  return {
    title: row.title ?? "",
    body: row.body ?? "",
    publish_date: row.publish_date ?? today(),
    cta_label: row.cta_label ?? "",
    cta_href: row.cta_href ?? "",
  };
}

/**
 * Everything that must be true before a notice may be saved.
 *
 * A notice with no title or no body is not a draft, it is an empty box — and
 * because publishing is one click from here, an empty box is one click from the
 * Hall. The CTA rule is deferred to the shared validator so the admin form and
 * the renderer cannot disagree about what a valid link is.
 */
function validateForm(form: FormState): string | null {
  if (!form.title.trim()) return "Give the update a title.";
  if (!form.body.trim()) return "Write the update's body.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.publish_date)) return "Choose a date.";
  const cta = validateCtaHref(form.cta_label, form.cta_href);
  if (!cta.ok) return cta.message ?? "That link cannot be used.";
  return null;
}

/** A live row rendered through the REAL Hall component, so the preview cannot
 *  drift from the thing visitors see. */
function previewUpdate(form: FormState): AcademyUpdate {
  const cta = validateCtaHref(form.cta_label, form.cta_href);
  return {
    id: "preview",
    date: form.publish_date,
    title: form.title.trim() || "Untitled update",
    body: form.body.trim(),
    published: true,
    ...(cta.ok && cta.cta ? { cta: cta.cta } : {}),
  };
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdminAcademyUpdates() {
  const [rows, setRows] = useState<AcademyUpdateRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [switchPending, setSwitchPending] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  /** `null` = the editor is closed. `"new"` = creating. Otherwise a row id. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowPending, setRowPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [list, flag] = await Promise.all([
      listAllUpdatesForAdmin(),
      readAcademyUpdatesEnabled(POLICY_KEYS.academyUpdatesEnabled),
    ]);
    // Report a failure rather than showing an empty list, which would otherwise
    // read as "nothing written yet" — the opposite conclusion.
    setLoadError(list.error ?? flag.error);
    setRows(list.rows);
    setEnabled(flag.enabled);
    setLoading(false);
  }, []);

  useEffect(() => {
    document.title = "Academy Updates · Admin";
    void load();
  }, [load]);

  const publishedCount = useMemo(() => rows.filter((r) => r.published).length, [rows]);
  /** What a visitor to /lol can see RIGHT NOW. Both conditions, because either
   *  one alone is enough to render nothing. */
  const liveToVisitors = enabled && publishedCount > 0;

  /**
   * Write the master switch. Not optimistic: the displayed state changes only
   * after the server confirms, so the page can never claim a feature is live
   * when the write was refused.
   */
  const applySwitch = async (next: boolean) => {
    if (switchPending) return;
    setSwitchPending(true);
    setSwitchError(null);
    const { error } = await writeAcademyUpdatesEnabled(POLICY_KEYS.academyUpdatesEnabled, next);
    if (error) {
      setSwitchPending(false);
      setSwitchError(
        /policy|permission|denied/i.test(error)
          ? "Not authorized to change global settings."
          : "Couldn't save. Nothing was changed.",
      );
      return;
    }
    const confirmed = await readAcademyUpdatesEnabled(POLICY_KEYS.academyUpdatesEnabled);
    setSwitchPending(false);
    if (confirmed.error) {
      setSwitchError("Saved, but couldn't confirm. Reload to verify.");
      return;
    }
    setEnabled(confirmed.enabled);
  };

  const openNew = () => {
    setEditing("new");
    setForm(EMPTY_FORM());
    setFormError(null);
  };

  const openEdit = (row: AcademyUpdateRow) => {
    setEditing(row.id);
    setForm(formFromRow(row));
    setFormError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setFormError(null);
  };

  const save = async () => {
    if (saving || !editing) return;
    const problem = validateForm(form);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError(null);
    const input = {
      title: form.title.trim(),
      body: form.body.trim(),
      publish_date: form.publish_date,
      // Blank means "no button", and NULL is how the database says that.
      cta_label: form.cta_label.trim() || null,
      cta_href: form.cta_href.trim() || null,
    };
    const { error } =
      editing === "new" ? await createUpdate(input) : await updateUpdate(editing, input);
    setSaving(false);
    if (error) {
      setFormError(
        /policy|permission|denied/i.test(error)
          ? "Not authorized to save Academy Updates."
          : "Couldn't save. Nothing was changed.",
      );
      return;
    }
    closeEditor();
    await load();
  };

  /**
   * Publish or withdraw. Publishing an empty notice is refused here as well as
   * in the editor, because the row could have been created before this rule
   * existed — a draft is allowed to be empty, a published notice is not.
   */
  const togglePublished = async (row: AcademyUpdateRow) => {
    if (rowPending) return;
    const next = !row.published;
    if (next && (!row.title?.trim() || !row.body?.trim())) {
      setRowError("Add a title and a body before publishing this update.");
      return;
    }
    setRowPending(row.id);
    setRowError(null);
    const { error } = await setUpdatePublished(row.id, next);
    setRowPending(null);
    if (error) {
      setRowError(
        /policy|permission|denied/i.test(error)
          ? "Not authorized to change Academy Updates."
          : "Couldn't save. Nothing was changed.",
      );
      return;
    }
    await load();
  };

  const remove = async (row: AcademyUpdateRow) => {
    if (rowPending) return;
    setRowPending(row.id);
    setRowError(null);
    const { error } = await deleteUpdate(row.id);
    setRowPending(null);
    if (error) {
      setRowError(
        /policy|permission|denied/i.test(error)
          ? "Not authorized to delete Academy Updates."
          : "Couldn't delete. Nothing was changed.",
      );
      return;
    }
    if (editing === row.id) closeEditor();
    await load();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <SEOHead
        title="Mogzy Admin · Academy Updates"
        description="Write, publish and withdraw the announcements shown on the Academy Hall."
        path={ADMIN_ACADEMY_UPDATES_PATH}
        noindex
      />

      <AdminAuthGate>
        <header className="mb-5 space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Megaphone className="h-5 w-5 text-primary" aria-hidden />
            Academy Updates
          </h1>
          <p className="text-xs text-muted-foreground">
            The announcements Mogzy shows on the Academy Hall at <code>/lol</code>.
            Everything on this page takes effect on a visitor&rsquo;s next page load —
            no deploy needed.
          </p>
        </header>

        {loading ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="academy-updates-loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading Academy
            Updates…
          </p>
        ) : (
          <div className="space-y-5">
            {loadError && (
              <p
                role="alert"
                data-testid="academy-updates-load-error"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                Couldn&rsquo;t load Academy Updates. What you see below may be incomplete.
              </p>
            )}

            {/* ── Status and the master switch ─────────────────────────────
                The one thing the owner must be able to read at a glance is
                whether users can currently see announcements — which is NOT the
                switch alone, because "on with nothing published" shows exactly
                as much as "off". So the status line states the conclusion, and
                the two facts behind it sit underneath it. */}
            <section
              className="rounded-lg border bg-card p-4"
              data-testid="academy-updates-status"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Status:</span>
                    <span
                      data-testid="academy-updates-state"
                      className={
                        enabled
                          ? "rounded-sm bg-emerald-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                          : "rounded-sm bg-muted px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                      }
                    >
                      {enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="academy-updates-visibility"
                  >
                    {liveToVisitors
                      ? `Visitors to /lol can see ${publishedCount} published update${
                          publishedCount === 1 ? "" : "s"
                        }.`
                      : enabled
                        ? "Visitors see nothing: the feature is on, but nothing is published yet."
                        : "Visitors see nothing: the feature is off."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Published updates: <strong>{publishedCount}</strong> · Drafts:{" "}
                    <strong>{rows.length - publishedCount}</strong>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* The switch is the most consequential control on the page,
                      so it carries a visible label as well as an accessible
                      one — an unlabelled toggle floating at the edge of a card
                      reads as decoration. */}
                  <Label htmlFor="academy-updates-switch" className="text-xs font-semibold">
                    Show on /lol
                  </Label>
                  {switchPending && (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  {enabled ? (
                    // Turning OFF needs no ceremony: it withdraws a surface,
                    // which is always the safe direction, and it is instantly
                    // reversible.
                    <Switch
                      id="academy-updates-switch"
                      aria-label="Academy Updates"
                      checked
                      disabled={switchPending}
                      onCheckedChange={() => void applySwitch(false)}
                    />
                  ) : (
                    // Turning ON is the one action here that puts something in
                    // front of every visitor, so it is confirmed — and the
                    // confirmation says what will actually happen, including
                    // the case where nothing is published and so nothing shows.
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Switch
                          id="academy-updates-switch"
                          aria-label="Academy Updates"
                          checked={false}
                          disabled={switchPending}
                        />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Turn Academy Updates on?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {publishedCount > 0
                              ? `Every visitor to /lol will see the Academy Updates mark, showing ${publishedCount} published update${
                                  publishedCount === 1 ? "" : "s"
                                }. Drafts stay hidden. You can turn this off again at any time.`
                              : "Nothing is published yet, so visitors will still see nothing until you publish an update. You can turn this off again at any time."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => void applySwitch(true)}>
                            Turn on
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {switchError && (
                <p
                  role="alert"
                  data-testid="academy-updates-switch-error"
                  className="mt-3 text-[11px] text-destructive"
                >
                  {switchError}
                </p>
              )}
            </section>

            {/* ── The list ─────────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Updates</h2>
                <Button size="sm" onClick={openNew} data-testid="academy-updates-new">
                  <Plus className="mr-1 h-4 w-4" aria-hidden /> New update
                </Button>
              </div>

              {rowError && (
                <p
                  role="alert"
                  data-testid="academy-updates-row-error"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {rowError}
                </p>
              )}

              {editing === "new" && (
                <Editor
                  heading="New update"
                  form={form}
                  setForm={setForm}
                  error={formError}
                  saving={saving}
                  onSave={() => void save()}
                  onCancel={closeEditor}
                />
              )}

              {rows.length === 0 ? (
                <p
                  className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground"
                  data-testid="academy-updates-empty"
                >
                  No updates yet. Write one — it starts as a draft, so nothing is shown
                  to visitors until you publish it.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border" data-testid="academy-updates-list">
                  {rows.map((row) => (
                    <li key={row.id} data-testid="academy-update-row" data-row-id={row.id}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                        <span
                          data-testid="academy-update-status"
                          className={
                            row.published
                              ? "shrink-0 rounded-sm bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                              : "shrink-0 rounded-sm border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                          }
                        >
                          {row.published ? "Published" : "Draft"}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatDate(row.publish_date)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {row.title?.trim() || (
                            <em className="text-muted-foreground">Untitled</em>
                          )}
                        </span>

                        <div className="flex shrink-0 items-center gap-1">
                          {rowPending === row.id && (
                            <Loader2
                              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                              aria-hidden
                            />
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(row)}
                            aria-label={`Edit ${row.title || "untitled update"}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={rowPending !== null}
                            onClick={() => void togglePublished(row)}
                            aria-label={
                              row.published
                                ? `Unpublish ${row.title || "untitled update"}`
                                : `Publish ${row.title || "untitled update"}`
                            }
                          >
                            {row.published ? (
                              <EyeOff className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={rowPending !== null}
                                aria-label={`Delete ${row.title || "untitled update"}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this update?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  “{row.title?.trim() || "Untitled"}” will be permanently
                                  removed. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void remove(row)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      {editing === row.id && (
                        <div className="border-t bg-muted/30 px-3 py-3">
                          <Editor
                            heading="Edit update"
                            form={form}
                            setForm={setForm}
                            error={formError}
                            saving={saving}
                            onSave={() => void save()}
                            onCancel={closeEditor}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Drafts are never sent to a visitor&rsquo;s browser — the database itself
                refuses to return them. Editing an existing update does not re-announce
                it; only publishing a new one makes the mark light up again.
              </span>
            </p>
          </div>
        )}
      </AdminAuthGate>
    </div>
  );
}

/**
 * The authoring form. Plain fields and a textarea — no rich text, by decision:
 * the Hall renders the body as text, so anything richer would be a promise the
 * surface does not keep.
 *
 * The preview mounts the REAL `AcademyUpdates` component rather than
 * re-implementing the notice, so there is nothing to keep in step. It uses the
 * mobile variant because that one is an ordinary block in the flow — the Hall
 * variant positions itself against Mogzy, who is not on this page.
 */
function Editor({
  heading,
  form,
  setForm,
  error,
  saving,
  onSave,
  onCancel,
}: {
  heading: string;
  form: FormState;
  setForm: (f: FormState) => void;
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4" data-testid="academy-updates-editor">
      <h3 className="text-sm font-semibold">{heading}</h3>

      <div className="space-y-1.5">
        <Label htmlFor="academy-update-title">Title</Label>
        <Input
          id="academy-update-title"
          value={form.title}
          maxLength={120}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="What changed, in a few words"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="academy-update-date">Date</Label>
        <Input
          id="academy-update-date"
          type="date"
          value={form.publish_date}
          onChange={(e) => set({ publish_date: e.target.value })}
          className="w-auto"
        />
        <p className="text-[11px] text-muted-foreground">
          Updates are shown newest first by this date.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="academy-update-body">Body</Label>
        <Textarea
          id="academy-update-body"
          value={form.body}
          rows={3}
          maxLength={600}
          onChange={(e) => set({ body: e.target.value })}
          placeholder="One or two plain sentences. Say what a player can now do."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="academy-update-cta-label">Button label (optional)</Label>
          <Input
            id="academy-update-cta-label"
            value={form.cta_label}
            maxLength={40}
            onChange={(e) => set({ cta_label: e.target.value })}
            placeholder="Open Ranked"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="academy-update-cta-href">Button link (optional)</Label>
          <Input
            id="academy-update-cta-href"
            value={form.cta_href}
            onChange={(e) => set({ cta_href: e.target.value })}
            placeholder="/lol/ranked or https://…"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="academy-updates-form-error"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Saving keeps this a draft. Publish it from the list.
        </span>
      </div>

      <div className="space-y-1.5 border-t pt-3" data-testid="academy-updates-preview">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </p>
        <p className="text-[11px] text-muted-foreground">
          The real Academy Updates surface, with this update in it. Click the row to
          open the notice.
        </p>
        <div className="rounded-md bg-[#221a12] p-3">
          <AcademyUpdates
            variant="mobile"
            enabled
            updates={[previewUpdate(form)]}
            mobileWrapperClassName=""
          />
        </div>
      </div>
    </div>
  );
}
