"""UX-7 — capture real E3B campaign responses from a LOCAL backend for the contract tests.

The E3B samples (`e3b-campaign-samples.json`, copied verbatim from the backend's
`fixtures/dynasty_campaign_e3b_samples.json`) cover 13 states. This adds the
live states the UX-7 runs found that the samples do not show:

  rematch_window        a playoff semifinal window: `story.stakes.rematch_of` is a list of
                        series indices, `story.rival.meetings` includes the open meeting (null score)
  abandoned_unsettled   a run abandoned in series 1: `roster` is null
  listing_all           GET /campaigns?include_finished=true over several runs

Usage (owner bearer for the local backend; nothing secret is written):

    UX7_TOKEN=<bearer> python -I scripts/dynasty/capture_ux7_e3b_live.py \
        --base http://127.0.0.1:8768 rematch_window=<campaign_id> abandoned_unsettled=<campaign_id>
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "src/lib/dynasty/e1/fixtures/e3b-live-capture.json"


def get(base: str, token: str, path: str):
    req = urllib.request.Request(f"{base}/api/admin/dynasty/v2{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8768")
    ap.add_argument("states", nargs="+", help="state=campaign_id")
    args = ap.parse_args()
    token = os.environ.get("UX7_TOKEN")
    if not token:
        sys.exit("UX7_TOKEN is required (an owner bearer for the LOCAL backend)")
    samples = []
    for spec in args.states:
        state, cid = spec.split("=", 1)
        status, body = get(args.base, token, f"/campaigns/{cid}")
        if status != 200:
            sys.exit(f"{state}: HTTP {status} {body}")
        samples.append({"state": state, "request": {"method": "GET", "path": f"/api/admin/dynasty/v2/campaigns/{cid}"}, "response": body})
    status, listing = get(args.base, token, "/campaigns?include_finished=true")
    samples.append({"state": "listing_all", "request": {"method": "GET", "path": "/api/admin/dynasty/v2/campaigns?include_finished=true"}, "response": listing})
    text = json.dumps({"source": "UX-7 live capture against E3B roguelike/wd-v2-e3b-campaign @ 80450127 (local scratch DB)", "samples": samples}, sort_keys=True, separators=(",", ":"))
    for bad in ("Bearer", "eyJ", "@example", "\"seed\""):
        if bad in text:
            sys.exit(f"refusing to write: found {bad!r} in the capture")
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(text)} bytes, {len(samples)} samples)")


if __name__ == "__main__":
    main()
