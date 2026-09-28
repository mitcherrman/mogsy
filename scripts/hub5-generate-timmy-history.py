"""HUB5: generate Timmy's History golden through HUB2.1's REAL route.

Timmy's Daily facts are authored as raw facts in the frontend
(src/pages/dev/lobby-preview/history/timmyDailyFacts.ts) and built into the
four tables HUB2.1 projects from. This script seeds exactly those rows into an
in-memory SQLite database shaped like HUB1's persistence, then drives HUB2.1's
actual GET /api/history/v1 route (routes/history.py -> history/daily.project)
through FastAPI's TestClient, with identity, capability and clock overridden.

So every analytic in the golden (averages, deltas, trends, personal bests,
learning signals, Review recovery, capability states) is computed by the
backend's own code. The frontend never re-implements it.

Read-only against the backend worktree: it imports modules; nothing on disk
in the backend is written.

Usage (from the frontend worktree):
  npx tsx scripts/hub5-export-timmy-rows.ts <tmp>/timmy-rows.json
  python scripts/hub5-generate-timmy-history.py <backend_worktree> \
      <tmp>/timmy-rows.json \
      src/pages/dev/lobby-preview/history/timmyHistory.golden.json
"""
import hashlib
import json
import sqlite3
import subprocess
import sys
from datetime import datetime

BACKEND, INPUT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, BACKEND)
sys.dont_write_bytecode = True

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routes.history as history_route  # noqa: E402
from routes.supabase_auth import Identity, require_account_identity  # noqa: E402

# HUB1's persistence, restricted to the columns the projection reads plus the
# Review linkage columns HUB1 keeps (question_ref, source/review match ids).
SCHEMA = """
CREATE TABLE daily_runs (
  run_id TEXT PRIMARY KEY, user_id TEXT, policy TEXT, plan_date TEXT,
  plan_version INTEGER, status TEXT, stage_count INTEGER, completed_at TEXT);
CREATE TABLE daily_run_stages (
  run_id TEXT, stage_index INTEGER, stage_kind TEXT, ruleset_id TEXT,
  content_set_id TEXT, child_match_id TEXT, result_json TEXT,
  PRIMARY KEY(run_id, stage_index));
CREATE TABLE ranked_segment_child_results (
  match_id TEXT, user_id TEXT, question_result_id TEXT,
  round_number INTEGER, challenge_index INTEGER,
  outcome TEXT CHECK (outcome IN ('correct', 'incorrect', 'timeout')),
  canonical_question_ref TEXT, exact_question_key TEXT, family TEXT,
  concept TEXT, category TEXT, subject_kind TEXT, subject_key TEXT,
  subject_label TEXT, generator_version TEXT, source_version TEXT,
  source_artifact_id TEXT);
CREATE TABLE daily_run_review_items (
  run_id TEXT, ordinal INTEGER CHECK (ordinal >= 1), question_ref TEXT,
  source_stage_index INTEGER, source_match_id TEXT, family TEXT,
  source_question_result_id TEXT, review_match_id TEXT,
  review_question_result_id TEXT,
  review_outcome TEXT CHECK (review_outcome IN ('correct', 'incorrect', 'timeout')),
  PRIMARY KEY (run_id, ordinal));
"""


def seed(rows):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.executescript(SCHEMA)
    for table in ("daily_runs", "daily_run_stages", "ranked_segment_child_results",
                  "daily_run_review_items"):
        for row in rows[table]:
            cols = sorted(row)
            conn.execute(
                f"INSERT INTO {table} ({','.join(cols)}) VALUES ({','.join('?' for _ in cols)})",
                [row[c] for c in cols])
    conn.commit()
    conn.row_factory = sqlite3.Row
    return conn


class Cap:
    def __init__(self, trends):
        self.can_view_trends = trends


class _NoClose:
    def __init__(self, conn):
        self._conn = conn

    def __getattr__(self, name):
        return getattr(self._conn, name)

    @property
    def row_factory(self):
        return self._conn.row_factory

    @row_factory.setter
    def row_factory(self, value):
        self._conn.row_factory = value

    def close(self):
        pass


def client_for(conn, user, capability, now):
    app = FastAPI()
    app.include_router(history_route.router)
    extra = {"is_anonymous": False} if "is_anonymous" in getattr(Identity, "__dataclass_fields__", {}) else {}
    app.dependency_overrides[require_account_identity] = lambda: Identity(user_id=user, token="t", **extra)
    app.dependency_overrides[history_route.get_history_capability] = lambda: capability
    app.dependency_overrides[history_route.get_utc_now] = lambda: now
    history_route.get_connection = lambda: _NoClose(conn)
    return TestClient(app)


def walk(client, limit):
    """Every page, following the server's cursor exactly as the client does."""
    pages, cursor = [], None
    while True:
        params = {"limit": limit}
        if cursor:
            params["cursor"] = cursor
        response = client.get("/api/history/v1", params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        pages.append(page)
        cursor = page["next_cursor"]
        if not cursor:
            return pages


def probe_mixed_generator_versions(now):
    """REGRESSION (fixed in HUB2.2): one stage mixing a null generator_version
    (a curated bank question) with a named one (a generated Mastery slice).
    HUB2.1 raised TypeError in _stage_compat and failed the whole page.
    Must now answer 200; the script aborts otherwise.
    """
    conn = seed({
        "daily_runs": [{"run_id": "p-run", "user_id": "p", "policy": "official",
                        "plan_date": "2026-09-15", "plan_version": 1, "status": "completed",
                        "stage_count": 1, "completed_at": "2026-09-15T12:00:00.000Z"}],
        "daily_run_stages": [{"run_id": "p-run", "stage_index": 0, "stage_kind": "standard",
                              "ruleset_id": "standard", "content_set_id": None,
                              "child_match_id": "p-m", "result_json": json.dumps(
                                  {"score": 1, "ended_by": "completed",
                                   "ruleset": {"ruleset_id": "standard", "version": 3}})}],
        "ranked_segment_child_results": [
            {"match_id": "p-m", "user_id": "p", "question_result_id": f"p-q{i}",
             "round_number": i + 1, "challenge_index": 0, "outcome": "correct",
             "canonical_question_ref": ref, "exact_question_key": None, "family": "f",
             "concept": "c", "category": "c", "subject_kind": None, "subject_key": None,
             "subject_label": None, "generator_version": gen, "source_version": "s",
             "source_artifact_id": None}
            for i, (ref, gen) in enumerate((("quiz:curated", None), ("mastery:generated", "gen-1")))],
        "daily_run_review_items": [],
    })
    client = client_for(conn, "p", Cap(True), now)
    try:
        response = client.get("/api/history/v1")
        return f"HTTP {response.status_code}"
    except Exception as exc:  # TestClient re-raises the server exception
        return f"{type(exc).__name__}: {exc}"


def main():
    raw = open(INPUT, "rb").read()
    data = json.loads(raw)
    now = datetime.fromisoformat(data["anchor"].replace("Z", "+00:00"))
    limit = data["page_size"]
    accounts = data["accounts"]

    scenarios = {}
    timmy = accounts["timmy"]
    conn = seed(timmy["rows"])
    scenarios["timmy_premium"] = walk(client_for(conn, timmy["user_id"], Cap(True), now), limit)
    scenarios["timmy_free"] = walk(client_for(conn, timmy["user_id"], Cap(False), now), limit)
    # Entitlement lookup failed: the route passes capability None.
    scenarios["timmy_unavailable"] = walk(client_for(conn, timmy["user_id"], None, now), limit)

    first = accounts["first_daily"]
    scenarios["first_daily"] = walk(
        client_for(seed(first["rows"]), first["user_id"], Cap(True), now), limit)

    newcomer = accounts["newcomer"]
    scenarios["newcomer"] = walk(
        client_for(seed(newcomer["rows"]), newcomer["user_id"], Cap(True), now), limit)

    # HUB6.2 — full-length stage shapes, Premium.
    full = accounts["full_daily"]
    scenarios["full_daily"] = walk(
        client_for(seed(full["rows"]), full["user_id"], Cap(True), now), limit)

    commit = subprocess.run(["git", "-C", BACKEND, "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    probe = probe_mixed_generator_versions(now)
    print("regression (mixed null/named generator_version in one stage):", probe)
    assert probe == "HTTP 200", probe
    golden = {
        "generated_by": "scripts/hub5-generate-timmy-history.py",
        "hub2_commit": commit,
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "scenarios": scenarios,
    }
    nl = chr(10)
    lines = [f"  {json.dumps(k)}: {json.dumps(golden[k], sort_keys=True, separators=(',', ':'))}"
             for k in ("generated_by", "hub2_commit", "input_sha256")]
    scenario_lines = [f"    {json.dumps(k)}: {json.dumps(scenarios[k], sort_keys=True, separators=(',', ':'))}"
                      for k in sorted(scenarios)]
    body = ("," + nl).join(lines) + "," + nl + '  "scenarios": {' + nl + ("," + nl).join(scenario_lines) + nl + "  }"
    with open(OUT, "w", encoding="utf-8", newline=nl) as fh:
        fh.write("{" + nl + body + nl + "}" + nl)
    print("wrote", OUT, commit, {k: [len(p["items"]) for p in v] for k, v in scenarios.items()})


main()
