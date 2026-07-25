# Stat Check — Human Playtest Protocol

## Setup

- Route: `/dev/stat-check` on the mogsy dev server (`npm run dev`, then e.g. `http://localhost:8080/dev/stat-check`).
- Backend: the Combat API must be reachable (default `http://127.0.0.1:8000`, or set `VITE_COMBAT_API_URL`). The header badge should read **League Docs stats**. If it reads **Fixture deck**, the 172-champion roster did not load — matches will be 4-round exhaustion games and are not representative.
- Expected roster: 172 champions; the SHARED POOL counter starts at 160 after both hands are dealt.
- Restart: the **Restart** button (header, or on the match-over panel) starts a fresh deterministic match.
- Known prototype limitations: dev-visual prototype; Range and Movement Speed lanes tie often by design; the bot is deterministic and does not adapt to the player; no persistence — closing the tab loses the match.

## Required session

Play **at least three complete matches** (a match is ~15 rounds, expect 10–20 minutes each at 1x animation speed; the ANIM control can speed this up).

After each match, open **Playtest summary** on the match-over panel and record it (screenshot or copy).

## Questions after each match

1. How long did the match feel — too short, right, too long? At what round did it start dragging, if ever?
2. Did you understand why each lane was won or tied?
3. Did you understand every source of damage (board win, sweep, decisive)?
4. Did the next-family clue affect any card choice this match?
5. Did preserving a card for a clued family ever feel worthwhile?
6. Did the bot make any obviously irrational play?
7. Did Range produce frustrating ties?
8. Did Movement Speed produce frustrating ties?
9. Was placing cards easy and predictable (click and drag both)?
10. Did the hand or board ever become visually confusing?
11. Was any reveal step too fast or too slow?
12. Did you ever forget that played cards are permanently discarded?
13. Did the remaining shared-pool count matter to any decision?

## Final comparison questions (after all matches)

- Which category was most fun?
- Which category was least useful?
- Should the match be shorter, longer, or unchanged?
- Was the clue too weak, too strong, or appropriate?
- Was the bot too easy, too difficult, or appropriate?
- Would you immediately play another match?
- What was the single most confusing moment across the session?

## Observation checklist (for the person running the test)

Record objectively, per match:

- [ ] Rounds completed (from the playtest summary)
- [ ] Actual wall-clock duration
- [ ] Number of card-placement corrections (card returned or moved between lanes)
- [ ] Hesitation or comments around the Next Round Intel clue
- [ ] Any misreading of HIGH vs LOW lanes
- [ ] Any misunderstanding of decisive damage (asked "why +1?")
- [ ] Any attempt to reuse a discarded card
- [ ] Whether the player ever looked at / mentioned the shared-pool count
- [ ] Whether the tester verbally planned for a clued future family
