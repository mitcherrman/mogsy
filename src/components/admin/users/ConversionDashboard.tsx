// ---------------------------------------------------------------------------
// ADMIN CONVERSION V2 (CV4) — ordered conversion and drop-off, Admin › Users.
//
// Every number comes from lib/admin/analytics/conversion.ts over the dataset
// the page has ALREADY narrowed to the traffic population. Three panels, two
// units (browsers, accounts), never summed and never drawn as one chain.
//
// D-6 (handoff §10): browser attribution coverage for server-confirmed plays
// has not been established from production, so the server-play step is left
// out of the ordered chain and shown as unavailable. The coverage of the rows
// in this read is printed as context, never used as a rate.
// ---------------------------------------------------------------------------

import { useMemo, type ReactNode } from "react";
import { AdminPanel } from "@/components/admin/shell/AdminAreaPage";
import {
  BROWSER_CONVERSION_WINDOW_MS,
  computeAccountActivation,
  computeBrowserConversion,
  computeSignupForm,
  type ConversionStep,
} from "@/lib/admin/analytics/conversion";
import { formatRate, MIN_RATE_SAMPLE, type Rate } from "@/lib/admin/analytics/metrics";
import { DAY_MS } from "@/lib/admin/analytics/range";
import { Kind, Metric, MetricGrid, Table, Unavailable, type SectionProps } from "./AudienceSections";

/** How many ids an evidence list shows before "and N more". */
export const EVIDENCE_LIMIT = 30;

const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

/** An expandable list of the units behind a number. Browsers open their record. */
export function Evidence({
  ids,
  unit,
  onVisitor,
  testId,
}: {
  ids: Set<string>;
  unit: "browser" | "account";
  onVisitor?: (id: string) => void;
  testId?: string;
}) {
  if (ids.size === 0) return <span className="text-muted-foreground">—</span>;
  const list = [...ids].sort().slice(0, EVIDENCE_LIMIT);
  const noun = unit === "browser" ? (ids.size === 1 ? "browser" : "browsers") : ids.size === 1 ? "account" : "accounts";
  return (
    <details data-testid={testId}>
      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
        {ids.size} {noun}
      </summary>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
        {list.map((id) => (
          <li key={id} className="font-mono text-[10px]">
            {unit === "browser" && onVisitor ? (
              <button
                type="button"
                onClick={() => onVisitor(id)}
                className="underline decoration-dotted underline-offset-2 hover:text-primary"
                title={`Open browser ${id}`}
              >
                {shortId(id)}
              </button>
            ) : (
              <span title={id}>{shortId(id)}</span>
            )}
          </li>
        ))}
      </ul>
      {ids.size > list.length && (
        <p className="mt-1 text-[10px] text-muted-foreground">…and {ids.size - list.length} more</p>
      )}
    </details>
  );
}

/** A proportional bar for a step's cumulative share. Hidden below the sample floor. */
function ShareBar({ rate }: { rate: Rate }) {
  if (rate.denominator < MIN_RATE_SAMPLE || rate.denominator === 0) return null;
  const pct = Math.round((rate.numerator / rate.denominator) * 100);
  return (
    <div className="mt-1 h-1 w-24 overflow-hidden rounded bg-muted" aria-hidden>
      <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

function UnavailableNote({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

const days = (ms: number) => `${Math.round(ms / DAY_MS)} days`;

export function ConversionDashboard({
  loaded,
  range,
  now,
  onVisitor,
}: SectionProps & { onVisitor?: (id: string) => void }) {
  const bounds = useMemo(() => ({ start: range.start, end: range.end }), [range]);
  const options = useMemo(() => ({ truncated: loaded.truncated }), [loaded]);
  const browser = useMemo(
    () => computeBrowserConversion(loaded.dataset, bounds, now, { ...options, excludeServerPlay: true }),
    [loaded, bounds, now, options],
  );
  const signup = useMemo(() => computeSignupForm(loaded.dataset, bounds, now, options), [loaded, bounds, now, options]);
  const accounts = useMemo(
    () => computeAccountActivation(loaded.dataset, bounds, now, options),
    [loaded, bounds, now, options],
  );

  const stepRow = (s: ConversionStep, k: number) => [
    <span key="l" className="font-medium" data-testid={`conversion-step-${s.id}`}>
      {k + 1}. {s.label}
    </span>,
    <div key="r">
      <span className="tabular-nums">{s.reached.size}</span>
      <ShareBar rate={s.cumulativeRate} />
    </div>,
    s.stepRate === null ? "—" : formatRate(s.stepRate),
    formatRate(s.cumulativeRate),
    k === browser.steps.length - 1 ? "—" : <Evidence key="d" ids={s.dropped} unit="browser" onVisitor={onVisitor} testId={`conversion-dropped-${s.id}`} />,
    k === 0 ? "—" : <Evidence key="e" ids={s.enteredLater} unit="browser" onVisitor={onVisitor} testId={`conversion-later-${s.id}`} />,
    <Evidence key="x" ids={s.reached} unit="browser" onVisitor={onVisitor} testId={`conversion-reached-${s.id}`} />,
    <span key="def" className="text-muted-foreground">{s.definition}</span>,
  ];

  const coverage = browser.serverPlayCoverage;

  return (
    <section aria-label="Conversion" className="space-y-4" data-testid="conversion-dashboard">
      <div>
        <h2 className="text-sm font-semibold">Conversion and drop-off</h2>
        <p className="text-[11px] text-muted-foreground">
          Ordered: a step counts only if it happened after the previous one, inside each unit's own window. Units whose
          window has not finished are left out of every rate. Browsers and accounts are separate units and are never
          added together. These rates are lower than the reach counts under Advanced analytics, which ignore order.
        </p>
      </div>

      <AdminPanel
        title="Browser conversion (new browsers, ordered)"
        description={`Browsers first seen in range, followed for ${days(BROWSER_CONVERSION_WINDOW_MS)}. ${browser.cohort.size} first seen · ${browser.eligible.size} with a full window · ${browser.tooRecent.size} too recent. A browser is a stored id, not a person. Percentages appear from ${MIN_RATE_SAMPLE} browsers.`}
        testId="conversion-browser"
      >
        {browser.unavailableReason ? (
          <UnavailableNote testId="conversion-browser-unavailable">{browser.unavailableReason}</UnavailableNote>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><Kind kind="browser" /> every step below</span>
            </div>
            <Table
              testId="conversion-browser-table"
              head={["Step", "Reached", "From previous", "Of entered", "Dropped here", "Entered later", "Evidence", "Definition"]}
              rows={browser.steps.map(stepRow)}
              empty="No browsers were first seen in this range."
            />
            <div className="mt-3 rounded-md border border-dashed border-border p-3 text-[11px]" data-testid="conversion-server-play-unavailable">
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                <Kind kind="railway" /> Server-confirmed play: <Unavailable>Unavailable</Unavailable>
              </p>
              <p className="mt-1 text-muted-foreground">
                A server play can be tied to a browser only through a visitor or session id recorded on the server row.
                How often production rows carry one has not been measured, so this step is left out of the chain rather
                than shown as a rate that may mostly reflect missing ids. In this read, {coverage.correlated} of{" "}
                {coverage.total} server-confirmed starts carry a browser id (context only). Daily Challenge play per
                browser depends on the same link and is unavailable for the same reason.
              </p>
            </div>
          </>
        )}
      </AdminPanel>

      <AdminPanel
        title="Signup form (ordered, 24 hours)"
        description={`Browsers whose first signup screen view is in range. ${signup.eligible.size} with a full 24 h window · ${signup.tooRecent.size} too recent.`}
        testId="conversion-signup"
      >
        {signup.unavailableReason ? (
          <UnavailableNote testId="conversion-signup-unavailable">{signup.unavailableReason}</UnavailableNote>
        ) : (
          <div className="space-y-3">
            <MetricGrid>
              <Metric id="conv-signup-viewed" label="Viewed signup" value={signup.eligible.size} />
              <Metric id="conv-signup-submitted" label="Submitted after viewing" value={signup.submitted.size} definition={`${formatRate(signup.viewToSubmit)} of viewers`} />
              <Metric id="conv-signup-created" label="Created after submitting" value={signup.created.size} definition={`${formatRate(signup.submitToCreate)} of submitters · ${formatRate(signup.viewToCreate)} of viewers`} />
              <Metric id="conv-signup-origin" label="Guest upgrades / direct" value={`${signup.createdFromGuest} / ${signup.createdDirect}`} definition={signup.createdUnknownOrigin ? `${signup.createdUnknownOrigin} origin unrecorded` : "By the completion row's upgraded_from_guest."} />
            </MetricGrid>
            <Table
              testId="conversion-signup-surfaces"
              head={["Entry surface", "Viewed", "Submitted", "Created"]}
              rows={signup.bySurface.map((r) => [r.entrySurface, r.viewed, r.submitted, r.created])}
              empty="No signup screen views with a full window in this range."
            />
            <div className="grid gap-3 text-[11px] md:grid-cols-3">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Viewed, did not submit</p>
                <Evidence ids={new Set([...signup.eligible].filter((v) => !signup.submitted.has(v)))} unit="browser" onVisitor={onVisitor} testId="conversion-signup-no-submit" />
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Submitted, not created</p>
                <Evidence ids={new Set([...signup.submitted].filter((v) => !signup.created.has(v)))} unit="browser" onVisitor={onVisitor} testId="conversion-signup-no-create" />
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Created with no signup view in that browser</p>
                <Evidence ids={signup.completedWithoutView} unit="browser" onVisitor={onVisitor} testId="conversion-signup-no-view" />
                <p className="mt-1 text-[10px] text-muted-foreground">For example, a guest upgrade from a panel outside the signup page. Not part of any rate.</p>
              </div>
            </div>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Account activation (registered accounts)"
        description={`Accounts whose first signup_completed is in range (the same anchor as the account retention lens): ${accounts.cohort.size}. Play is server-confirmed only. Accounts created before signup tracking are in no cohort.`}
        testId="conversion-accounts"
      >
        {accounts.unavailableReason ? (
          <UnavailableNote testId="conversion-accounts-unavailable">{accounts.unavailableReason}</UnavailableNote>
        ) : (
          <Table
            testId="conversion-accounts-table"
            head={["Measure", "Accounts", "Rate", "Too recent", "Evidence", "Definition"]}
            rows={[
              [
                <span key="l" className="font-medium">Played before signing up</span>,
                accounts.playedBeforeSignup.size,
                formatRate(accounts.playedBeforeSignupRate),
                "—",
                <Evidence key="e" ids={accounts.playedBeforeSignup} unit="account" />,
                <span key="d" className="text-muted-foreground">
                  Guest upgrades only ({accounts.guestUpgrades.size}): a server-confirmed guest start received before signup. Only history inside this range is visible, so this is a floor.
                </span>,
              ],
              [
                <span key="l" className="font-medium">Played within 7 days</span>,
                accounts.activated.size,
                formatRate(accounts.activatedRate),
                accounts.activationTooRecent.size,
                <Evidence key="e" ids={accounts.activated} unit="account" />,
                <span key="d" className="text-muted-foreground">A server-confirmed signed-in start in the 7 days from signup.</span>,
              ],
              [
                <span key="l" className="font-medium">Played again (day 1–8)</span>,
                accounts.playedAgain.size,
                formatRate(accounts.playedAgainRate),
                accounts.playedAgainTooRecent.size,
                <Evidence key="e" ids={accounts.playedAgain} unit="account" />,
                <span key="d" className="text-muted-foreground">A server-confirmed signed-in start 24 hours to 8 days after signup.</span>,
              ],
              [
                <span key="l" className="font-medium">Email confirmed</span>,
                <Unavailable key="u">Not applicable</Unavailable>,
                "—",
                "—",
                "—",
                <span key="d" className="text-muted-foreground" data-testid="conversion-email-na">{accounts.emailConfirmation.reason}</span>,
              ],
            ]}
          />
        )}
      </AdminPanel>
    </section>
  );
}
