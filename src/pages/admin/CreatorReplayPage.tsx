import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ADMIN_API_BASE_URL, buildAdminHeaders } from "@/lib/admin-auth/adminCredentials";

/** A deliberate click creates one independent, owner-only filming run. */
export default function CreatorReplayPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function createRun() {
    setBusy(true);
    setError(null);
    try {
      const url = `${ADMIN_API_BASE_URL}/api/daily-run/admin/creator`;
      const response = await fetch(url, {
        method: "POST",
        headers: await buildAdminHeaders(url),
      });
      if (!response.ok) throw new Error(`Creator replay request failed (${response.status})`);
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || !("run_id" in json)
          || typeof json.run_id !== "string" || !/^dr_[a-f0-9]{24}$/.test(json.run_id)) {
        throw new Error("The Daily service returned an invalid run.");
      }
      navigate(`/admin/creator-replay/${json.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create replay.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="mx-auto w-full max-w-3xl space-y-5 p-6" data-testid="creator-replay-studio">
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">Creator Replay</h1>
      <p className="text-sm text-muted-foreground">Record another Daily Challenge without resetting your official attempt. Each take has a separate run and remains unrated.</p>
    </div>
    <div className="rounded-lg border p-5 space-y-4">
      <h2 className="text-lg font-semibold">Daily Challenge</h2>
      <p className="text-sm text-muted-foreground">Every click starts a fresh Daily Challenge using today's live content and stages. Your official streak and Daily result remain intact.</p>
      <Button onClick={createRun} disabled={busy} data-testid="creator-replay-new">
        {busy ? "Creating take…" : "Record a new take"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    <Link className="text-sm underline" to="/admin/leaguecraft">Back to Leaguecraft Admin</Link>
  </main>;
}
