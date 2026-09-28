"""HUB6.3D/E: generate the Analytics Lab's History golden through the REAL route.

HUB6.3E: the backend is HUB6.3C (`claude/hub6-3-population`, 00c794cd) --
HUB6.3B personal analytics plus population aggregates and the Free strike
markers. See POPULATION below.

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

POPULATION (HUB6.3E). The lab input carries per-run population RECIPES
(src/pages/dev/lobby-preview/history/analyticsLabPopulation.ts): cohort sizes
and a target midrank percentile per subject/metric. For each lab Daily this
script
  1. runs HUB6.3C's own migration (migrate_history_population) on the lab DB;
  2. reads the player's REAL analytics keys and values with HUB6.3C's own
     population.load_observations (the same facts personal records use);
  3. builds, deterministically, a list of values around the player's value
     (quantile-spaced normal, its centre bisected so the player's midrank
     lands near the target; a tie spike or an outlier where the recipe asks);
  4. stores it with HUB6.3C's own population._write_date -> summarize
     (median, quantiles, privacy-merged histogram, frequency).
A cohort is only a list of values -- exactly what `summarize` receives in
production. No user rows, ids or records are created. A run whose recipe
says built=False gets no aggregate: the route reports aggregate_not_built.

Read-only against the backend worktree: it imports modules; nothing on disk
in the backend is written (the lab database is a temporary file).

Usage (from the frontend worktree):
  npx tsx scripts/hub63-export-analytics-lab-rows.ts <tmp>/lab-rows.json
  python scripts/hub63-generate-analytics-lab.py <backend_worktree> \
      <tmp>/lab-rows.json \
      src/pages/dev/lobby-preview/history/analyticsLab.golden.json
"""
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime
from statistics import NormalDist

BACKEND, INPUT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
sys.path.insert(0, BACKEND)
sys.dont_write_bytecode = True

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routes.history as history_route  # noqa: E402
from routes.supabase_auth import Identity, require_account_identity  # noqa: E402
from history import population  # noqa: E402
import migrate_history_population  # noqa: E402

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


def seed(rows, path):
    conn = sqlite3.connect(path, check_same_thread=False)
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


# ─────────────────────────────────────────────────────────── population

#: A metric's natural spread in the lab (one standard deviation) and bounds.
SPREAD = {
    ("core", "correct"): 10, ("core", "accuracy"): 0.085, ("core", "longest_streak"): 5,
    ("standard", "score"): 16, ("standard", "correct"): 2.2,
    ("standard", "accuracy"): 0.07, ("standard", "longest_streak"): 4,
    ("time_trial", "correct"): 4.5, ("time_trial", "questions_played"): 4,
    ("time_trial", "accuracy"): 0.08, ("time_trial", "longest_streak"): 4,
    ("survival", "depth"): 6, ("survival", "correct"): 5,
    ("survival", "accuracy"): 0.07, ("survival", "longest_streak"): 4,
}
UPPER = {("standard", "correct"): 22}
_Z = NormalDist()


def _quantize(x, metric, subject):
    if metric == "accuracy":
        return round(min(1.0, max(0.0, x)), 3)
    top = UPPER.get((subject, metric))
    value = max(0, int(round(x)))
    return min(top, value) if top is not None else value


def _midrank(values, v):
    below = sum(1 for x in values if x < v)
    equal = sum(1 for x in values if x == v)
    return (below + 0.5 * equal) / len(values)


def _spaced(n, centre, spread, metric, subject, cap=None):
    out = []
    for i in range(n):
        x = centre + spread * _Z.inv_cdf((i + 0.5) / n)
        if cap is not None:
            x = min(x, cap)
        out.append(_quantize(x, metric, subject))
    return out


def cohort_values(value, users, target, subject, metric, ties=None, outlier=False):
    """``users`` values (the player's own included) with the player's midrank
    near ``target``. Deterministic; no randomness."""
    spread = SPREAD[(subject, metric)]
    step = 0.001 if metric == "accuracy" else 1
    others = users - 1
    if ties:
        tied = max(0, int(round(ties * users)) - 1)
        below = _spaced(others - tied, value - 2.2 * spread, spread, metric, subject, cap=value - step)
        return sorted([value] * (tied + 1) + below)
    if outlier:
        rest = _spaced(others, value * 0.46, spread * 0.55, metric, subject, cap=value - 6 * step)
        return sorted([value] + rest)
    best, lo, hi = None, value - 12 * spread, value + 12 * spread
    for _ in range(60):
        centre = (lo + hi) / 2
        values = [value] + _spaced(others, centre, spread, metric, subject)
        pct = _midrank(values, value)
        if best is None or abs(pct - target) < best[0]:
            best = (abs(pct - target), values)
        if pct > target:
            lo = centre     # the player stands too high: move the others up
        else:
            hi = centre
    return sorted(best[1])


def seed_population(conn, recipes):
    """Aggregates for every recipe date, through HUB6.3C's own writer."""
    first = min(r["planDate"] for r in recipes)
    last = max(r["planDate"] for r in recipes)
    observations = {o["run_id"]: o for o in population.load_observations(conn, first, last)}
    conn.isolation_level = None          # _write_date issues BEGIN/COMMIT itself
    for recipe in recipes:
        if not recipe["built"]:
            continue
        obs = observations[recipe["runId"]]
        cohorts = {}
        for cohort_type, spec in sorted(recipe["cohorts"].items()):
            ties = spec.get("ties") or {}
            outlier = spec.get("outlier") or {}
            for subject, (key, values) in sorted(obs["subjects"].items()):
                users = (spec.get("usersBySubject") or {}).get(subject, spec["users"])
                metrics = {}
                for metric in population.METRICS[subject]:
                    value = values.get(metric)
                    if value is None:
                        continue
                    tied = (ties.get("subject"), ties.get("metric")) == (subject, metric)
                    metrics[metric] = cohort_values(
                        value, users, spec["targets"][subject][metric], subject, metric,
                        ties=ties.get("share") if tied else None,
                        outlier=(outlier.get("subject"), outlier.get("metric")) == (subject, metric))
                cohorts[(subject, key, cohort_type)] = metrics
        largest = max(spec["users"] for spec in recipe["cohorts"].values())
        population._write_date(conn, recipe["planDate"], cohorts,
                               recipe["planDate"] + "T23:30:00+00:00", largest)
    conn.isolation_level = ""


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
    workdir = tempfile.mkdtemp(prefix="hub63-lab-")
    path = os.path.join(workdir, "lab.sqlite3")
    conn = seed(lab["rows"], path)
    migrate_history_population.migrate(path)
    seed_population(conn, data["population"])
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
        "backend_commit": commit,
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "scenarios": scenarios,
    }
    nl = chr(10)
    lines = [f"  {json.dumps(k)}: {json.dumps(golden[k], sort_keys=True, separators=(',', ':'))}"
             for k in ("generated_by", "backend_commit", "input_sha256")]
    scenario_lines = [f"    {json.dumps(k)}: {json.dumps(scenarios[k], sort_keys=True, separators=(',', ':'))}"
                      for k in sorted(scenarios)]
    body = ("," + nl).join(lines) + "," + nl + '  "scenarios": {' + nl + ("," + nl).join(scenario_lines) + nl + "  }"
    with open(OUT, "w", encoding="utf-8", newline=nl) as fh:
        fh.write("{" + nl + body + nl + "}" + nl)
    print("wrote", OUT, commit, {k: [len(p["items"]) for p in v] for k, v in scenarios.items()})


main()
