"""HUB4 real-shape certification: drive HUB2's actual GET /api/history/v1
route (routes/history.py -> history/daily.project) through FastAPI's
TestClient against seeded in-memory data, and write the JSON responses.

Read-only against the backend worktree: it imports modules and seeds an
in-memory SQLite database; nothing on disk in the backend is written.

Usage — run with the HUB2 backend worktree as the working directory:
  cd <backend_worktree>
  python <frontend>/scripts/hub4-generate-history-golden.py <backend_worktree>       <frontend>/src/lib/history/__fixtures__/hub2-history-v1.golden.json
"""
import json
import sqlite3
import sys

BACKEND, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, BACKEND)
sys.dont_write_bytecode = True

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import routes.history as history_route  # noqa: E402
from routes.supabase_auth import Identity, require_account_identity  # noqa: E402
_connect = sqlite3.connect
sqlite3.connect = lambda *a, **k: _connect(*a, **{**k, "check_same_thread": False})
import test_history_analytics_b as hub2_tests  # noqa: E402

FIVE = ("standard", "time_trial", "survival", "weak_areas", "review")
FOUR = ("standard", "time_trial", "survival", "review")


class Cap:
    def __init__(self, trends):
        self.can_view_trends = trends


def seed_player(conn, user):
    """A first 4-stage run, then five compatible 5-stage runs with varied
    accuracy, terminal reasons and Review recovery."""
    hub2_tests._run(conn, 1, user=user, stages=FOUR, completed="2026-09-01T18:00:00+00:00",
                    answers=(True, False, True))
    patterns = [
        (True, False, False),
        (True, True, False),
        (True, False, True),
        (True, True, True),
        (True, True, False),
    ]
    for offset, answers in enumerate(patterns):
        number = offset + 2
        hub2_tests._run(conn, number, user=user, stages=FIVE,
                        completed=f"2026-09-{number:02d}T18:00:00+00:00", answers=answers)
    # Ruleset terminal reasons on the latest run's frozen results.
    for stage_index, ended in ((1, "time_bank_exhausted"), (2, "strikes_exhausted")):
        row = conn.execute("SELECT result_json FROM daily_run_stages WHERE run_id=? AND stage_index=?",
                           ("run-006", stage_index)).fetchone()
        result = json.loads(row["result_json"])
        result["ended_by"] = ended
        conn.execute("UPDATE daily_run_stages SET result_json=? WHERE run_id=? AND stage_index=?",
                     (json.dumps(result), "run-006", stage_index))
    for ordinal, outcome in enumerate(("correct", "correct", "incorrect", None)):
        conn.execute("INSERT INTO daily_run_review_items VALUES (?,?,?,?,?,?,?)",
                     ("run-006", ordinal, 0, "family", f"qr-6-0-{ordinal}",
                      f"qr-6-4-{ordinal}", outcome))
    conn.commit()


def client_for(conn, user, capability):
    app = FastAPI()
    app.include_router(history_route.router)
    app.dependency_overrides[require_account_identity] = lambda: Identity(
        user_id=user, token="t", is_anonymous=False) if "is_anonymous" in Identity.__dataclass_fields__ \
        else Identity(user_id=user, token="t")
    app.dependency_overrides[history_route.get_history_capability] = lambda: capability

    history_route.get_connection = lambda: _NoClose(conn)
    return TestClient(app)


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


def main():
    out = {}
    conn = hub2_tests._db()
    seed_player(conn, "u")

    premium = client_for(conn, "u", Cap(True))
    first = premium.get("/api/history/v1", params={"limit": 2})
    assert first.status_code == 200, first.text
    out["premium_page_1"] = first.json()
    second = premium.get("/api/history/v1", params={"limit": 2, "cursor": out["premium_page_1"]["next_cursor"]})
    out["premium_page_2"] = second.json()
    rest = premium.get("/api/history/v1", params={"limit": 50, "cursor": out["premium_page_2"]["next_cursor"]})
    out["premium_page_3"] = rest.json()

    free = client_for(conn, "u", Cap(False))
    out["free_page_1"] = free.get("/api/history/v1", params={"limit": 2}).json()

    unavailable = client_for(conn, "u", None)
    out["unavailable_page_1"] = unavailable.get("/api/history/v1", params={"limit": 1}).json()

    bad = premium.get("/api/history/v1", params={"cursor": "not-a-cursor"})
    out["invalid_cursor"] = {"status": bad.status_code, "body": bad.json()}

    newcomer_conn = hub2_tests._db()
    hub2_tests._run(newcomer_conn, 1, user="n", stages=FOUR, completed="2026-09-01T18:00:00+00:00")
    newcomer = client_for(newcomer_conn, "n", Cap(True))
    out["premium_newcomer"] = newcomer.get("/api/history/v1").json()

    empty = client_for(hub2_tests._db(), "e", Cap(True))
    out["empty"] = empty.get("/api/history/v1").json()

    # One page per line: diffable per scenario, half the size of indent=2.
    lines = [f"  {json.dumps(k)}: {json.dumps(out[k], sort_keys=True, separators=(',', ':'))}"
             for k in sorted(out)]
    nl = chr(10)
    with open(OUT, "w", encoding="utf-8", newline=nl) as fh:
        fh.write("{" + nl + ("," + nl).join(lines) + nl + "}" + nl)
    print("wrote", OUT, {k: len(v.get("items", [])) if isinstance(v, dict) and "items" in v else v.get("status") for k, v in out.items()})


main()
