/**
 * ROG1-D1 — DEVELOPMENT-ONLY preview of the Worlds Dynasty page at
 * `/dev/dynasty` (the route is registered only under `import.meta.env.DEV`).
 *
 * It mounts the real `/admin/dynasty` page with the RECORDED-PATH fixture
 * transport: real ROG1-C1 backend responses replayed in order. Nothing is
 * computed in the browser; only the recorded choice can be applied, and the
 * note above the board says what that choice is.
 *
 *   ?scenario=full   draft → relic → lineup → 4-3 win with a re-roll (default)
 *   ?scenario=loss   ready lineup → 3-4 loss
 *   ?scenario=stomp  ready lineup → 7-0 win
 *   ?delay=ms        artificial latency per call
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DYNASTY_SCENARIOS, createFixtureTransport, type DynastyScenario } from "@/lib/dynasty/fixtureTransport";
import DynastyRunPage from "@/pages/admin/dynasty/DynastyRunPage";

export default function DynastyPreview() {
  const [params] = useSearchParams();
  const raw = params.get("scenario") ?? "full";
  const scenario: DynastyScenario = raw in DYNASTY_SCENARIOS ? (raw as DynastyScenario) : "full";
  const delayMs = Number(params.get("delay") ?? 0) || 0;
  const transport = useMemo(() => createFixtureTransport(DYNASTY_SCENARIOS[scenario], { delayMs }), [scenario, delayMs]);
  const storageKey = useMemo(() => {
    const key = `mogzy.dynasty.preview.${scenario}`;
    try { window.localStorage.removeItem(key); } catch { /* no storage */ }
    return key;
  }, [scenario]);

  return (
    <DynastyRunPage
      key={scenario}
      transport={transport}
      storageKey={storageKey}
      topSlot={() => {
        const next = transport.nextRecorded();
        return (
          <p className="rounded-lg border border-sky-400/25 bg-sky-400/[0.06] px-3 py-1.5 text-[11.5px] text-sky-100/80" data-testid="dynasty-preview-note">
            DEV preview · recorded backend run ({DYNASTY_SCENARIOS[scenario].scenario}).{" "}
            {next ? <>Next recorded choice: <code>{next.kind}</code> <code>{JSON.stringify(next.payload)}</code></> : "End of the recording."}
          </p>
        );
      }}
    />
  );
}
