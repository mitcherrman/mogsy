import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CompositionLabPanel } from "@/components/admin/CompositionLabPanel";
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";
import {
  DAILY_FORMAT_LABEL, fetchThreeActsStatus, isDailyFormatId,
  type DailyFormatId, type ThreeActsStatus,
} from "@/lib/daily-challenge/run/dailyFormatAdmin";

type Journey = {
  recipe_id: string;
  recipe_version: number;
  title: string;
  role: string;
  status: string;
};

const LAST_CHOICE = "mogzy.creator-replay.journey-choice.v1";
const LAST_FORMAT = "mogzy.creator-replay.format.v1";

/** Creator-only full Daily filming, with an exact server-approved Journey. */
export default function CreatorReplayPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState(() => {
    try { return localStorage.getItem(LAST_CHOICE) || ""; }
    catch { return ""; }
  });

  useEffect(() => {
    let active = true;
    const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/creator/journeys`;
    (async () => {
      try {
        const response = await fetch(url, { headers: await buildAdminHeaders(url) });
        if (!response.ok) throw new Error(`Unable to load Journey matchups (${response.status})`);
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object" || !("journeys" in payload)
            || !Array.isArray(payload.journeys)) throw new Error("Invalid Journey catalog");
        const list = payload.journeys as Journey[];
        if (active) setJourneys(list.filter((j) =>
          typeof j.recipe_id === "string" && typeof j.title === "string"
          && typeof j.role === "string"));
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Unable to load Journeys");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // The admin take's Daily format. Only this owner's next take; the PUBLIC
  // Daily format is a separate server setting (Platform Policies).
  const [format, setFormat] = useState<DailyFormatId>(() => {
    try {
      const stored = localStorage.getItem(LAST_FORMAT);
      return isDailyFormatId(stored) ? stored : "classic_v1";
    } catch { return "classic_v1"; }
  });
  const [threeActsStatus, setThreeActsStatus] = useState<ThreeActsStatus | null>(null);
  const [threeActsStatusError, setThreeActsStatusError] = useState<string | null>(null);
  useEffect(() => {
    if (format !== "three_acts_v2" || threeActsStatus) return;
    let active = true;
    fetchThreeActsStatus()
      .then((status) => { if (active) setThreeActsStatus(status); })
      .catch((err) => { if (active) setThreeActsStatusError(err instanceof Error ? err.message : "Unable to read the three-act status."); });
    return () => { active = false; };
  }, [format, threeActsStatus]);
  function chooseFormat(next: DailyFormatId) {
    setFormat(next);
    try { localStorage.setItem(LAST_FORMAT, next); } catch { /* optional preference */ }
  }

  const roles = ["top", "jungle", "mid", "bot", "support"];
  const validSelection = selection === "__auto__" || journeys.some((j) => j.recipe_id === selection);

  // Daily three acts (V2) — an owner-only take of the three-act Standard,
  // behind the server flag. The server answers 404 while the flag is off; the
  // take then plays through the same creator run page as any filming take.
  const [threeActsBusy, setThreeActsBusy] = useState(false);
  const [threeActsMessage, setThreeActsMessage] = useState<string | null>(null);
  async function createThreeActsRun() {
    setThreeActsBusy(true);
    setThreeActsMessage(null);
    try {
      const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/three-acts`;
      const response = await fetch(url, { method: "POST", headers: await buildAdminHeaders(url) });
      if (response.status === 404) {
        setThreeActsMessage("Daily three acts is not enabled on this server.");
        return;
      }
      if (!response.ok) throw new Error(`Three-act take request failed (${response.status})`);
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !("run_id" in json)
          || typeof json.run_id !== "string" || !/^dr_[a-f0-9]{24}$/.test(json.run_id)) {
        throw new Error("The Daily service returned an invalid run.");
      }
      navigate(`/quiz/daily-challenge/creator/${json.run_id}`);
    } catch (err) {
      setThreeActsMessage(err instanceof Error ? err.message : "Unable to start a three-act take.");
    } finally {
      setThreeActsBusy(false);
    }
  }

  async function createRun() {
    if (loading || !validSelection || !journeys.length) return;
    setBusy(true);
    setError(null);
    try {
      const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/creator`;
      const response = await fetch(url, {
        method: "POST",
        headers: { ...(await buildAdminHeaders(url)), "Content-Type": "application/json" },
        body: JSON.stringify({ journey_recipe_id: selection === "__auto__" ? null : selection }),
      });
      if (!response.ok) {
        let message = `Creator replay request failed (${response.status})`;
        try {
          const payload: unknown = await response.json();
          if (payload && typeof payload === "object" && "detail" in payload) {
            const detail = payload.detail;
            if (detail && typeof detail === "object" && "message" in detail
                && typeof detail.message === "string") message = detail.message;
          }
        } catch { /* retain the HTTP status */ }
        throw new Error(message);
      }
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !("run_id" in json)
          || typeof json.run_id !== "string" || !/^dr_[a-f0-9]{24}$/.test(json.run_id)) {
        throw new Error("The Daily service returned an invalid run.");
      }
      navigate(`/quiz/daily-challenge/creator/${json.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create replay.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto w-full max-w-3xl space-y-5 p-6" data-testid="creator-replay-studio">
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Creator Replay</h1>
      <p className="text-sm text-muted-foreground">Play or film the full Daily Challenge as often as you like, in either format. Every take is unofficial: your official attempt, score, streak and history stay separate, and take matches remain unrated.</p>
    </div>
    <fieldset className="space-y-2 rounded-lg border p-5" data-testid="creator-format-picker">
      <legend className="px-1 text-sm font-semibold">Daily format for this take</legend>
      {(["classic_v1", "three_acts_v2"] as const).map((id) => (
        <label key={id} className="flex items-start gap-2 text-sm">
          <input type="radio" name="creator-format" value={id} checked={format === id}
            onChange={() => chooseFormat(id)} data-testid={`creator-format-${id}`} className="mt-1" />
          <span>
            <span className="font-semibold">{DAILY_FORMAT_LABEL[id]}</span>
            <span className="block text-xs text-muted-foreground">
              {id === "classic_v1"
                ? "Today's ten-module Daily with a Mastery Journey of your choice."
                : "Six Easy/Medium/Hard sets and one Meta Reflex sprint, in three acts."}
            </span>
          </span>
        </label>
      ))}
      <p className="text-xs text-muted-foreground">
        This only chooses your take. Public players' format is set separately in{" "}
        <Link className="underline" to="/admin/platform-policies">Platform Policies</Link>.
      </p>
    </fieldset>
    {format === "classic_v1" && <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Choose your Mastery Journey</h2>
        <p className="text-sm text-muted-foreground">Choose which matchup to film in module 10. You can explicitly use today’s official selection, or pick any approved Journey. We remember your choice next time.</p>
      </div>
      <label htmlFor="creator-journey" className="text-sm font-semibold">Matchup</label>
      <select
        id="creator-journey"
        data-testid="creator-journey-picker"
        className="w-full rounded-lg border bg-background p-3 text-foreground"
        disabled={busy || loading || !journeys.length}
        value={validSelection ? selection : ""}
        onChange={(event) => {
          setSelection(event.target.value);
          try { localStorage.setItem(LAST_CHOICE, event.target.value); } catch { /* optional preference */ }
        }}
      >
        <option value="" disabled>Select a matchup to film…</option>
        <option value="__auto__">Today’s official matchup (repeat today’s Daily)</option>
        {roles.map((role) => <optgroup key={role} label={role === "bot" ? "Bot" : role.charAt(0).toUpperCase() + role.slice(1)}>
          {journeys.filter((j) => j.role === role).map((journey) =>
            <option key={journey.recipe_id} value={journey.recipe_id}>
              {journey.title}{journey.status === "p1_ready" ? " · Approved" : ""}
            </option>)}
        </optgroup>)}
      </select>
      {loading && <p className="text-sm text-muted-foreground">Loading approved matchups…</p>}
      {!validSelection && !loading && <p className="text-sm text-muted-foreground">{selection ? "Your previous matchup is no longer available. Select another." : "Choose a matchup above to enable recording."}</p>}
      <p className="text-xs text-muted-foreground">Starting a fresh take ends only your previous unfinished filming match. It cannot reset your official Daily or Ranked games.</p>
      <Button onClick={createRun} disabled={busy || loading || !validSelection || !journeys.length} data-testid="creator-replay-new">
        {busy ? "Creating take…" : "Record a new take"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
    {format === "three_acts_v2" && <div className="space-y-3 rounded-lg border p-5" data-testid="three-acts-take">
      <div>
        <h2 className="text-lg font-semibold">Three Acts Daily V2 (owner preview)</h2>
        <p className="text-sm text-muted-foreground">Play the three-act Daily as a separate, unofficial take — as many times as you like. Your official Daily, history and stats are untouched.</p>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="three-acts-server-status">
        {threeActsStatus
          ? threeActsStatus.ownerTakesEnabled
            ? `Enabled on this server (${threeActsStatus.certificationScope} content scope)${threeActsStatus.composes === false ? " — but today's bank does not compose a full day." : "."}`
            : "Not enabled on this server yet: the backend's owner flag (DAILY_THREE_ACTS_V2=owner) is off."
          : threeActsStatusError ?? "Checking the server…"}
      </p>
      <Button variant="outline" onClick={createThreeActsRun}
        disabled={threeActsBusy || threeActsStatus?.ownerTakesEnabled === false} data-testid="three-acts-new">
        {threeActsBusy ? "Starting…" : "Play a three-act take"}
      </Button>
      {threeActsMessage && <p role="status" className="text-sm text-muted-foreground">{threeActsMessage}</p>}
    </div>}
    {/* Owner analysis: sample compositions and the answer CSV, no gameplay. */}
    <CompositionLabPanel />
    <Link className="text-sm underline" to="/admin/leaguecraft">Back to Leaguecraft Admin</Link>
  </main>;
}
