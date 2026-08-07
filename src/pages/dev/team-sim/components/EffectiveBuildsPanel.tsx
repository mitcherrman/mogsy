/**
 * "What was simulated" — `effective_builds`, the authoritative record of the
 * builds the engine actually constructed, plus the catalog-digest agreement
 * check.
 *
 * The digest comparison is the point of this panel. The catalog that built the
 * request and the catalog the engine executed against are separate loads of
 * the same data; if they disagree, the result is still valid and is still
 * shown, but the operator is told the vocabulary changed underneath the
 * scenario. Nothing re-runs on its own.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import {
  digestReport,
  effectiveBuildEntries,
  formatNumber,
  orderedRuntimeIds,
} from "@/lib/combat-lab/team-sim/result";

export function EffectiveBuildsPanel({
  response,
  configuredDigest,
  loadedDigest,
  onRefreshCatalog,
  refreshing,
}: {
  response: TeamSimulationResponse;
  /**
   * Null when this page did not configure the request — a result collected by
   * Phase 4E recovery id. The comparison is then reported as unavailable, not
   * as agreement.
   */
  configuredDigest: string | null;
  loadedDigest: string | null;
  onRefreshCatalog: () => void;
  refreshing: boolean;
}) {
  const report = digestReport(response, configuredDigest, loadedDigest);
  const entries = effectiveBuildEntries(response);
  // A combatant the engine summarised but did not report a build for would
  // otherwise just be absent from this panel — silence reading as agreement.
  const missingBuilds = orderedRuntimeIds(response).filter(
    (id) => !(id in response.effective_builds)
  );

  return (
    <Card className="space-y-3 p-3" data-testid="effective-builds">
      <header>
        <h2 className="text-sm font-semibold">What was simulated</h2>
        <p className="text-[11px] text-muted-foreground">
          Reported by the engine from the runtime combatants it built — not
          re-derived from the request.
        </p>
      </header>

      {report.executionMismatch ? (
        <div
          className="space-y-1 rounded border border-amber-500/60 bg-amber-500/10 p-2 text-xs"
          data-testid="digest-mismatch"
        >
          <p className="font-medium">Catalog changed between configuration and execution.</p>
          <p className="text-[11px]">
            Configured against <code className="font-mono">{report.configuredDigest}</code>;
            executed against{" "}
            <code className="font-mono">
              {report.responseDigests.map((d) => d || "(none)").join(", ") || "—"}
            </code>
            . The result below is valid and is kept as returned. Refresh the catalog
            before configuring the next scenario.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={refreshing}
            onClick={onRefreshCatalog}
          >
            {refreshing ? "Refreshing…" : "Refresh catalog"}
          </Button>
        </div>
      ) : report.configuredDigest === null ? (
        // Phase 4E: recovered from the server, so the catalog this scenario
        // was CONFIGURED against was never seen by this browser. Checked ahead
        // of pageDrift because both of the branches below name a configured
        // digest, and there is not one — reporting the executed digest in its
        // place would invent an agreement between a known value and an
        // unknown one.
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="digest-unknown"
        >
          Recovered result. It executed against catalog{" "}
          <code className="font-mono">
            {report.responseDigests.map((d) => d || "(none)").join(", ") || "—"}
          </code>
          ; the catalog it was originally configured against is not known to
          this browser, so the two cannot be compared.
          {report.pageDrift ? (
            <>
              {" "}
              The page has since loaded{" "}
              <code className="font-mono">{report.loadedDigest}</code>.
            </>
          ) : null}
        </p>
      ) : report.pageDrift ? (
        // Not a defect in the result: configuration and execution agreed, and
        // the page has simply loaded a newer catalog since. Refreshing again
        // cannot clear it, so no refresh button is offered here.
        <p
          className="rounded border border-border bg-muted/40 p-2 text-[11px]"
          data-testid="digest-page-drift"
        >
          This result ran on catalog{" "}
          <code className="font-mono">{report.configuredDigest}</code>, which every
          effective build confirms. The page has since loaded{" "}
          <code className="font-mono">{report.loadedDigest}</code> — run again to
          simulate against the newer catalog.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground" data-testid="digest-match">
          Catalog digest <code className="font-mono">{report.configuredDigest}</code> matched
          on every effective build.
        </p>
      )}

      {missingBuilds.length > 0 ? (
        <p className="text-[11px] text-destructive" data-testid="missing-effective-builds">
          The response reported no effective build for {missingBuilds.join(", ")} — what
          the simulator used for {missingBuilds.length === 1 ? "it" : "them"} is unknown.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {entries.map(([id, build]) => (
          <div
            key={id}
            className="rounded border border-border p-2 text-xs"
            data-testid={`effective-build-${id}`}
          >
            <h3 className="font-semibold">
              <span className="rounded bg-primary/15 px-1 font-mono text-[11px]">{id}</span>{" "}
              {build.champion} · level {build.level}
            </h3>
            <dl className="mt-1 space-y-0.5 text-[11px]">
              <Row
                label="Items"
                value={
                  build.items.length
                    ? build.items
                        .map((item) => (item.item_id ? `${item.name} (${item.item_id})` : item.name))
                        .join(", ")
                    : "none"
                }
              />
              <Row label="Runes" value={build.runes.length ? build.runes.join(", ") : "none"} />
              <Row
                label="Ability ranks"
                value={Object.entries(build.ability_ranks)
                  .map(([slot, rank]) => `${slot}${rank}`)
                  .join(" ")}
              />
              <Row label="Crit mode" value={build.crit_mode} />
              <Row
                label="Starting HP"
                value={`${formatNumber(build.starting_hp)} (${build.starting_hp_source}) · max ${formatNumber(build.max_hp)}`}
              />
              <Row
                label="Data version"
                value={`patch ${build.data_version.patch ?? "—"} · digest ${build.data_version.catalog_digest}`}
              />
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="flex-1 break-words">{value}</dd>
    </div>
  );
}
