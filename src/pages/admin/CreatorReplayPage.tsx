import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

type Journey = {
  recipe_id: string;
  recipe_version: number;
  title: string;
  role: string;
  status: string;
};

const LAST_CHOICE = "mogzy.creator-replay.journey-choice.v1";

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

  const roles = ["top", "jungle", "mid", "bot", "support"];
  const validSelection = selection === "" || journeys.some((j) => j.recipe_id === selection);

  async function createRun() {
    if (loading || !validSelection || !journeys.length) return;
    setBusy(true);
    setError(null);
    try {
      const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/creator`;
      const response = await fetch(url, {
        method: "POST",
        headers: { ...(await buildAdminHeaders(url)), "Content-Type": "application/json" },
        body: JSON.stringify({ journey_recipe_id: selection || null }),
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
      <p className="text-sm text-muted-foreground">Film the full Daily Challenge as often as you like. Your official attempt stays separate, and filming matches remain unrated.</p>
    </div>
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Choose your Mastery Journey</h2>
        <p className="text-sm text-muted-foreground">Select the exact matchup for module 10, or use today's official selection. Your choice is remembered for your next filming session.</p>
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
        <option value="">Today's official matchup (automatic)</option>
        {roles.map((role) => <optgroup key={role} label={role === "bot" ? "Bot" : role.charAt(0).toUpperCase() + role.slice(1)}>
          {journeys.filter((j) => j.role === role).map((journey) =>
            <option key={journey.recipe_id} value={journey.recipe_id}>
              {journey.title}{journey.status === "p1_ready" ? " · Approved" : ""}
            </option>)}
        </optgroup>)}
      </select>
      {loading && <p className="text-sm text-muted-foreground">Loading approved matchups…</p>}
      {!validSelection && !loading && <p className="text-sm text-destructive">Previously chosen matchup is no longer available. Select another.</p>}
      <p className="text-xs text-muted-foreground">Starting a fresh take ends only your previous unfinished filming match. It cannot reset your official Daily or Ranked games.</p>
      <Button onClick={createRun} disabled={busy || loading || !validSelection || !journeys.length} data-testid="creator-replay-new">
        {busy ? "Creating take…" : "Record a new take"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <Link className="text-sm underline" to="/admin/leaguecraft">Back to Leaguecraft Admin</Link>
  </main>;
}
