"""HUB6.3D: generate the Analytics Lab's History golden through HUB6.3B's REAL route.

The Analytics Lab's Daily facts are authored as raw facts in the frontend
(src/pages/dev/lobby-preview/history/analyticsLabFacts.ts) and built, in the
builder's PRODUCTION shape, into the tables HUB6.3B projects from:
daily_runs, daily_run_stages (with status + context), ranked_rounds (the
frozen recipe analytics_tag), ranked_segment_child_results (with module ids)
and daily_run_review_items (exact source -> replay links). This script seeds
exactly those rows into an in-memory SQLite database shaped like the
production tables (the same shape HUB6.3B's own synthetic test uses), then
drives HUB6.3B's actual GET /api/history/v1 route (routes/history.py ->
history/daily.project -> history/personal) through FastAPI's TestClient, with
identity, capability and clock overridden.

Every personal analytic in the golden (previous Daily, Core and stage
comparisons, averages, records, streaks, series, public categories,
exact-question history, strike attribution, Review sources, Weak Areas
selection) is computed by the backend's own code. The frontend never
re-implements it.

Read-only against the backend worktree: it imports modules; nothing on disk
in the backend is written.

Usage (from the frontend worktree):
  npx tsx scripts/hub63-export-analytics-lab-rows.ts <tmp>/lab-rows.json
  python scripts/hub63-generate-analytics-lab.py <backend_worktree> \
      <tmp>/lab-rows.json \
      src/pages/dev/lobby-preview/history/analyticsLab.golden.json
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

# The production tables HUB6.3B reads, restricted to the columns it selects
# (the same shape as the backend's test_hub6_3_personal_analytics.py::_db,
# plus the Review linkage columns HUB1 keeps).
SCHEMA = """
CREATE TABLE daily_runs (
  run_id TEXT PRIMARY KEY, user_id TEXT, policy TEXT, plan_date TEXT,
  plan_version INTEGER, status TEXT, stage_count INTEGER, completed_at TEXT);
CREATE TABLE daily_run_stages (
  run_id TEXT, stage_index INTEGER, stage_kind TEXT, ruleset_id TEXT,
  content_set_id TEXT, child_match_id TEXT, result_json TEXT,
  status TEXT, context_json TEXT, PRIMARY KEY(run_id, stage_index));
CREATE TABLE ranked_rounds (
  match_id TEXT, round_number INTEGER, segment_config_json TEXT,
  PRIMARY KEY(match_id, round_number));
CREATE TABLE ranked_segment_child_results (
  match_id TEXT, user_id TEXT, question_result_id TEXT,
  round_number INTEGER, challenge_index INTEGER,
  module_id TEXT, module_version INTEGER,
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
TABLES = ("daily_runs", "daily_run_stages", "ranked_rounds",
          "ranked_segment_child_results", "daily_run_review_items")


def seed(rows):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.executescript(SCHEMA)
    for table in TABLES:
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
    app.dependency_overrides[require_account_identity] = lambda: Identity(
        user_id=user, verified=True, is_anonymous=False, token="t")
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


def main():
    raw = open(INPUT, "rb").read()
    data = json.loads(raw)
    now = datetime.fromisoformat(data["anchor"].replace("Z", "+00:00"))
    limit = data["page_size"]
    lab = data["accounts"]["analytics_lab"]
    conn = seed(lab["rows"])
    user = lab["user_id"]
    scenarios = {
        "lab_premium": walk(client_for(conn, user, Cap(True), now), limit),
        "lab_free": walk(client_for(conn, user, Cap(False), now), limit),
        # Entitlement lookup failed: the route passes capability None.
        "lab_unavailable": walk(client_for(conn, user, None, now), limit),
    }
    commit = subprocess.run(["git", "-C", BACKEND, "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    golden = {
        "generated_by": "scripts/hub63-generate-analytics-lab.py",
        "hub6_3b_commit": commit,
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "scenarios": scenarios,
    }
    nl = chr(10)
    lines = [f"  {json.dumps(k)}: {json.dumps(golden[k], sort_keys=True, separators=(',', ':'))}"
             for k in ("generated_by", "hub6_3b_commit", "input_sha256")]
    scenario_lines = [f"    {json.dumps(k)}: {json.dumps(scenarios[k], sort_keys=True, separators=(',', ':'))}"
                      for k in sorted(scenarios)]
    body = ("," + nl).join(lines) + "," + nl + '  "scenarios": {' + nl + ("," + nl).join(scenario_lines) + nl + "  }"
    with open(OUT, "w", encoding="utf-8", newline=nl) as fh:
        fh.write("{" + nl + body + nl + "}" + nl)
    print("wrote", OUT, commit, {k: [len(p["items"]) for p in v] for k, v in scenarios.items()})


main()
